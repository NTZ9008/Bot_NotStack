import { ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { AUTH_ERROR_CODES } from '@notstack/shared';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { ApiException } from '../../common/exceptions/api.exception';
import { JWT_STRATEGY } from '../auth.constants';

// ==========================================
// 🛡️ JWT AUTH GUARD (global) — ทุก route ต้อง login ยกเว้น @Public()
// route ที่เป็น @Public() ยังอ่าน token ให้ถ้ามี (เช่น logout / เริ่มผูก Discord) แต่ไม่ปฏิเสธถ้าไม่มี
// ==========================================
@Injectable()
export class JwtAuthGuard extends AuthGuard(JWT_STRATEGY) {
    constructor(private readonly reflector: Reflector) {
        super();
    }

    override async canActivate(context: ExecutionContext): Promise<boolean> {
        if (context.getType() !== 'http') return true;
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
        try {
            return (await super.canActivate(context)) as boolean;
        } catch (err) {
            if (isPublic) return true;
            throw err;
        }
    }

    // token หมดอายุ/ไม่ถูกต้อง = ยังไม่ได้ login (หน้าเว็บจะเรียก /api/auth/refresh เองเมื่อได้ 401)
    override handleRequest<TUser>(err: unknown, user: TUser | false): TUser {
        if (err) throw err;
        if (!user) throw new ApiException(HttpStatus.UNAUTHORIZED, 'Unauthorized. Please login.', AUTH_ERROR_CODES.unauthenticated);
        return user;
    }
}
