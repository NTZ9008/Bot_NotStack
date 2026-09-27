import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-jwt';
import type { User } from '../../generated/prisma/client';
import { UsersService } from '../../users/users.service';
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
        private readonly users: UsersService,
    ) {
        super({
            jwtFromRequest: (req: Request) => (req.cookies as Record<string, string> | undefined)?.[cfg.cookie.access] ?? null,
            secretOrKey: cfg.jwtSecret,
            algorithms: ['HS256'],
            issuer: AUTH.JWT_ISSUER,
            audience: AUTH.JWT_AUDIENCE,
        });
    }

    async validate(payload: JwtPayload): Promise<User | false> {
        const user = await this.users.getCached(Number(payload.sub));
        if (!user || !user.isActive || user.tokenVersion !== payload.tv) return false;
        return user;
    }
}
