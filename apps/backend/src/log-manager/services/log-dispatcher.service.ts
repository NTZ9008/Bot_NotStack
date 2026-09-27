import { Injectable, Logger } from '@nestjs/common';
import { LOG_EVENT_MAP } from '@notstack/shared';
import {
    AuditLogEvent,
    EmbedBuilder,
    type Guild,
    type GuildAuditLogsEntry,
    type Message,
    type PartialMessage,
    type PartialUser,
    type SendableChannels,
    type User,
} from 'discord.js';
import { sleep } from '../../common/utils/parse.util';
import { DiscordService } from '../../discord/discord.service';
import type { LogContext, LogPayload, UserLike } from '../interfaces/log-payload.interface';
import { field, userLine } from '../utils/log-format.util';
import { ActivityService } from './activity.service';
import { LogSettingsService } from './log-settings.service';

export interface ExecutorInfo {
    executor: User | PartialUser | null;
    reason: string | null;
    entry: GuildAuditLogsEntry;
}

// เซิร์ฟเวอร์ที่เกิดเหตุการณ์ — ส่งเป็นตัว Guild หรือ id ก็ได้
export type GuildRef = Guild | string | null | undefined;
const guildIdOf = (guild: GuildRef): string | null => (typeof guild === 'string' ? guild : (guild?.id ?? null));

const AUDIT_BUFFER_TTL = 60000;
const AUDIT_BUFFER_MAX = 300;

const FLUSH_DELAY = 1200;
const MAX_EMBEDS_PER_MESSAGE = 10;
const MAX_CHARS_PER_MESSAGE = 5500;

// รูปแบบลิงก์เชิญของ Discord ทุกโดเมนที่ใช้กันจริง
const INVITE_PATTERN = /(?:discord(?:app)?\.com\/invite|discord\.gg|discord\.me|dsc\.gg)\/([a-zA-Z0-9-]+)/gi;

function embedLength(embed: EmbedBuilder): number {
    const data = embed.data;
    let len = (data.title || '').length + (data.description || '').length + (data.footer?.text || '').length;
    for (const f of data.fields || []) len += f.name.length + f.value.length;
    return len;
}

// ==========================================
// 📤 LOG DISPATCHER
// ส่ง embed เข้าห้องที่แอดมินของเซิร์ฟเวอร์นั้นตั้งไว้ต่อรายการ + บันทึกลง activity_events
// รวม embed หลายอันส่งเป็นข้อความเดียว (Discord รับได้ 10 embed/ข้อความ) ไม่ให้ชน rate limit
// ==========================================
@Injectable()
export class LogDispatcher {
    private readonly logger = new Logger('LogManager');

    // audit entry ที่ไหลเข้ามาจาก gateway (guildAuditLogEntryCreate) — ให้ event ต่างๆ มาจับคู่หา "ใครเป็นคนทำ"
    private readonly auditBuffer: { entry: GuildAuditLogsEntry; guildId: string | undefined; at: number }[] = [];
    // ถ้าเคยได้รับ entry จาก gateway แล้ว แปลว่า intent + สิทธิ์ครบ → ไม่ต้อง fallback ไปยิง REST อีก
    private auditGatewayWorking = false;

    private readonly queues = new Map<string, { embeds: EmbedBuilder[]; timer: NodeJS.Timeout | null }>();

    constructor(
        private readonly discord: DiscordService,
        private readonly settings: LogSettingsService,
        private readonly activity: ActivityService,
    ) {}

    // ==========================================
    // 🕵️ AUDIT LOG
    // ==========================================
    pushAuditEntry(entry: GuildAuditLogsEntry, guild: Guild | null): void {
        this.auditGatewayWorking = true;
        this.auditBuffer.push({ entry, guildId: guild?.id, at: Date.now() });

        const cutoff = Date.now() - AUDIT_BUFFER_TTL;
        while (this.auditBuffer.length && this.auditBuffer[0]!.at < cutoff) this.auditBuffer.shift();
        while (this.auditBuffer.length > AUDIT_BUFFER_MAX) this.auditBuffer.shift();
    }

