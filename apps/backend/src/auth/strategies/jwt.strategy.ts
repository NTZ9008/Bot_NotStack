import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-jwt';
import type { User } from '../../generated/prisma/client';
import { TokensService } from '../tokens.service';
import type { AppRequest } from '../../common/interfaces/app-request.interface';
import { AuthConfig } from '../auth.config';
import { AUTH, JWT_STRATEGY } from '../auth.constants';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

// ==========================================
// 🔑 JWT STRATEGY — อ่าน access token จาก httpOnly cookie แล้วโหลดผู้ใช้ใส่ req.user
// token ต้องมี tokenVersion ตรงกับใน DB (เปลี่ยนรหัส / ออกจากระบบทุกเครื่อง / ปิดบัญชี = token เก่าใช้ไม่ได้ทันที)
// ==========================================
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, JWT_STRATEGY) {
    constructor(
        cfg: AuthConfig,
        private readonly tokens: TokensService,
    ) {
        super({
            jwtFromRequest: (req: Request) => (req.cookies as Record<string, string> | undefined)?.[cfg.cookie.access] ?? null,
            passReqToCallback: true,
            secretOrKey: cfg.jwtSecret,
            algorithms: ['HS256'],
            issuer: AUTH.JWT_ISSUER,
            audience: AUTH.JWT_AUDIENCE,
        });
    }

    async validate(req: AppRequest, payload: JwtPayload): Promise<User | false> {
        const user = await this.tokens.validateSession(payload.sid, Number(payload.sub), payload.tv);
        if (user) req.authSessionId = payload.sid;
        return user;
    }
}
