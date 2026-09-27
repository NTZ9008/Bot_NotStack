import { Injectable } from '@nestjs/common';
import type { GuildAccessLevel } from '@notstack/shared';
import { PermissionFlagsBits, type Guild } from 'discord.js';
import { serviceUnavailable } from '../common/exceptions/api.exception';
import { DiscordService } from '../discord/discord.service';
import type { User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const CACHE_TTL_MS = 60 * 1000;

// ==========================================
// 🔐 สิทธิ์ของผู้ใช้ Dashboard ต่อเซิร์ฟเวอร์ — cache 1 นาที (หน้าเว็บเรียก API หลายตัวต่อการเปิดหน้าเดียว)
// ==========================================
@Injectable()
export class GuildAccessService {
    private readonly cache = new Map<string, { level: GuildAccessLevel | null; at: number }>();

    constructor(
        private readonly discord: DiscordService,
        private readonly prisma: PrismaService,
    ) {}

    // null = ไม่มีสิทธิ์ (ไม่ใช่สมาชิก / บอทไม่ได้อยู่ในเซิร์ฟเวอร์นั้น)
    async resolve(user: User, guildId: string): Promise<GuildAccessLevel | null> {
        // ADMIN ของระบบจัดการได้ทุกเซิร์ฟเวอร์ที่บอทอยู่ — บอทออฟไลน์ก็ยังแก้การตั้งค่าที่เก็บไว้ได้
        if (user.role === 'ADMIN') {
            if (this.discord.ready) return this.discord.guild(guildId) ? 'manage' : null;
            const row = await this.prisma.guild.findUnique({ where: { id: guildId }, select: { leftAt: true } });
            return row && !row.leftAt ? 'manage' : null;
        }
        if (!user.discordId) return null;
        if (!this.discord.ready) throw serviceUnavailable('บอทยังไม่ออนไลน์ จึงตรวจสิทธิ์ในเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง');
        const guild = this.discord.guild(guildId);
        if (!guild) return null;

        const key = `${user.discordId}:${guildId}`;
        const hit = this.cache.get(key);
        if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.level;
        const level = await this.memberLevel(guild, user.discordId);
        this.cache.set(key, { level, at: Date.now() });
        if (this.cache.size > 5000) this.cache.clear();
        return level;
    }

    async memberLevel(guild: Guild, discordId: string): Promise<GuildAccessLevel | null> {
        const member = guild.members.cache.get(discordId) ?? (await guild.members.fetch(discordId).catch(() => null));
        if (!member) return null;
        // has() นับ Administrator เป็นทุกสิทธิ์อยู่แล้ว
        return guild.ownerId === discordId || member.permissions.has(PermissionFlagsBits.ManageGuild) ? 'manage' : 'view';
    }

    // เรียกเมื่อสิทธิ์ของสมาชิกเปลี่ยน (ยศ / ออกจากเซิร์ฟเวอร์) ให้ตรวจใหม่ทันที
    forget(discordId: string, guildId: string): void {
        this.cache.delete(`${discordId}:${guildId}`);
    }
}
