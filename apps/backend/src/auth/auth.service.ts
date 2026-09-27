import { HttpStatus, Injectable } from '@nestjs/common';
import {
    AUTH_ERROR_CODES,
    isValidUsername,
    loginSchema,
    normalizeUsername,
    validatePassword,
    type LoginResponse,
    type SuccessResponse,
} from '@notstack/shared';
import type { Response } from 'express';
import { AuditService } from '../audit/audit.service';
import { ApiException, badRequest } from '../common/exceptions/api.exception';
import type { AppRequest } from '../common/interfaces/app-request.interface';
import type { User } from '../generated/prisma/client';
import { publicUser } from '../users/user.mapper';
import { UsersService } from '../users/users.service';
import { AuthConfig } from './auth.config';
import { AUTH } from './auth.constants';
import { DiscordOAuthService } from './discord-oauth.service';
import type { DiscordAuthResult } from './interfaces/discord-profile.interface';
import type { OAuthMode } from './interfaces/jwt-payload.interface';
import { TokensService } from './tokens.service';

const requestContext = (req: AppRequest) => ({ ip: req.ip, userAgent: req.get('user-agent') });

// เก็บ username ที่พิมพ์ผิดไว้ใน audit log เฉพาะที่หน้าตาเป็น username จริง (กันเผลอเก็บรหัสผ่านที่พิมพ์ผิดช่อง)
function attemptedUsername(value: string): string {
    const username = normalizeUsername(value);
    return isValidUsername(username) ? username : '(invalid)';
}

// ==========================================
// 🔑 AUTH SERVICE — session (access + refresh token), login ด้วยรหัสผ่าน, Discord OAuth
// ==========================================
@Injectable()
export class AuthService {
    constructor(
        private readonly cfg: AuthConfig,
        private readonly tokens: TokensService,
        private readonly users: UsersService,
        private readonly oauth: DiscordOAuthService,
        private readonly audit: AuditService,
    ) {}

    // ออก access + refresh token ชุดใหม่ (family ใหม่ = อุปกรณ์/การ login ใหม่)
    async startSession(req: AppRequest, res: Response, user: User): Promise<void> {
        const refreshRaw = await this.tokens.issueRefreshToken(user.id, requestContext(req));
        this.tokens.setAuthCookies(res, this.tokens.signAccessToken(user), refreshRaw);
    }

