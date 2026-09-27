import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AppRequest } from '../../common/interfaces/app-request.interface';

// id ของเซิร์ฟเวอร์จาก path (ผ่าน GuildAccessGuard ตรวจรูปแบบและสิทธิ์มาแล้ว)
export const GuildId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
    return String(ctx.switchToHttp().getRequest<AppRequest>().params.guildId);
});