    findInAuditBuffer(guildId: string | undefined, auditType: AuditLogEvent, targetId: string | null, maxAgeMs: number): ExecutorInfo | null {
        const cutoff = Date.now() - maxAgeMs;
        for (let i = this.auditBuffer.length - 1; i >= 0; i--) {
            const rec = this.auditBuffer[i]!;
            if (rec.at < cutoff) break;
            if (guildId && rec.guildId && rec.guildId !== guildId) continue;
            if (rec.entry.action !== auditType) continue;
            if (targetId && rec.entry.targetId && rec.entry.targetId !== targetId) continue;
            return { executor: rec.entry.executor, reason: rec.entry.reason, entry: rec.entry };
        }
        return null;
    }

    /**
     * หาว่าใครเป็นคนลงมือทำ
     * 1) รอ entry จาก gateway (เร็ว ไม่กินโควตา API)
     * 2) ถ้ายังไม่เคยได้ entry จาก gateway เลย ค่อย fallback ไปยิง REST ให้
     */
    async fetchExecutor(guild: Guild | null | undefined, auditType: AuditLogEvent, targetId: string | null = null, maxAgeMs = 10000): Promise<ExecutorInfo | null> {
        if (!guild) return null;

        // entry อาจมาถึงก่อนหรือหลัง gateway event เล็กน้อย → วนเช็คสั้นๆ
        for (let i = 0; i < 6; i++) {
            const hit = this.findInAuditBuffer(guild.id, auditType, targetId, maxAgeMs);
            if (hit) return hit;
            await sleep(150);
        }

        if (this.auditGatewayWorking) return null; // gateway ทำงานอยู่แล้ว ถ้าไม่เจอแปลว่าไม่มี entry จริงๆ

        try {
            const logs = await guild.fetchAuditLogs({ limit: 6, type: auditType });
            const entry = logs.entries.find((e) => {
                if (Date.now() - e.createdTimestamp > maxAgeMs) return false;
                const target = e.target as { id?: string } | null;
                if (targetId && target?.id && target.id !== targetId) return false;
                return true;
            });
            return entry ? { executor: entry.executor, reason: entry.reason, entry: entry as unknown as GuildAuditLogsEntry } : null;
        } catch {
            // ปกติเกิดจากบอทไม่มีสิทธิ์ View Audit Log — ไม่ต้องหยุดการส่ง log
            return null;
        }
    }

    // ==========================================
    // 🚫 IGNORE FILTER — ยกเว้นห้อง / คน / ยศ ที่แอดมินไม่อยากให้ log (แนวเดียวกับ Carl-bot)
    // ==========================================
    isIgnored(guildId: string, context: LogContext = {}): boolean {
        const { userId, isBot, channelId, parentId, member } = context;
        const opt = this.settings.getOptions(guildId);

        if (isBot && opt.ignoreBots) return true;
        if (userId && opt.ignoredUsers.has(userId)) return true;
        if (channelId && opt.ignoredChannels.has(channelId)) return true;
        if (parentId && opt.ignoredChannels.has(parentId)) return true; // ยกเว้นทั้งหมวดหมู่

        const roles = member?.roles?.cache;
        if (opt.ignoredRoles.size && roles) {
            for (const roleId of opt.ignoredRoles) {
                if (roles.has(roleId)) return true;
            }
        }
        return false;
    }

    // เช็คก่อนว่าต้องประมวลผล event นี้ต่อไหม เพื่อไม่ต้องเสียเวลาดึง audit log ทิ้งเปล่า
    // ถ้าเปิดบันทึกกิจกรรมลงฐานข้อมูลอยู่ ต้องทำต่อทุก event แม้ยังไม่ได้ตั้งห้องส่ง log ใน Discord
    isActive(guild: GuildRef, eventKey: string): boolean {
        const guildId = guildIdOf(guild);
        if (!guildId || !this.settings.isLoaded(guildId)) {
            if (guildId) this.settings.getOptions(guildId); // เริ่มโหลดค่าของเซิร์ฟเวอร์นี้เบื้องหลัง
            return false;
        }
        if (this.settings.getOptions(guildId).activityRecording) return true;
        if (!this.settings.isSystemEnabled(guildId)) return false;
        const setting = this.settings.getSetting(guildId, eventKey);
        return Boolean(setting && setting.enabled && setting.channelId);
    }

