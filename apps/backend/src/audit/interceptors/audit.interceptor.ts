import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { AUDIT_ACTION_KEY } from '../../common/decorators/audit.decorator';
import type { AppRequest } from '../../common/interfaces/app-request.interface';

// อ่าน @Audit('...') / @SkipAudit() ของ route แล้วใส่ไว้ใน req.audit ให้ AuditRecorderMiddleware ใช้ตอนตอบกลับ
@Injectable()
export class AuditInterceptor implements NestInterceptor {
    constructor(private readonly reflector: Reflector) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        if (context.getType() === 'http') {
            const action = this.reflector.getAllAndOverride<string | false | undefined>(AUDIT_ACTION_KEY, [context.getHandler(), context.getClass()]);
            const req = context.switchToHttp().getRequest<AppRequest>();
            req.audit ??= {};
            if (action === false) req.audit.skip = true;
            else if (action && !req.audit.action) req.audit.action = action;
        }
        return next.handle();
    }
}
