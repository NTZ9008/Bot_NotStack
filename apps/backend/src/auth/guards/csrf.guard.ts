import { CanActivate, ExecutionContext, HttpStatus, Injectable, Logger, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_ERROR_CODES } from '@notstack/shared';
import { ApiException } from '../../common/exceptions/api.exception';
import type { AppRequest } from '../../common/interfaces/app-request.interface';
import { AuthConfig } from '../auth.config';

const SIGNED_WEBHOOK = 'auth:signed-webhook';
// Only handlers that authenticate the raw body with HMAC may use this exemption.
export const SignedWebhook = () => SetMetadata(SIGNED_WEBHOOK, true);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
    private readonly logger = new Logger('Security');
    constructor(
        private readonly cfg: AuthConfig,
        private readonly reflector: Reflector,
    ) {}

    canActivate(context: ExecutionContext): boolean {
        if (context.getType() !== 'http') return true;
        const req = context.switchToHttp().getRequest<AppRequest>();
        if (SAFE_METHODS.has(req.method)) return true;
        if (this.reflector.getAllAndOverride<boolean>(SIGNED_WEBHOOK, [context.getHandler(), context.getClass()])) return true;
        let origin: string | null = null;
        try {
            const value = req.get('origin') || req.get('referer');
            if (value) origin = new URL(value).origin;
        } catch {
            /* Invalid and opaque origins are rejected. */
        }
        if (!origin || !this.cfg.allowsOrigin(origin)) {
            this.logger.warn(JSON.stringify({ event: 'csrf_rejected', ip: req.ip }));
            throw new ApiException(HttpStatus.FORBIDDEN, 'คำขอไม่ได้มาจากหน้า Dashboard (ป้องกัน CSRF)', AUTH_ERROR_CODES.badOrigin);
        }
        return true;
    }
}