    // ==========================================
    // 📤 ส่ง log
    // ==========================================
    private async resolveChannel(guildId: string, channelId: string): Promise<SendableChannels | null> {
        const channel = await this.discord.fetchGuildChannel(guildId, channelId);
        return channel && channel.isSendable() ? channel : null;
    }

    private enqueueEmbed(guildId: string, channelId: string, embed: EmbedBuilder): void {
        let queue = this.queues.get(channelId);
        if (!queue) {
            queue = { embeds: [], timer: null };
            this.queues.set(channelId, queue);
        }
        queue.embeds.push(embed);

        if (queue.embeds.length >= MAX_EMBEDS_PER_MESSAGE) {
            void this.flushQueue(guildId, channelId);
            return;
        }
        queue.timer ??= setTimeout(() => void this.flushQueue(guildId, channelId), FLUSH_DELAY);
    }

    private async flushQueue(guildId: string, channelId: string): Promise<void> {
        const queue = this.queues.get(channelId);
        if (!queue || queue.embeds.length === 0) return;

        if (queue.timer) clearTimeout(queue.timer);
        queue.timer = null;

        // หยิบเท่าที่ยัดลงหนึ่งข้อความได้ ที่เหลือรอรอบถัดไป
        const batch: EmbedBuilder[] = [];
        let chars = 0;
        while (queue.embeds.length && batch.length < MAX_EMBEDS_PER_MESSAGE) {
            const nextLen = embedLength(queue.embeds[0]!);
            if (batch.length && chars + nextLen > MAX_CHARS_PER_MESSAGE) break;
            batch.push(queue.embeds.shift()!);
            chars += nextLen;
        }

        try {
            const channel = await this.resolveChannel(guildId, channelId);
            if (channel) await channel.send({ embeds: batch });
        } catch (err) {
            this.logger.error(`ส่งเข้าห้อง ${channelId} ไม่สำเร็จ: ${(err as Error).message}`);
        }

        if (queue.embeds.length) {
            queue.timer = setTimeout(() => void this.flushQueue(guildId, channelId), FLUSH_DELAY);
        } else {
            this.queues.delete(channelId);
        }
    }

    /**
     * ส่ง log หนึ่งรายการเข้าห้องที่เซิร์ฟเวอร์นั้นตั้งค่าไว้
     * ข้ามการส่งเงียบๆ ถ้า: ปิดทั้งระบบ / ปิด event นี้ / ยังไม่ได้เลือกห้อง / ติด ignore list
     */
    async sendLog(guild: GuildRef, eventKey: string, payload: LogPayload): Promise<void> {
        const guildId = guildIdOf(guild);
        if (!guildId) return;
        try {
            if (!this.settings.isLoaded(guildId)) return;
            if (payload.context && this.isIgnored(guildId, payload.context)) return;

            // บันทึกลงฐานข้อมูลก่อนเสมอ — หน้า Dashboard ดูย้อนหลังได้ถึงแม้ยังไม่ได้ตั้งห้องส่ง log ใน Discord
            if (this.settings.getOptions(guildId).activityRecording) this.activity.record(guildId, eventKey, payload);

            if (!this.discord.ready || !this.settings.isSystemEnabled(guildId)) return;
            const setting = this.settings.getSetting(guildId, eventKey);
            if (!setting || !setting.enabled || !setting.channelId) return;

            const meta = LOG_EVENT_MAP.get(eventKey);
            const embed = new EmbedBuilder()
                .setColor((setting.color || meta?.color || '#5865F2') as `#${string}`)
                .setTitle(payload.title || meta?.label || 'Log')
                .setTimestamp();

            if (payload.description) embed.setDescription(payload.description.length > 4000 ? `${payload.description.slice(0, 3997)}...` : payload.description);
            const fields = (payload.fields ?? []).filter((f): f is NonNullable<typeof f> => Boolean(f));
            if (fields.length) embed.addFields(fields);
            if (payload.thumbnail) embed.setThumbnail(payload.thumbnail);
            embed.setFooter({ text: payload.footer || `Log Manager • ${meta?.label || eventKey}` });

            // ข้อความที่มีไฟล์แนบรวมกับอันอื่นไม่ได้ ส่งแยกทันที
            if (payload.files?.length) {
                const channel = await this.resolveChannel(guildId, setting.channelId);
                if (channel) await channel.send({ embeds: [embed], files: payload.files });
                return;
            }

            this.enqueueEmbed(guildId, setting.channelId, embed);
        } catch (err) {
            this.logger.error(`${eventKey}: ${(err as Error).message}`);
        }
    }

