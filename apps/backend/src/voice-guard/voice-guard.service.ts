import { Injectable } from '@nestjs/common';
import type { DiscordUserInfo, VoiceGuardChannel, VoiceGuardMode } from '@notstack/shared';
import { ChannelType } from 'discord.js';
import { badRequest, notFound } from '../common/exceptions/api.exception';
import { DiscordService } from '../discord/discord.service';
import { PrismaService } from '../prisma/prisma.service';

interface GuardChannelRow {
    channelId: string;
    guildId: string;
    enabled: boolean;
    notify: boolean;
}

// กติกาของห้องเสียง 1 ห้อง (null = ห้องนี้ไม่ได้อยู่ในรายการนั้น)
export interface GuardRule {
    enabled: boolean;
    notify: boolean;
    userIds: Set<string>;
}
export interface ChannelGuardRules {
    whitelist: GuardRule | null;
    blacklist: GuardRule | null;
}

// กติกาที่ใช้ตอนมีคนเข้าห้องเสียง cache ไว้ (แก้จากหน้าเว็บแล้วล้างทันที — TTL กันกรณีแก้ฐานข้อมูลตรงๆ)
const RULE_CACHE_TTL_MS = 5 * 60 * 1000;

const fallbackAvatar = (userId: string) => {
    const index = /^\d+$/.test(userId) ? Number(BigInt(userId) % 5n) : 0;
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
};

