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
// - ADMIN: จัดการได้ทุกเซิร์ฟเวอร์ที่บอทอยู่
// - OWNER: เห็นและจัดการได้เฉพาะเซิร์ฟเวอร์ที่ตัวเองเป็นเจ้าของ (ownerId) หรือมีสิทธิ์ Manage Server / Administrator
// - USER:  เห็นเฉพาะเซิร์ฟเวอร์ที่ตัวเองเป็นเจ้าของหรือมีสิทธิ์ Manage Server แต่ดูได้เฉพาะหน้า Levels ('view')
// - สมาชิกทั่วไปที่ไม่มีสิทธิ์ Manage Server ในเซิร์ฟเวอร์นั้น จะไม่เห็นเซิร์ฟเวอร์ใน Dashboard เลย (null)
// ==========================================
@Injectable()
export class GuildAccessService {
    private readonly cache = new Map<string, { canManage: boolean; at: number }>();
    private readonly pending = new Map<string, Promise<boolean>>();

    constructor(
        private readonly discord: DiscordService,
        private readonly prisma: PrismaService,
    ) {}

    // null = ไม่มีสิทธิ์เข้าถึงเซิร์ฟเวอร์นี้ (ไม่ใช่เจ้าของ/แอดมินเซิร์ฟเวอร์ หรือบอทไม่ได้อยู่ในเซิร์ฟเวอร์นั้น)
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

        const canManage = await this.canManageGuild(guild, user.discordId);
        if (!canManage) return null;
        return user.role === 'OWNER' ? 'manage' : 'view';
    }

    async canManageGuild(guild: Guild, discordId: string): Promise<boolean> {
        const key = `${discordId}:${guild.id}`;
        const hit = this.cache.get(key);
        if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.canManage;

        const running = this.pending.get(key);
        if (running) return running;
        const promise = Promise.resolve()
            .then(() => this.checkGuildManager(guild, discordId))
            .then((canManage) => {
                // A member/role event may invalidate this lookup while Discord is responding.
                if (this.pending.get(key) === promise) {
                    this.cache.set(key, { canManage, at: Date.now() });
                    if (this.cache.size > 5000) this.cache.clear();
                }
                return canManage;
            })
            .finally(() => {
                if (this.pending.get(key) === promise) this.pending.delete(key);
            });
        // Entries leave on settle, so this holds only in-flight checks; capping it would also skip caching.
        this.pending.set(key, promise);
        return promise;
    }

    async checkGuildManager(guild: Guild, discordId: string): Promise<boolean> {
        if (guild.ownerId === discordId) return true;
        const member = guild.members.cache.get(discordId) ?? (await guild.members.fetch(discordId).catch(() => null));
        if (!member) return false;
        // has() นับ Administrator เป็นทุกสิทธิ์อยู่แล้ว
        return member.permissions.has(PermissionFlagsBits.ManageGuild);
    }

    // ใช้ตอนสมัคร/ผูกบัญชี Discord ครั้งแรก — ถ้าเป็นเจ้าของหรือมีสิทธิ์ Manage Server ในเซิร์ฟที่บอทอยู่ ให้ได้ยศ OWNER อัตโนมัติ
    async hasManagedGuild(discordId: string): Promise<boolean> {
        const client = this.discord.ready;
        if (!client) {
            const count = await this.prisma.guild.count({ where: { ownerId: discordId, leftAt: null } });
            return count > 0;
        }
        const guilds = [...client.guilds.cache.values()];
        if (guilds.some((guild) => guild.ownerId === discordId)) return true;
        for (const guild of guilds) {
            if (await this.canManageGuild(guild, discordId).catch(() => false)) return true;
        }
        return false;
    }

    forgetGuild(guildId: string): void {
        for (const key of this.cache.keys()) if (key.endsWith(`:${guildId}`)) this.cache.delete(key);
        for (const key of this.pending.keys()) if (key.endsWith(`:${guildId}`)) this.pending.delete(key);
    }

    // เรียกเมื่อสิทธิ์ของสมาชิกเปลี่ยน (ยศ / ออกจากเซิร์ฟเวอร์) ให้ตรวจใหม่ทันที
    forget(discordId: string, guildId: string): void {
        this.cache.delete(`${discordId}:${guildId}`);
        this.pending.delete(`${discordId}:${guildId}`);
    }
}
