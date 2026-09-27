import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_ERROR_CODES, isSnowflake, type GuildAccessLevel } from '@notstack/shared';
import { ApiException, notFound } from '../../common/exceptions/api.exception';
import type { AppRequest } from '../../common/interfaces/app-request.interface';
import { GUILD_ACCESS_KEY } from '../decorators/guild-route.decorator';
import { GuildAccessService } from '../guild-access.service';

// ==========================================
// 🏰 GUILD ACCESS GUARD — route ใต้ /api/guilds/:guildId/*
// - manage: ADMIN ของระบบ หรือสมาชิกที่มีสิทธิ์ Manage Server / Administrator / เป็นเจ้าของเซิร์ฟเวอร์
// - view:   สมาชิกทุกคนของเซิร์ฟเวอร์นั้น
// ตรวจจากบัญชี Discord ที่เชื่อมไว้กับบัญชี Dashboard (สด ผ่านตัวบอท — ไม่ต้องขอ scope guilds)
// ==========================================
@Injectable()
export class GuildAccessGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly access: GuildAccessService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const req = context.switchToHttp().getRequest<AppRequest>();
        const guildId = req.params.guildId;
        if (!isSnowflake(guildId)) throw notFound('ไม่พบเซิร์ฟเวอร์นี้');
        if (!req.user) return false;

        const required = this.reflector.getAllAndOverride<GuildAccessLevel | undefined>(GUILD_ACCESS_KEY, [context.getHandler(), context.getClass()]) ?? 'manage';
        const level = await this.access.resolve(req.user, guildId);
        if (!level) {
            throw new ApiException(HttpStatus.FORBIDDEN, 'คุณไม่ได้อยู่ในเซิร์ฟเวอร์นี้ หรือบอทไม่ได้อยู่ในเซิร์ฟเวอร์นี้แล้ว', AUTH_ERROR_CODES.forbidden);
        }
        if (required === 'manage' && level !== 'manage') {
            throw new ApiException(HttpStatus.FORBIDDEN, 'ต้องมีสิทธิ์ Manage Server ในเซิร์ฟเวอร์นี้', AUTH_ERROR_CODES.forbidden);
        }

        req.audit ??= {};
        req.audit.guildId = guildId;
        return true;
    }
}
