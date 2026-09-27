import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AppRequest, AuditContext } from '../interfaces/app-request.interface';

// ชื่อ action ใน audit log ของ route นี้
export const AUDIT_ACTION_KEY = 'audit:action';
export const Audit = (action: string) => SetMetadata(AUDIT_ACTION_KEY, action);
export const SkipAudit = () => SetMetadata(AUDIT_ACTION_KEY, false);

// กล่องรายละเอียด audit log ของ request นี้ (แก้ค่าในนี้ได้เลย เช่น audit.extra = { before })
export const AuditCtx = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuditContext => {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    req.audit ??= {};
    return req.audit;
});
