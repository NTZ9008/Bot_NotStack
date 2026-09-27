import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthConfig } from './auth.config';
import { AUTH } from './auth.constants';
import type { DiscordProfile, OAuthFlow } from './interfaces/discord-profile.interface';
import type { OAuthMode, OAuthStatePayload } from './interfaces/jwt-payload.interface';

const DISCORD_API = 'https://discord.com/api/v10';
const AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const REQUEST_TIMEOUT_MS = 10 * 1000;

// ==========================================
// 🎮 DISCORD OAUTH2 (Authorization Code Grant)
// ขอแค่ scope "identify" (id / ชื่อ / avatar) — ไม่เก็บ access token ของ Discord ไว้ที่ไหนเลย
// สิทธิ์จัดการเซิร์ฟเวอร์ตรวจสดจากตัวบอทเอง (สมาชิกคนนี้มีสิทธิ์ Manage Server ไหม) ไม่ต้องใช้ scope "guilds"
// ==========================================
@Injectable()
export class DiscordOAuthService {
    // state ที่ใช้ไปแล้ว → เวลาหมดอายุ (ms) — ใช้ซ้ำไม่ได้แม้ cookie ยังไม่หมดอายุ
    private readonly usedStates = new Map<string, number>();

    constructor(
        private readonly cfg: AuthConfig,
        private readonly jwt: JwtService,
    ) {}

    // state สุ่มใหม่ทุกครั้ง: เก็บคู่กับโหมด (login / link) ใน cookie ที่เซ็นด้วย JWT_SECRET
    // ตอน callback ต้องตรงกับ ?state= ที่ Discord ส่งกลับมา — กันคนอื่นหลอกให้เรา login เป็นบัญชีของเขา
    createState(mode: OAuthMode, userId: number | null = null): { state: string; cookie: string } {
        const state = crypto.randomBytes(24).toString('base64url');
        const cookie = this.jwt.sign(
            { s: state, m: mode, uid: userId },
            {
                secret: this.cfg.jwtSecret,
                algorithm: 'HS256',
                expiresIn: AUTH.OAUTH_STATE_TTL_SEC,
                issuer: AUTH.JWT_ISSUER,
                audience: AUTH.OAUTH_STATE_AUDIENCE,
            },
        );
        return { state, cookie };
    }

    // คืน { mode, userId } หรือ null ถ้า cookie หาย/หมดอายุ/state ไม่ตรง/เคยใช้แล้ว
    verifyState(cookie: unknown, state: unknown): OAuthFlow | null {
        if (typeof cookie !== 'string' || !cookie || typeof state !== 'string') return null;
        let payload: OAuthStatePayload;
        try {
            payload = this.jwt.verify<OAuthStatePayload>(cookie, {
                secret: this.cfg.jwtSecret,
                algorithms: ['HS256'],
                issuer: AUTH.JWT_ISSUER,
                audience: AUTH.OAUTH_STATE_AUDIENCE,
            });
        } catch {
            return null;
        }
        const expected = Buffer.from(String(payload.s));
        const actual = Buffer.from(state);
        if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
        if (!this.markStateUsed(payload.s, (payload.exp ?? 0) * 1000)) return null;
        return { mode: payload.m, userId: payload.uid };
    }

    private markStateUsed(state: string, expiresAtMs: number): boolean {
        const now = Date.now();
        for (const [key, exp] of this.usedStates) if (exp <= now) this.usedStates.delete(key);
        if (this.usedStates.has(state)) return false;
        this.usedStates.set(state, expiresAtMs);
        return true;
    }

    buildAuthorizeUrl(state: string): string {
        const params = new URLSearchParams({
            client_id: this.cfg.discord.clientId,
            redirect_uri: this.cfg.discord.redirectUri ?? '',
            response_type: 'code',
            scope: 'identify',
            state,
            prompt: 'none', // เคยอนุญาตแล้วไม่ต้องกดยืนยันซ้ำ
        });
        return `${AUTHORIZE_URL}?${params}`;
    }

    // แลก code เป็นข้อมูลผู้ใช้ Discord
    async fetchProfile(code: string): Promise<DiscordProfile> {
        const token = await this.request<{ access_token: string }>(`${DISCORD_API}/oauth2/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: this.cfg.discord.clientId,
                client_secret: this.cfg.discord.clientSecret ?? '',
                grant_type: 'authorization_code',
                code,
                redirect_uri: this.cfg.discord.redirectUri ?? '',
            }),
        });
        const user = await this.request<{ id: string; username: string; global_name?: string | null; avatar?: string | null }>(
            `${DISCORD_API}/users/@me`,
            { headers: { Authorization: `Bearer ${token.access_token}` } },
        );
        return {
            id: user.id,
            username: user.username,
            globalName: user.global_name || null,
            avatarUrl: avatarUrlOf(user),
        };
    }

    private async request<T>(url: string, init: RequestInit): Promise<T> {
        const res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        if (!res.ok) {
            const detail = await res.text().catch(() => '');
            throw new Error(`Discord ${res.status}: ${detail.slice(0, 200)}`);
        }
        return (await res.json()) as T;
    }
}

function avatarUrlOf(user: { id: string; avatar?: string | null }): string {
    if (user.avatar) {
        const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
        return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=128`;
    }
    // ระบบชื่อใหม่ของ Discord (ไม่มี discriminator) ใช้ (id >> 22) % 6 เลือก avatar เริ่มต้น
    return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(user.id) >> 22n) % 6n)}.png`;
}
