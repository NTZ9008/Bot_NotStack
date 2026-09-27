import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_ERROR_CODES, type UserRole } from '@notstack/shared';
import { HttpStatus } from '@nestjs/common';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { ApiException } from '../../common/exceptions/api.exception';
import type { AppRequest } from '../../common/interfaces/app-request.interface';

// ตรวจ role ตาม @Roles(...) / @AdminOnly() (global — ทำงานหลัง JwtAuthGuard)
@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        if (context.getType() !== 'http') return true;
        const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [context.getHandler(), context.getClass()]);
        if (!roles?.length) return true;
        const user = context.switchToHttp().getRequest<AppRequest>().user;
        if (!user || !roles.includes(user.role)) {
            throw new ApiException(HttpStatus.FORBIDDEN, 'ต้องเป็นผู้ดูแลระบบ (ADMIN) เท่านั้น', AUTH_ERROR_CODES.forbidden);
        }
        return true;
    }
}
