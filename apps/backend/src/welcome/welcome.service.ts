import { Injectable, Logger } from '@nestjs/common';
import { fillPlaceholders, isSnowflake, type WelcomeDesign, type WelcomeVars } from '@notstack/shared';
import {
    AttachmentBuilder,
    PermissionFlagsBits,
    type Guild,
    type GuildMember,
    type MessageCreateOptions,
    type SendableChannels,
    type User,
} from 'discord.js';
import { DiscordService } from '../discord/discord.service';
import { WelcomeRenderer } from './welcome.renderer';
import { WelcomeStore } from './welcome.store';

const REQUIRED_PERMISSIONS = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles];

export interface WelcomeTarget {
    member?: GuildMember | null;
    user?: User | null;
    guild?: Guild | null;
}

export interface WelcomeCardLike {
    content: string;
    design: WelcomeDesign;
    backgroundId: number | null;
}

// ค่าของตัวแปรจากสมาชิก (GuildMember) หรือ User ธรรมดา (ตอนดูตัวอย่างกับคนที่ไม่ได้อยู่ในเซิร์ฟเวอร์)
export function buildVars({ member, user, guild }: WelcomeTarget): { vars: WelcomeVars; mentionId: string | null } {
    const target = member?.user ?? user ?? null;
    const server = guild ?? member?.guild ?? null;
    return {
        vars: {
            user: member?.displayName || target?.globalName || target?.username || 'สมาชิกใหม่',
            username: target?.username || 'new_member',
            id: target?.id || '0',
            server: server?.name || 'NotStack',
            memberCount: String(server?.memberCount ?? 0),
        },
        mentionId: target?.id ?? null,
    };
}

// ==========================================
// 🎉 WELCOME ANNOUNCEMENT — วาด/ส่งการ์ดต้อนรับแบบรูปภาพ (ตัวรับสมาชิกใหม่อยู่ที่ MemberJoinListener)
// ทำงานแยกจาก Welcome ข้อความเดิม (WELCOME_CHANNEL_ID) — ทั้งสองระบบทำงานคู่กันได้
// ==========================================
@Injectable()
export class WelcomeService {
    private readonly logger = new Logger('Welcome');

    constructor(
        private readonly store: WelcomeStore,
        private readonly renderer: WelcomeRenderer,
        private readonly discord: DiscordService,
    ) {}

    // ห้องต้องเป็นห้องข้อความของเซิร์ฟเวอร์เดียวกับสมาชิก และบอทต้องมีสิทธิ์ส่งไฟล์ — คืนข้อความ error ภาษาไทยถ้าส่งไม่ได้
    async resolveTargetChannel(guild: Guild, channelId: string): Promise<{ channel: SendableChannels; error?: undefined } | { channel?: undefined; error: string }> {
        if (!channelId) return { error: 'การ์ดนี้ยังไม่ได้เลือกห้องที่จะส่ง' };
        const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
        if (!channel) return { error: `ไม่พบห้อง ${channelId} ในเซิร์ฟเวอร์ ${guild.name}` };
        if (!channel.isTextBased() || channel.isVoiceBased() || !channel.isSendable()) return { error: `ห้อง #${channel.name} ไม่ใช่ห้องข้อความ` };

        const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
        const permissions = me ? channel.permissionsFor(me) : null;
        if (!permissions || !permissions.has(REQUIRED_PERMISSIONS)) {
            return { error: `บอทไม่มีสิทธิ์ดูห้อง / ส่งข้อความ / แนบไฟล์ ในห้อง #${channel.name}` };
        }
        return { channel };
    }

    // เตือน (แต่ไม่ห้ามบันทึก) ถ้าห้องที่เลือกบอทส่งรูปเข้าไปไม่ได้ — แอดมินอาจไปแก้สิทธิ์ใน Discord ทีหลัง
    async channelWarning(guildId: string, channelId: string): Promise<string | null> {
        if (!channelId || !this.discord.ready) return null;
        const guild = this.discord.guild(guildId);
        if (!guild) return null;
        const { error } = await this.resolveTargetChannel(guild, channelId);
        return error ?? null;
    }

    // สมาชิกที่ใช้แสดงในรูปตัวอย่าง: คนที่เลือกในหน้าเว็บ → บัญชี Discord ของแอดมินที่ login อยู่ → ตัวบอทเอง
    async resolveSample(guildId: string, requestedId: unknown, fallbackDiscordId: string | null): Promise<WelcomeTarget> {
        const client = this.discord.ready;
        if (!client) return { guild: null, member: null, user: null };
        const targetGuild = this.discord.guild(guildId);
        const id = isSnowflake(String(requestedId ?? '')) ? String(requestedId) : fallbackDiscordId || client.user.id;
        const member = targetGuild ? await targetGuild.members.fetch(id).catch(() => null) : null;
        const user = member?.user ?? (await client.users.fetch(id).catch(() => null));
        return { guild: targetGuild, member, user };
    }

    async renderImage(design: WelcomeDesign, backgroundId: number | null, target: WelcomeTarget): Promise<{ image: Buffer; vars: WelcomeVars; mentionId: string | null }> {
        const { vars, mentionId } = buildVars(target);
        const [background, avatar] = await Promise.all([
            this.renderer.loadAssetImage(backgroundId).catch((err: Error) => {
                this.logger.warn(`โหลดรูปพื้นหลัง #${backgroundId} ไม่สำเร็จ: ${err.message}`);
                return null;
            }),
            design.avatar.visible ? this.renderer.loadAvatarImage(target.member?.user ?? target.user) : null,
        ]);
        const image = await this.renderer.render({ design, background, avatar, vars });
        return { image, vars, mentionId };
    }

    // ข้อความ (ข้อความ + ไฟล์รูป) ของการ์ด 1 ใบ สำหรับสมาชิก 1 คน
    async buildPayload(card: WelcomeCardLike, target: WelcomeTarget): Promise<MessageCreateOptions> {
        const { image, vars, mentionId } = await this.renderImage(card.design, card.backgroundId, target);
        const content = fillPlaceholders(card.content, vars, 'message', mentionId).trim();
        return {
            content: content || undefined,
            files: [new AttachmentBuilder(image, { name: 'welcome.png' })],
            // แท็กได้เฉพาะคนที่เพิ่งเข้ามา + ยศที่แอดมินพิมพ์ไว้ในข้อความเอง
            // (กันชื่อเล่นอย่าง "@everyone" ที่ถูกแทนค่าผ่าน {user} กลายเป็นการแท็กทั้งเซิร์ฟเวอร์)
            allowedMentions: {
                users: mentionId ? [mentionId] : [],
                roles: [...String(card.content).matchAll(/<@&(\d+)>/g)].map((m) => m[1]!),
            },
        };
    }
}
