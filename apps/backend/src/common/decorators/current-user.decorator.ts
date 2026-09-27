import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AppRequest } from '../interfaces/app-request.interface';

// ผู้ใช้ที่ login อยู่ (route ที่ไม่ได้เป็น @Public() มีค่าเสมอ)
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
    return ctx.switchToHttp().getRequest<AppRequest>().user;
});
