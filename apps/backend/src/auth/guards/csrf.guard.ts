import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { AUTH_ERROR_CODES } from '@notstack/shared';
import { ApiException } from '../../common/exceptions/api.exception';
import type { AppRequest } from '../../common/interfaces/app-request.interface';
import { AuthConfig } from '../auth.config';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originHost(req: AppRequest): string | null {
    const value = req.get('origin') || req.get('referer');
    if (!value || value === 'null') return null;
    try {
        return new URL(value).host;
    } catch {
        return null;
    }
}

// ==========================================
// 🛡️ CSRF GUARD (global, ทำงานก่อน guard อื่น)
// request ที่แก้ข้อมูลผ่าน /api ต้องมาจากหน้า Dashboard ของเราเท่านั้น
// (เบราว์เซอร์ส่ง Origin มากับ fetch ที่ไม่ใช่ GET เสมอ และเว็บอื่นปลอมค่านี้ไม่ได้ —
//  เทียบแค่ host ไม่เทียบ http/https เพราะหลัง Nginx / Cloudflare ฝั่ง Node อาจเห็นเป็น http)
// ==========================================
@Injectable()
export class CsrfGuard implements CanActivate {
    constructor(private readonly cfg: AuthConfig) {}

    canActivate(context: ExecutionContext): boolean {
        if (context.getType() !== 'http') return true;
        const req = context.switchToHttp().getRequest<AppRequest>();
        if (SAFE_METHODS.has(req.method) || !req.originalUrl.startsWith('/api/')) return true;

        const host = originHost(req);
        if (!host || (host !== req.get('host') && !this.cfg.allowsHost(host))) {
            throw new ApiException(HttpStatus.FORBIDDEN, 'คำขอไม่ได้มาจากหน้า Dashboard (ป้องกัน CSRF)', AUTH_ERROR_CODES.badOrigin);
        }
        return true;
    }
}