// ==========================================
// 🎙️ VOICE GUARD — Whitelist / Blacklist ของห้องเสียง (แยกตามเซิร์ฟเวอร์)
// สองระบบมีโครงสร้างเหมือนกันทุกอย่าง ต่างกันแค่ตาราง (voice_whitelist_* / voice_blacklist_*)
// ทุกการแก้ไขจากหน้าเว็บตรวจก่อนว่าห้องนั้นเป็นของเซิร์ฟเวอร์ที่กำลังจัดการอยู่
// ==========================================
@Injectable()
export class VoiceGuardService {
    private readonly ruleCache = new Map<string, { rules: ChannelGuardRules; at: number }>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly discord: DiscordService,
    ) {}

    getChannels(mode: VoiceGuardMode, guildId: string): Promise<GuardChannelRow[]> {
        return mode === 'whitelist'
            ? this.prisma.voiceWhitelistChannel.findMany({ where: { guildId } })
            : this.prisma.voiceBlacklistChannel.findMany({ where: { guildId } });
    }

    // ใช้ตอนมีคนเข้าห้องเสียง (channel id ไม่ซ้ำข้ามเซิร์ฟเวอร์ ไม่ต้องระบุเซิร์ฟเวอร์)
    getChannel(mode: VoiceGuardMode, channelId: string): Promise<GuardChannelRow | null> {
        return mode === 'whitelist'
            ? this.prisma.voiceWhitelistChannel.findUnique({ where: { channelId } })
            : this.prisma.voiceBlacklistChannel.findUnique({ where: { channelId } });
    }

    // กติกา whitelist + blacklist ของห้องเสียงที่มีคนเข้า (channel id ไม่ซ้ำข้ามเซิร์ฟเวอร์)
    async rules(channelId: string): Promise<ChannelGuardRules> {
        const hit = this.ruleCache.get(channelId);
        if (hit && Date.now() - hit.at < RULE_CACHE_TTL_MS) return hit.rules;
        const load = async (mode: VoiceGuardMode): Promise<GuardRule | null> => {
            const row = await this.getChannel(mode, channelId);
            return row ? { enabled: row.enabled, notify: row.notify, userIds: new Set(await this.getUsers(mode, channelId)) } : null;
        };
        const [whitelist, blacklist] = await Promise.all([load('whitelist'), load('blacklist')]);
        const rules = { whitelist, blacklist };
        this.ruleCache.set(channelId, { rules, at: Date.now() });
        if (this.ruleCache.size > 5000) this.ruleCache.clear();
        return rules;
    }

    // ห้องที่มีอยู่แล้วต้องเป็นของเซิร์ฟเวอร์นี้ / ห้องใหม่ต้องเป็นห้องเสียงของเซิร์ฟเวอร์นี้ใน Discord
    private async assertOwnChannel(mode: VoiceGuardMode, guildId: string, channelId: string, allowNew: boolean): Promise<void> {
        const row = await this.getChannel(mode, channelId);
        if (row) {
            if (row.guildId !== guildId) throw notFound('ไม่พบห้องนี้ในเซิร์ฟเวอร์');
            return;
        }
        if (!allowNew) throw notFound('ห้องนี้ยังไม่ได้อยู่ในรายการ');
        this.discord.requireReady();
        const channel = await this.discord.fetchGuildChannel(guildId, channelId);
        if (!channel || channel.type !== ChannelType.GuildVoice) throw badRequest('ไม่พบห้องเสียงนี้ในเซิร์ฟเวอร์');
    }

    // อัปเดตเฉพาะ enabled โดยไม่แตะ notify ที่ตั้งไว้
    async setEnabled(mode: VoiceGuardMode, guildId: string, channelId: string, enabled: boolean): Promise<void> {
        await this.assertOwnChannel(mode, guildId, channelId, true);
        const args = { where: { channelId }, create: { channelId, guildId, enabled }, update: { enabled } };
        if (mode === 'whitelist') await this.prisma.voiceWhitelistChannel.upsert(args);
        else await this.prisma.voiceBlacklistChannel.upsert(args);
        this.ruleCache.delete(channelId);
    }

    // สวิตช์ "ส่ง DM แจ้งผู้ใช้เมื่อถูกเตะออก" — อัปเดตเฉพาะ notify โดยไม่แตะ enabled
    async setNotify(mode: VoiceGuardMode, guildId: string, channelId: string, notify: boolean): Promise<void> {
        await this.assertOwnChannel(mode, guildId, channelId, true);
        const args = { where: { channelId }, create: { channelId, guildId, notify }, update: { notify } };
        if (mode === 'whitelist') await this.prisma.voiceWhitelistChannel.upsert(args);
        else await this.prisma.voiceBlacklistChannel.upsert(args);
        this.ruleCache.delete(channelId);
    }

    async deleteChannel(mode: VoiceGuardMode, guildId: string, channelId: string): Promise<void> {
        await this.assertOwnChannel(mode, guildId, channelId, false);
        const where = { where: { channelId } };
        if (mode === 'whitelist') {
            await this.prisma.$transaction([this.prisma.voiceWhitelistUser.deleteMany(where), this.prisma.voiceWhitelistChannel.deleteMany(where)]);
        } else {
            await this.prisma.$transaction([this.prisma.voiceBlacklistUser.deleteMany(where), this.prisma.voiceBlacklistChannel.deleteMany(where)]);
        }
        this.ruleCache.delete(channelId);
    }

    async getUsers(mode: VoiceGuardMode, channelId: string): Promise<string[]> {
        const args = { where: { channelId }, select: { userId: true } };
        const rows = mode === 'whitelist' ? await this.prisma.voiceWhitelistUser.findMany(args) : await this.prisma.voiceBlacklistUser.findMany(args);
        return rows.map((row) => row.userId);
    }

    async addUser(mode: VoiceGuardMode, guildId: string, channelId: string, userId: string): Promise<void> {
        await this.assertOwnChannel(mode, guildId, channelId, false);
        const args = { data: [{ channelId, userId }], skipDuplicates: true };
        if (mode === 'whitelist') await this.prisma.voiceWhitelistUser.createMany(args);
        else await this.prisma.voiceBlacklistUser.createMany(args);
        this.ruleCache.delete(channelId);
    }

    async removeUser(mode: VoiceGuardMode, guildId: string, channelId: string, userId: string): Promise<void> {
        await this.assertOwnChannel(mode, guildId, channelId, false);
        const args = { where: { channelId, userId } };
        if (mode === 'whitelist') await this.prisma.voiceWhitelistUser.deleteMany(args);
        else await this.prisma.voiceBlacklistUser.deleteMany(args);
        this.ruleCache.delete(channelId);
    }

    // รายการห้องพร้อมชื่อห้อง + ชื่อ/รูปของสมาชิกแต่ละคน สำหรับหน้าเว็บ
    async overview(mode: VoiceGuardMode, guildId: string): Promise<VoiceGuardChannel[]> {
        const guild = this.discord.guild(guildId);
        const result: VoiceGuardChannel[] = [];
        for (const channel of await this.getChannels(mode, guildId)) {
            const users: DiscordUserInfo[] = [];
            for (const userId of await this.getUsers(mode, channel.channelId)) {
                const user = await this.discord.fetchUser(userId);
                users.push({
                    userId,
                    username: user ? user.globalName || user.username : userId,
                    avatar: user ? user.displayAvatarURL({ size: 64 }) : fallbackAvatar(userId),
                });
            }
            result.push({
                channelId: channel.channelId,
                channelName: guild?.channels.cache.get(channel.channelId)?.name ?? channel.channelId,
                enabled: channel.enabled,
                notify: channel.notify,
                users,
            });
        }
        return result;
    }
}
