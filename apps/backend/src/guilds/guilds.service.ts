import { Injectable, Logger } from '@nestjs/common';
import type { GuildAccessLevel, GuildListResponse, GuildSummary } from '@notstack/shared';
import type { Guild } from 'discord.js';
import { DiscordService } from '../discord/discord.service';
import type { User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GuildAccessService } from './guild-access.service';

// ตรวจสิทธิ์พร้อมกันทีละไม่เกินเท่านี้ (ไม่ให้ยิง API ของ Discord รัวเกินตอนบอทอยู่หลายเซิร์ฟเวอร์)
const ACCESS_CONCURRENCY = 5;

// ==========================================
// 🏰 GUILDS — เซิร์ฟเวอร์ที่บอทอยู่ (ตาราง guilds) + รายการเซิร์ฟเวอร์ที่ผู้ใช้แต่ละคนเข้าถึงได้
// ==========================================
@Injectable()
export class GuildsService {
    private readonly logger = new Logger('Guilds');

    constructor(
        private readonly prisma: PrismaService,
        private readonly discord: DiscordService,
        private readonly access: GuildAccessService,
    ) {}

    // บอทอยู่ในเซิร์ฟเวอร์นี้ (ตอนออนไลน์ / ถูกเชิญ / เซิร์ฟเวอร์เปลี่ยนชื่อ-รูป)
    async upsert(guild: Guild): Promise<void> {
        const data = { name: guild.name, iconUrl: guild.iconURL({ size: 128 }), ownerId: guild.ownerId, leftAt: null };
        await this.prisma.guild.upsert({ where: { id: guild.id }, create: { id: guild.id, ...data }, update: data });
    }

    // บอทถูกเตะ / เซิร์ฟเวอร์ถูกลบ — เก็บการตั้งค่าไว้เผื่อเชิญกลับมา
    async markLeft(guildId: string): Promise<void> {
        await this.prisma.guild.updateMany({ where: { id: guildId }, data: { leftAt: new Date() } });
    }

    // ตอนบอทออนไลน์: เซิร์ฟเวอร์ที่ไม่อยู่ในรายการแล้ว (ถูกเตะตอนบอทออฟไลน์) → ถือว่าออกแล้ว
    async syncAll(guilds: Guild[]): Promise<void> {
        for (const guild of guilds) await this.upsert(guild);
        const { count } = await this.prisma.guild.updateMany({
            where: { id: { notIn: guilds.map((guild) => guild.id) }, leftAt: null },
            data: { leftAt: new Date() },
        });
        this.logger.log(`🏰 อยู่ใน ${guilds.length} เซิร์ฟเวอร์${count ? ` (ออกไปแล้ว ${count})` : ''}`);
    }

    private summary(guild: Guild, access: GuildAccessLevel): GuildSummary {
        return {
            id: guild.id,
            name: guild.name,
            iconUrl: guild.iconURL({ size: 128 }),
            memberCount: guild.memberCount,
            access,
            isHome: this.discord.isHome(guild.id),
        };
    }

    // เซิร์ฟเวอร์ที่ผู้ใช้คนนี้เปิดดู/จัดการได้ (เซิร์ฟเวอร์หลักขึ้นก่อน แล้วเรียงตามชื่อ)
    async listForUser(user: User): Promise<GuildListResponse> {
        const client = this.discord.ready;
        const needsDiscordLink = user.role !== 'ADMIN' && !user.discordId;
        if (!client) {
            // บอทออฟไลน์: ADMIN ยังเห็นเซิร์ฟเวอร์จากฐานข้อมูล (แก้การตั้งค่าที่เก็บไว้ได้)
            const rows = user.role === 'ADMIN' ? await this.prisma.guild.findMany({ where: { leftAt: null } }) : [];
            return {
                guilds: this.sort(
                    rows.map((row) => ({ id: row.id, name: row.name || row.id, iconUrl: row.iconUrl, memberCount: 0, access: 'manage', isHome: this.discord.isHome(row.id) })),
                ),
                inviteUrl: null,
                needsDiscordLink,
                botOnline: false,
            };
        }

        const all = [...client.guilds.cache.values()];
        let guilds: GuildSummary[];
        if (user.role === 'ADMIN') {
            guilds = all.map((guild) => this.summary(guild, 'manage'));
        } else if (!user.discordId) {
            guilds = [];
        } else {
            guilds = [];
            for (let i = 0; i < all.length; i += ACCESS_CONCURRENCY) {
                const batch = all.slice(i, i + ACCESS_CONCURRENCY);
                const levels = await Promise.all(batch.map((guild) => this.access.resolve(user, guild.id).catch(() => null)));
                batch.forEach((guild, index) => {
                    const level = levels[index];
                    if (level) guilds.push(this.summary(guild, level));
                });
            }
        }
        return { guilds: this.sort(guilds), inviteUrl: this.discord.inviteUrl(), needsDiscordLink, botOnline: true };
    }

    private sort(guilds: GuildSummary[]): GuildSummary[] {
        return guilds.sort((a, b) => Number(b.isHome) - Number(a.isHome) || a.name.localeCompare(b.name, 'th'));
    }

    // ข้อมูลเซิร์ฟเวอร์เดียว (ผ่าน GuildAccessGuard มาแล้ว)
    async detail(user: User, guildId: string): Promise<GuildSummary> {
        const level = (await this.access.resolve(user, guildId)) ?? 'view';
        const guild = this.discord.guild(guildId);
        if (guild) return this.summary(guild, level);
        const row = await this.prisma.guild.findUnique({ where: { id: guildId } });
        return { id: guildId, name: row?.name || guildId, iconUrl: row?.iconUrl ?? null, memberCount: 0, access: level, isHome: this.discord.isHome(guildId) };
    }
}
