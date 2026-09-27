import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import type { AppRequest } from '../../common/interfaces/app-request.interface';
import type { User } from '../../generated/prisma/client';
import { AuthService } from '../auth.service';
import { LOCAL_STRATEGY } from '../auth.constants';

// ==========================================
// 🔐 LOCAL STRATEGY — username + password (POST /api/auth/login)
// ผิดกี่ครั้งถึงล็อกบัญชี / บัญชีถูกปิด / บันทึก audit log อยู่ใน AuthService.validatePasswordLogin
// ==========================================
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, LOCAL_STRATEGY) {
    constructor(private readonly auth: AuthService) {
        super({ usernameField: 'username', passwordField: 'password', passReqToCallback: true });
    }

    validate(req: AppRequest, username: string, password: string): Promise<User> {
        return this.auth.validatePasswordLogin(req, username, password);
    }
}
