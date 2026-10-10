import { HttpStatus, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    type Channel,
    Client,
    Events,
    GatewayIntentBits,
    type Guild,
    OAuth2Scopes,
    Partials,
    PermissionFlagsBits,
    type User,
} from 'discord.js';
import { ApiException } from '../common/exceptions/api.exception';
import type { Env } from '../config/env.validation';

// สิทธิ์ที่ขอตอนเชิญบอทเข้าเซิร์ฟเวอร์ — ครบทุกความสามารถ (ส่ง log / การ์ด / รายงานอากาศ, Room Access, Voice Guard, Log Manager)
const INVITE_PERMISSIONS = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AddReactions,
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.MoveMembers,
    PermissionFlagsBits.ViewAuditLog,
    PermissionFlagsBits.ManageGuild,
];

// ==========================================
// 🤖 DISCORD CLIENT — บอทตัวเดียวใช้ทั้งระบบ (ทุกเซิร์ฟเวอร์ที่บอทอยู่) ทั้ง event listener และ API ของหน้าเว็บ
// login หลังจากทุกโมดูลผูก event เสร็จแล้ว (onApplicationBootstrap) และไม่บล็อกการเปิด HTTP server
// ==========================================
@Injectable()
export class DiscordService implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly logger = new Logger('Discord');

    readonly client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildMessageReactions,
            GatewayIntentBits.GuildModeration, // Log Manager: แบน / ปลดแบน / audit log
            GatewayIntentBits.GuildInvites, // Log Manager: คำเชิญของเซิร์ฟเวอร์
            GatewayIntentBits.GuildExpressions, // Log Manager: อีโมจิ / สติกเกอร์
            GatewayIntentBits.GuildScheduledEvents, // Log Manager: กิจกรรมของเซิร์ฟเวอร์
            GatewayIntentBits.AutoModerationConfiguration, // Log Manager: กฎ AutoMod
            GatewayIntentBits.AutoModerationExecution, // Log Manager: AutoMod ทำงาน
        ],
        partials: [Partials.Message, Partials.Channel, Partials.Reaction],
        // ค่าเริ่มต้นของทุกข้อความ: แท็กได้เฉพาะผู้ใช้ — ข้อความที่มีส่วนที่ผู้ใช้/AI พิมพ์มา (เช่น /random, AI Chat) จะแท็ก @everyone / ยศไม่ได้
        // ข้อความที่แอดมินตั้งใจแท็กยศ (การ์ดต้อนรับ / รายงานอากาศ / PR Bot) ระบุ allowedMentions เองทุกครั้ง
        allowedMentions: { parse: ['users'], repliedUser: true },
    });

    // เซิร์ฟเวอร์หลัก (DISCORD_GUILD_ID) — คำสั่งเฉพาะของ NotStack และค่าเริ่มต้นแบบเดิม
    readonly homeGuildId: string;
    readonly clientId: string;

    constructor(private readonly config: ConfigService<Env, true>) {
        this.homeGuildId = config.get('DISCORD_GUILD_ID', { infer: true });
        this.clientId = config.get('DISCORD_CLIENT_ID', { infer: true });
        this.client.once(Events.ClientReady, (client) => {
            this.logger.log(`✅ Logged in as ${client.user.tag} (${client.guilds.cache.size} เซิร์ฟเวอร์)`);
            this.logger.log('🛡️ Security Systems: Active');
        });
        this.client.on(Events.Error, (err) => this.logger.error(`Client error: ${err.message}`));
    }

    onApplicationBootstrap(): void {
        const token = this.config.get('TOKEN', { infer: true });
        if (!token) {
            this.logger.warn('ยังไม่ได้ตั้ง TOKEN — เปิดแค่ API บอทจะไม่ login เข้า Discord');
            return;
        }
        this.client.login(token).catch((err: Error) => this.logger.error(`login เข้า Discord ไม่สำเร็จ: ${err.message}`));
    }

    async onApplicationShutdown(): Promise<void> {
        await this.client.destroy();
    }

    // client ที่ login แล้ว (null = บอทยังไม่ออนไลน์)
    get ready(): Client<true> | null {
        return this.client.isReady() ? this.client : null;
    }

    // สำหรับ API ที่ต้องใช้บอท — ตอบ 503 ถ้าบอทยังไม่พร้อม
    requireReady(): Client<true> {
        const client = this.ready;
        if (!client) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, 'บอทยังไม่ออนไลน์ กรุณาลองใหม่อีกครั้ง');
        return client;
    }

    isHome(guildId: string | null | undefined): boolean {
        return guildId === this.homeGuildId;
    }

    // เซิร์ฟเวอร์ที่บอทอยู่ตอนนี้ (null = บอทไม่ได้อยู่ / ยังไม่ออนไลน์)
    guild(guildId: string): Guild | null {
        return this.ready?.guilds.cache.get(guildId) ?? null;
    }

    requireGuild(guildId: string): Guild {
        const guild = this.requireReady().guilds.cache.get(guildId);
        if (!guild) throw new ApiException(HttpStatus.NOT_FOUND, 'บอทไม่ได้อยู่ในเซิร์ฟเวอร์นี้แล้ว');
        return guild;
    }

    // ลิงก์เชิญบอทเข้าเซิร์ฟเวอร์ (ขอสิทธิ์ครบทุกความสามารถ + คำสั่ง /)
    inviteUrl(guildId?: string): string | null {
        const client = this.ready;
        if (!client) return null;
        return client.generateInvite({
            scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
            permissions: INVITE_PERMISSIONS,
            ...(guildId ? { guild: guildId, disableGuildSelect: true } : {}),
        });
    }

    async fetchChannel(channelId: string, force = false): Promise<Channel | null> {
        if (!force) {
            const cached = this.client.channels.cache.get(channelId);
            if (cached) return cached;
        }
        return this.client.channels.fetch(channelId, { force }).catch(() => null);
    }

    // ห้องที่อยู่ในเซิร์ฟเวอร์ที่กำหนดเท่านั้น (กันหน้าเว็บของเซิร์ฟเวอร์หนึ่งสั่งบอทไปทำอะไรกับห้องของเซิร์ฟเวอร์อื่น)
    async fetchGuildChannel(guildId: string, channelId: string, force = false): Promise<Channel | null> {
        const channel = await this.fetchChannel(channelId, force);
        return channel && 'guildId' in channel && channel.guildId === guildId ? channel : null;
    }

    // Expiry must distinguish a deleted channel from transient API/permission errors.
    async fetchGuildChannelStrict(guildId: string, channelId: string): Promise<Channel | null> {
        let channel: Channel | null;
        try {
            channel = await this.client.channels.fetch(channelId, { force: true });
        } catch (err) {
            if ((err as { code?: number }).code === 10003) return null; // Unknown Channel
            throw err;
        }
        if (channel && (!('guildId' in channel) || channel.guildId !== guildId)) {
            throw new Error('Channel does not belong to the ticket guild');
        }
        return channel;
    }

    async fetchUser(userId: string): Promise<User | null> {
        return this.client.users.cache.get(userId) ?? (await this.client.users.fetch(userId).catch(() => null));
    }

    // ชื่อที่แสดงของผู้ใช้ (global name ก่อน username) — หาไม่เจอคืน null
    async displayName(userId: string): Promise<string | null> {
        const user = await this.fetchUser(userId);
        return user ? user.globalName || user.username : null;
    }
}
