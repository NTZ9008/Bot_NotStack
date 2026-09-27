import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import type { GuildAccessLevel } from '@notstack/shared';
import { GuildAccessGuard } from '../guards/guild-access.guard';

export const GUILD_ACCESS_KEY = 'guild:access';

// ระดับสิทธิ์ขั้นต่ำของ route (ค่าเริ่มต้น manage) — ใช้บนเมธอดเพื่อผ่อนให้สมาชิกทั่วไปดูได้ เช่น @GuildAccess('view')
export const GuildAccess = (level: GuildAccessLevel) => SetMetadata(GUILD_ACCESS_KEY, level);

// controller ที่อยู่ใต้ /api/guilds/:guildId/* — ตรวจว่าผู้ใช้จัดการเซิร์ฟเวอร์นี้ได้ก่อนทุก route
export const GuildRoute = (level: GuildAccessLevel = 'manage') => applyDecorators(GuildAccess(level), UseGuards(GuildAccessGuard));
