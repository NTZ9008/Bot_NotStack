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
    { status: 'ok'; user: User; raw: string; sessionId: string } | { status: 'rotated' } | { status: 'reused'; user: User } | { status: 'invalid' };
const hashToken = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');
const newRawToken = () => crypto.randomBytes(32).toString('base64url');
const truncate = (value: string | undefined, max: number) => (typeof value === 'string' ? value.slice(0, max) : null);

@Injectable()
export class TokensService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwt: JwtService,
        private readonly cfg: AuthConfig,
    ) {}

    signAccessToken(user: User, sessionId: string): string {
        return this.jwt.sign(
            { role: user.role, tv: user.tokenVersion, sid: sessionId },
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

    async issueRefreshToken(user: User, { ip, userAgent }: RequestContext = {}): Promise<{ raw: string; sessionId: string }> {
        const raw = newRawToken();
        const now = Date.now();
        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(now + AUTH.REFRESH_TOKEN_TTL_MS);
        await this.prisma.$transaction(async (tx) => {
            // Persist the version that was authenticated: a concurrent reset invalidates this session too.
            await tx.authSession.create({
                data: {
                    id: sessionId,
                    userId: user.id,
                    tokenVersion: user.tokenVersion,
                    expiresAt,
                    absoluteExpiresAt: new Date(now + AUTH.ABSOLUTE_SESSION_TTL_MS),
                },
            });
            await tx.refreshToken.create({
                data: { userId: user.id, tokenHash: hashToken(raw), familyId: sessionId, expiresAt, ip: truncate(ip, 64), userAgent: truncate(userAgent, 255) },
            });
        });
        return { raw, sessionId };
    }

    async validateSession(sessionId: string, userId: number, version: number): Promise<User | false> {
        if (!sessionId || !Number.isSafeInteger(userId) || !Number.isSafeInteger(version)) return false;
        const session = await this.prisma.authSession.findUnique({ where: { id: sessionId }, include: { user: true } });
        const now = Date.now();
        if (
            !session ||
            session.userId !== userId ||
            session.revokedAt ||
            session.expiresAt.getTime() <= now ||
            session.absoluteExpiresAt.getTime() <= now ||
            !session.user.isActive ||
            session.tokenVersion !== version ||
            session.user.tokenVersion !== version
        )
            return false;
        return session.user;
    }

    async rotateRefreshToken(raw: string, { ip, userAgent }: RequestContext = {}): Promise<RotateResult> {
        if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) return { status: 'invalid' };
        const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(raw) } });
        if (!record) return { status: 'invalid' };
        return this.prisma.$transaction(async (tx): Promise<RotateResult> => {
            // A session row is the lock shared with logout, so a newly rotated token cannot survive revocation.
            await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id = ${record.familyId} FOR UPDATE`;
            const session = await tx.authSession.findUnique({ where: { id: record.familyId }, include: { user: true } });
            const current = await tx.refreshToken.findUnique({ where: { id: record.id } });
            const now = Date.now();
            if (
                !session ||
                !current ||
                session.revokedAt ||
                session.expiresAt.getTime() <= now ||
                session.absoluteExpiresAt.getTime() <= now ||
                !session.user.isActive ||
                session.tokenVersion !== session.user.tokenVersion
            )
                return { status: 'invalid' };
            if (current.revokedAt) {
                if (!current.replacedById) return { status: 'invalid' };
                if (now - current.revokedAt.getTime() < AUTH.REFRESH_REUSE_GRACE_MS) return { status: 'rotated' };
                await tx.authSession.update({ where: { id: session.id }, data: { revokedAt: new Date(now) } });
                return { status: 'reused', user: session.user };
            }
            if (current.expiresAt.getTime() <= now) return { status: 'invalid' };
            const nextRaw = newRawToken();
            const nextId = crypto.randomUUID();
            const expiresAt = new Date(Math.min(now + AUTH.REFRESH_TOKEN_TTL_MS, session.absoluteExpiresAt.getTime()));
            await tx.refreshToken.update({ where: { id: current.id }, data: { revokedAt: new Date(now), replacedById: nextId } });
            await tx.refreshToken.create({
                data: {
                    id: nextId,
                    userId: session.userId,
                    tokenHash: hashToken(nextRaw),
                    familyId: session.id,
                    expiresAt,
                    ip: truncate(ip, 64),
                    userAgent: truncate(userAgent, 255),
                },
            });
            await tx.authSession.update({ where: { id: session.id }, data: { expiresAt } });
            return { status: 'ok', user: session.user, raw: nextRaw, sessionId: session.id };
        });
    }

    async revokeRefreshToken(raw: string) {
        const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(raw) } });
        return record ? this.revokeFamily(record.familyId) : { count: 0 };
    }
    revokeFamily(familyId: string) {
        return this.prisma.authSession.updateMany({ where: { id: familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    revokeAllForUser(userId: number) {
        return this.prisma.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    async deleteExpired() {
        await this.prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
        return this.prisma.authSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    }
    get cookieBase(): CookieOptions {
        return { httpOnly: true, secure: this.cfg.isProduction };
    }
    private get accessCookie(): CookieOptions {
        return { ...this.cookieBase, sameSite: 'lax', path: '/' };
    }
    private get refreshCookie(): CookieOptions {
        return { ...this.cookieBase, sameSite: 'strict', path: '/api/auth' };
    }
    setAuthCookies(res: Response, accessToken: string, refreshRaw: string): void {
        res.cookie(this.cfg.cookie.access, accessToken, { ...this.accessCookie, maxAge: AUTH.ACCESS_TOKEN_TTL_SEC * 1000 });
        res.cookie(this.cfg.cookie.refresh, refreshRaw, { ...this.refreshCookie, maxAge: AUTH.REFRESH_TOKEN_TTL_MS });
        res.setHeader('Cache-Control', 'no-store');
    }
    clearAuthCookies(res: Response): void {
        res.clearCookie(this.cfg.cookie.access, this.accessCookie);
        res.clearCookie(this.cfg.cookie.refresh, this.refreshCookie);
        res.clearCookie(this.cfg.cookie.oauthState, { ...this.cookieBase, sameSite: 'lax', path: '/api/auth/discord' });
    }
}
