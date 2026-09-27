import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { AuthConfig } from '../auth.config';
import { OAuthCallbackException } from '../exceptions/oauth-callback.exception';

// error ระหว่าง Discord OAuth → กลับไปหน้า login (หรือหน้า My Account ถ้ากำลังผูกบัญชี) พร้อมรหัส error
@Catch()
export class OAuthRedirectFilter implements ExceptionFilter {
    private readonly logger = new Logger('Auth');

    constructor(private readonly cfg: AuthConfig) {}

    catch(exception: unknown, host: ArgumentsHost): void {
        const res = host.switchToHttp().getResponse<Response>();
        if (res.headersSent) return;
        const known = exception instanceof OAuthCallbackException ? exception : null;
        if (!known) this.logger.error(`Discord OAuth ล้มเหลว: ${exception instanceof Error ? exception.stack : String(exception)}`);
        const code = known?.code ?? 'discord_failed';
        const path = known?.flow?.mode === 'link' ? `/account?discord_error=${code}` : `/login?error=${code}`;
        res.redirect(this.cfg.dashboardPath(path));
    }
}
