import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { CookieOptions, Response } from 'express';
import type { User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthConfig } from './auth.config';
import { AUTH } from './auth.constants';
import type { RequestContext } from './interfaces/discord-profile.interface';

export type RotateResult =
    | { status: 'ok'; user: User; raw: string }
    | { status: 'rotated' }
    | { status: 'reused'; user: User }
    | { status: 'invalid' };

const hashToken = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');
const newRawToken = () => crypto.randomBytes(32).toString('base64url');
const truncate = (value: string | undefined, max: number) => (typeof value === 'string' ? value.slice(0, max) : null);

// ==========================================
// 🎟️ TOKENS — JWT access token + refresh token แบบหมุนเวียน (rotation)
// - access token: JWT (HS256) อายุ 15 นาที อยู่ใน httpOnly cookie ไม่มี JS ตัวไหนอ่านได้ (ตรวจใน JwtStrategy)
// - refresh token: ค่าสุ่ม 256 บิต เก็บใน DB แค่ SHA-256 — ใช้แล้วออกใบใหม่ทุกครั้ง
//   ถ้าใบเก่าที่ถูกแทนไปแล้วถูกนำกลับมาใช้ = โดนขโมย → ยกเลิกทั้ง family ทันที
// ==========================================
@Injectable()
export class TokensService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwt: JwtService,
        private readonly cfg: AuthConfig,
    ) {}

    // tv (token version) ต้องตรงกับใน DB — เพิ่มค่าเมื่อไหร่ access token เก่าทุกใบของผู้ใช้นั้นใช้ไม่ได้ทันที
    signAccessToken(user: User): string {
        return this.jwt.sign(
            { role: user.role, tv: user.tokenVersion },
            {
                secret: this.cfg.jwtSecret,
                algorithm: 'HS256',
                expiresIn: AUTH.ACCESS_TOKEN_TTL_SEC,
                issuer: AUTH.JWT_ISSUER,
                audience: AUTH.JWT_AUDIENCE,
                subject: String(user.id),
                jwtid: crypto.randomUUID(),
            },
        );
    }

    async issueRefreshToken(userId: number, { familyId, ip, userAgent }: RequestContext & { familyId?: string } = {}): Promise<string> {
        const raw = newRawToken();
        await this.prisma.refreshToken.create({
            data: {
                userId,
                tokenHash: hashToken(raw),
                familyId: familyId || crypto.randomUUID(),
                expiresAt: new Date(Date.now() + AUTH.REFRESH_TOKEN_TTL_MS),
                ip: truncate(ip, 64),
                userAgent: truncate(userAgent, 255),
            },
        });
        return raw;
    }

    // แลก refresh token ใบเดิมเป็นใบใหม่
    async rotateRefreshToken(raw: string, { ip, userAgent }: RequestContext = {}): Promise<RotateResult> {
        const record = await this.prisma.refreshToken.findUnique({
            where: { tokenHash: hashToken(raw) },
            include: { user: true },
        });
        if (!record) return { status: 'invalid' };

        const now = Date.now();
        if (record.revokedAt) {
            // ใบที่ถูก logout ไปแล้ว (ไม่มีใบใหม่มาแทน) — แค่หมดอายุ ไม่ใช่การขโมย
            if (!record.replacedById) return { status: 'invalid' };
            // เพิ่งถูกแทนไม่กี่วินาที (เช่นเปิดหลายแท็บแล้ว refresh พร้อมกัน) — ให้ฝั่งเว็บใช้ cookie ใบใหม่ที่อีกแท็บได้ไป
            if (now - record.revokedAt.getTime() < AUTH.REFRESH_REUSE_GRACE_MS) return { status: 'rotated' };
            await this.revokeFamily(record.familyId);
            return { status: 'reused', user: record.user };
        }
        if (record.expiresAt.getTime() <= now || !record.user.isActive) return { status: 'invalid' };

        const nextRaw = newRawToken();
        const nextId = crypto.randomUUID();
        const rotated = await this.prisma.$transaction(async (tx) => {
            // มีเงื่อนไข revokedAt: null → ถ้า 2 request หมุนใบเดียวกันพร้อมกัน จะมีแค่ request เดียวที่สำเร็จ
            const { count } = await tx.refreshToken.updateMany({
                where: { id: record.id, revokedAt: null },
                data: { revokedAt: new Date(now), replacedById: nextId },
            });
            if (count === 0) return false;
            await tx.refreshToken.create({
                data: {
                    id: nextId,
                    userId: record.userId,
                    tokenHash: hashToken(nextRaw),
                    familyId: record.familyId,
                    expiresAt: new Date(now + AUTH.REFRESH_TOKEN_TTL_MS),
                    ip: truncate(ip, 64),
                    userAgent: truncate(userAgent, 255),
                },
            });
            return true;
        });
        if (!rotated) return { status: 'rotated' };
        return { status: 'ok', user: record.user, raw: nextRaw };
    }

    revokeRefreshToken(raw: string) {
        return this.prisma.refreshToken.updateMany({
            where: { tokenHash: hashToken(raw), revokedAt: null },
            data: { revokedAt: new Date() },
        });
    }

    revokeFamily(familyId: string) {
        return this.prisma.refreshToken.updateMany({
            where: { familyId, revokedAt: null },
            data: { revokedAt: new Date() },
        });
    }

    revokeAllForUser(userId: number) {
        return this.prisma.refreshToken.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
        });
    }

    // ใบที่หมดอายุแล้วเก็บไว้ก็ไม่มีประโยชน์ (ตรวจการใช้ซ้ำได้แค่ช่วงที่ยังไม่หมดอายุ)
    deleteExpired() {
        return this.prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    }

    // --- Cookies ---
    get cookieBase(): CookieOptions {
        return { httpOnly: true, secure: this.cfg.isProduction };
    }

    // Lax: ส่งไปกับการเปิดลิงก์ Dashboard จากที่อื่น (เช่นกดจาก Discord / redirect กลับจาก OAuth) ได้ แต่ไม่ส่งกับ POST ข้ามเว็บ
    private get accessCookie(): CookieOptions {
        return { ...this.cookieBase, sameSite: 'lax', path: '/' };
    }

    // Strict + จำกัด path: refresh token ถูกส่งเฉพาะตอนหน้าเว็บของเราเองเรียก /api/auth/* เท่านั้น
    private get refreshCookie(): CookieOptions {
        return { ...this.cookieBase, sameSite: 'strict', path: '/api/auth' };
    }

    setAuthCookies(res: Response, accessToken: string, refreshRaw: string): void {
        res.cookie(this.cfg.cookie.access, accessToken, { ...this.accessCookie, maxAge: AUTH.ACCESS_TOKEN_TTL_SEC * 1000 });
        res.cookie(this.cfg.cookie.refresh, refreshRaw, { ...this.refreshCookie, maxAge: AUTH.REFRESH_TOKEN_TTL_MS });
    }

    clearAuthCookies(res: Response): void {
        res.clearCookie(this.cfg.cookie.access, this.accessCookie);
        res.clearCookie(this.cfg.cookie.refresh, this.refreshCookie);
    }
}