    // --- Username / Password (เรียกจาก LocalStrategy) ---
    async validatePasswordLogin(req: AppRequest, rawUsername: unknown, rawPassword: unknown): Promise<User> {
        const parsed = loginSchema.safeParse({ username: rawUsername, password: rawPassword });
        if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
        const { username, password } = parsed.data;

        const result = await this.users.verifyPasswordLogin(username, password);
        if (result.ok) return result.user;

        await this.audit.audit(req, {
            action: 'auth.login_failed',
            actor: result.user ?? null,
            success: false,
            metadata: { method: 'password', reason: result.reason, username: attemptedUsername(username) },
        });
        if (result.justLocked && result.user) {
            await this.audit.audit(req, { action: 'auth.account_locked', actor: result.user, success: false, metadata: { until: result.lockedUntil } });
        }
        if (result.reason === 'locked') {
            throw new ApiException(HttpStatus.LOCKED, 'บัญชีถูกล็อกชั่วคราวเพราะใส่รหัสผ่านผิดหลายครั้ง', undefined, { lockedUntil: result.lockedUntil });
        }
        if (result.reason === 'disabled') throw new ApiException(HttpStatus.FORBIDDEN, 'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
        throw new ApiException(HttpStatus.UNAUTHORIZED, 'รหัสผ่านหรือชื่อผู้ใช้ไม่ถูกต้อง');
    }

    async completePasswordLogin(req: AppRequest, res: Response, user: User): Promise<LoginResponse> {
        await this.startSession(req, res, user);
        await this.audit.audit(req, { action: 'auth.login', actor: user, metadata: { method: 'password' } });
        return { success: true, user: publicUser(user) };
    }

    // --- ต่ออายุ session (หน้าเว็บเรียกเองเมื่อ API ตอบ 401) ---
    async refresh(req: AppRequest, res: Response): Promise<LoginResponse> {
        const raw = (req.cookies as Record<string, string> | undefined)?.[this.cfg.cookie.refresh];
        if (!raw) throw new ApiException(HttpStatus.UNAUTHORIZED, 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่', AUTH_ERROR_CODES.noSession);

        const result = await this.tokens.rotateRefreshToken(raw, requestContext(req));
        switch (result.status) {
            case 'ok':
                this.tokens.setAuthCookies(res, this.tokens.signAccessToken(result.user), result.raw);
                return { success: true, user: publicUser(result.user) };
            case 'rotated':
                // อีกแท็บเพิ่ง refresh ไป — ไม่ล้าง cookie เพราะเบราว์เซอร์อาจได้ cookie ใบใหม่มาแล้ว
                throw new ApiException(HttpStatus.UNAUTHORIZED, 'Session ถูกต่ออายุจากแท็บอื่นแล้ว', AUTH_ERROR_CODES.tokenRotated);
            case 'reused':
                // refresh token ที่ถูกแทนไปนานแล้วโผล่มาใช้อีก = มีคนขโมย cookie → เตะออกทุกเครื่อง
                await this.users.bumpTokenVersion(result.user.id);
                await this.tokens.revokeAllForUser(result.user.id);
                await this.audit.audit(req, { action: 'auth.refresh_reuse_detected', actor: result.user, success: false });
                this.tokens.clearAuthCookies(res);
                throw new ApiException(HttpStatus.UNAUTHORIZED, 'ตรวจพบการใช้ session ซ้ำ กรุณาเข้าสู่ระบบใหม่', AUTH_ERROR_CODES.sessionRevoked);
            default:
                this.tokens.clearAuthCookies(res);
                throw new ApiException(HttpStatus.UNAUTHORIZED, 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่', AUTH_ERROR_CODES.noSession);
        }
    }

    async logout(req: AppRequest, res: Response): Promise<SuccessResponse> {
        const raw = (req.cookies as Record<string, string> | undefined)?.[this.cfg.cookie.refresh];
        if (raw) await this.tokens.revokeRefreshToken(raw);
        if (req.user) await this.audit.audit(req, { action: 'auth.logout' });
        this.tokens.clearAuthCookies(res);
        return { success: true };
    }

    // ออกจากระบบทุกอุปกรณ์ (รวมเครื่องนี้)
    async logoutAll(user: User, req: AppRequest, res: Response): Promise<SuccessResponse> {
        await this.users.bumpTokenVersion(user.id);
        await this.tokens.revokeAllForUser(user.id);
        await this.audit.audit(req, { action: 'auth.logout_all' });
        this.tokens.clearAuthCookies(res);
        return { success: true };
    }

    // เปลี่ยนรหัสผ่านตัวเอง — อุปกรณ์อื่นที่ login ค้างไว้จะถูกออกจากระบบ ส่วนเครื่องนี้ได้ session ใหม่
    async changePassword(user: User, body: { currentPassword: unknown; newPassword: unknown }, req: AppRequest, res: Response): Promise<SuccessResponse> {
        if (!user.passwordHash) {
            throw badRequest('บัญชีนี้ไม่มีรหัสผ่าน (เข้าสู่ระบบด้วย Discord) — ให้ผู้ดูแลระบบตั้งให้');
        }
        if (typeof body.currentPassword !== 'string' || !(await this.users.comparePassword(body.currentPassword, user.passwordHash))) {
            await this.audit.audit(req, { action: 'auth.password_change', success: false, metadata: { reason: 'wrong_current_password' } });
            throw badRequest('รหัสผ่านปัจจุบันไม่ถูกต้อง');
        }
        const invalid = validatePassword(body.newPassword);
        if (invalid) throw badRequest(invalid);

        const updated = await this.users.update(user.id, {
            passwordHash: await this.users.hashPassword(body.newPassword as string),
            tokenVersion: { increment: 1 },
        });
        await this.tokens.revokeAllForUser(user.id);
        await this.startSession(req, res, updated);
        await this.audit.audit(req, { action: 'auth.password_change', actor: updated });
        return { success: true };
    }

    // ==========================================
    // Discord OAuth2
    // login → สมัครให้อัตโนมัติถ้ายังไม่มีบัญชี (role USER — จัดการได้เฉพาะเซิร์ฟเวอร์ที่ตัวเองมีสิทธิ์ Manage Server)
    // link  → ผูก Discord เข้ากับบัญชีที่ login อยู่ (เพื่อให้ login ได้ทั้งสองทาง และให้ระบบรู้ว่าเป็นใครใน Discord)
    // ==========================================
    startDiscordFlow(res: Response, mode: OAuthMode, userId: number | null = null): void {
        const { state, cookie } = this.oauth.createState(mode, userId);
        res.cookie(this.cfg.cookie.oauthState, cookie, {
            ...this.tokens.cookieBase,
            sameSite: 'lax',
            path: '/api/auth/discord',
            maxAge: AUTH.OAUTH_STATE_TTL_SEC * 1000,
        });
        res.redirect(this.oauth.buildAuthorizeUrl(state));
    }

    // คืน path ของหน้า Dashboard ที่จะพาผู้ใช้ไปต่อ
    async completeDiscordFlow(req: AppRequest, res: Response, { flow, profile }: DiscordAuthResult): Promise<string> {
        if (flow.mode === 'link') {
            const user = flow.userId ? await this.users.findById(flow.userId) : null;
            if (!user || !user.isActive) return '/account?discord_error=account_disabled';
            const owner = await this.users.findByDiscordId(profile.id);
            if (owner && owner.id !== user.id) {
                await this.audit.audit(req, {
                    action: 'auth.discord_link',
                    actor: user,
                    success: false,
                    targetType: 'discord',
                    targetId: profile.id,
                    metadata: { reason: 'already_linked', discordUsername: profile.username },
                });
                return '/account?discord_error=discord_taken';
            }
            await this.users.linkDiscord(user.id, profile);
            await this.audit.audit(req, {
                action: 'auth.discord_link',
                actor: user,
                targetType: 'discord',
                targetId: profile.id,
                metadata: { discordUsername: profile.username },
            });
            return '/account?discord=linked';
        }

        let user = await this.users.findByDiscordId(profile.id);
        if (user) {
            user = await this.users.syncDiscordProfile(user.id, profile);
        } else {
            user = await this.users.createDiscordUser(profile);
            await this.audit.audit(req, {
                action: 'auth.discord_register',
                actor: user,
                targetType: 'user',
                targetId: user.id,
                metadata: { discordId: profile.id, discordUsername: profile.username, role: user.role },
            });
        }

        if (!user.isActive) {
            await this.audit.audit(req, { action: 'auth.login_failed', actor: user, success: false, metadata: { method: 'discord', reason: 'disabled' } });
            return '/login?error=account_disabled';
        }

        user = await this.users.recordLogin(user.id);
        await this.startSession(req, res, user);
        await this.audit.audit(req, { action: 'auth.login', actor: user, metadata: { method: 'discord' } });
        return '/';
    }

    // ยกเลิกการผูก Discord — ต้องมีรหัสผ่านอยู่ ไม่อย่างนั้นจะไม่เหลือทาง login
    async unlinkDiscord(user: User, req: AppRequest): Promise<SuccessResponse> {
        if (!user.discordId) throw badRequest('บัญชีนี้ยังไม่ได้เชื่อมต่อ Discord');
        if (!user.username || !user.passwordHash) {
            throw badRequest('ต้องมี username/รหัสผ่านก่อน จึงจะยกเลิกการเชื่อมต่อ Discord ได้');
        }
        await this.users.unlinkDiscord(user.id);
        await this.audit.audit(req, {
            action: 'auth.discord_unlink',
            targetType: 'discord',
            targetId: user.discordId,
            metadata: { discordUsername: user.discordUsername },
        });
        return { success: true };
    }
}