    /**
     * บันทึกกิจกรรมที่ไม่ได้อยู่ในแคตตาล็อกของ Log Manager (ไม่ได้ส่ง embed เข้าห้อง Discord)
     * เช่น การส่งข้อความและการใช้คำสั่ง — ใช้ตัวกรอง "ยกเว้นไม่ต้อง log" ชุดเดียวกัน
     */
    recordActivity(guild: GuildRef, eventKey: 'messageSent' | 'commandUsed', payload: LogPayload): void {
        const guildId = guildIdOf(guild);
        if (!guildId || !this.settings.isLoaded(guildId) || !this.settings.getOptions(guildId).activityRecording) return;
        if (payload.context && this.isIgnored(guildId, payload.context)) return;
        this.activity.record(guildId, eventKey, payload);
    }

    // บันทึก log ตอนระบบคัดกรอง (anti-spam / bad words) ลบข้อความเอง
    logFilterAction(guild: GuildRef, { user, channelId, reason, content }: { user: UserLike; channelId: string; reason: string; content: string }): void {
        if (!this.isActive(guild, 'filterUsed')) return;
        void this.sendLog(guild, 'filterUsed', {
            title: '🚨 ใช้คำสั่งการคัดกรอง',
            context: { userId: user.id, channelId },
            description: `ระบบคัดกรองอัตโนมัติทำงานกับข้อความของ ${userLine(user)}`,
            fields: [
                field('👤 สมาชิก', `<@${user.id}>`),
                field('📺 ช่อง', `<#${channelId}>`),
                field('⚙️ ระบบที่ทำงาน', reason, false),
                field('💬 ข้อความที่ถูกจัดการ', content || '*(ไม่มีข้อความ)*', false),
            ],
        });
    }

    // ตรวจว่ามีลิงก์เชิญเซิร์ฟเวอร์อื่นในข้อความไหม (ท่าเดียวกับ Carl-bot) — คืน true ถ้าเจอ
    logInvitePosted(msg: Message | PartialMessage): boolean {
        if (!msg.guild || !this.isActive(msg.guild, 'invitePosted')) return false;
        const matches = [...(msg.content || '').matchAll(INVITE_PATTERN)];
        if (matches.length === 0 || !msg.author) return false;

        const parentId = 'parentId' in msg.channel ? msg.channel.parentId : null;
        void this.sendLog(msg.guild, 'invitePosted', {
            title: '📨 มีคนโพสต์ลิงก์เชิญ',
            context: { userId: msg.author.id, isBot: msg.author.bot, channelId: msg.channel.id, parentId, member: msg.member },
            description: `${userLine(msg.author)} โพสต์ลิงก์เชิญใน <#${msg.channel.id}> — [ไปที่ข้อความ](${msg.url})`,
            fields: [
                field('👤 ผู้โพสต์', `<@${msg.author.id}>`),
                field('📺 ช่อง', `<#${msg.channel.id}>`),
                field('🔗 โค้ดที่พบ', matches.map((m) => `\`${m[1]}\``).join(', '), false),
                field('💬 ข้อความ', msg.content, false),
            ],
        });
        return true;
    }
}
