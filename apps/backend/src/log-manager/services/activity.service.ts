import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import {
    ACTIVITY_ONLY_EVENTS,
    LOG_EVENT_MAP,
    type ActivityEventType,
    type ActivityItem,
    type ActivityMeta,
    type ActivityMetadata,
    type ActivityPage,
} from '@notstack/shared';
import type { Env } from '../../config/env.validation';
import { ResultCache } from '../../common/utils/result-cache';
import { DiscordService } from '../../discord/discord.service';
import { Prisma } from '../../generated/prisma/client';
import { LiveService } from '../../live/live.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { LogPayload, UserLike } from '../interfaces/log-payload.interface';
import { activityEventLabel, humanizeMentions, type MentionResolvers } from '../utils/activity-humanize.util';

const FLUSH_DELAY = 2000; // รอรวม event สักครู่ก่อนเขียนลง DB
const FLUSH_MAX = 100; // ถ้าค้างถึงจำนวนนี้ เขียนทันทีไม่ต้องรอ
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
// จำนวนที่เก็บไว้ / เริ่มเก็บเมื่อไหร่ เป็นแค่ข้อมูลประกอบ — count ทั้งตารางของเซิร์ฟเวอร์ใหญ่ใช้เวลาเป็นร้อย ms จึง cache ไว้สั้นๆ
const META_CACHE_MS = 60 * 1000;

function truncate(value: unknown, max: number): string {
    const str = String(value ?? '');
    return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

const displayName = (user: UserLike | null | undefined) => (user ? user.globalName || user.username || user.tag || user.id : null);

export interface ActivityFilters {
    guildId: string;
    eventKeys?: string[];
    userId?: string;
    channelId?: string;
    q?: string;
    from?: Date;
    to?: Date;
    includeBots?: boolean;
    cursor?: number;
    limit: number;
}

// ==========================================
// 📈 ACTIVITY RECORDER (แยกตามเซิร์ฟเวอร์)
// บันทึกทุกเหตุการณ์ที่ Log Manager ดักจับได้ลงตาราง activity_events (ปิดได้ต่อเซิร์ฟเวอร์ที่หน้า Log Management)
// (ต่างจากการส่ง embed เข้าห้อง Discord ที่ต้องตั้งค่าห้องก่อนถึงจะทำงาน)
// ใช้เป็นแหล่งข้อมูลของหน้า Overview (กราฟ — ดู ActivityStatsService) และ Activity Log (ตารางย้อนหลัง)
// เขียนลง DB แบบรวมเป็นชุด (batch) เพราะ event ของ Discord ยิงถี่มาก
// ==========================================
@Injectable()
export class ActivityService implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly logger = new Logger('Activity');
    private readonly buffer: Prisma.ActivityEventCreateManyInput[] = [];
    private flushTimer: NodeJS.Timeout | null = null;
    private readonly metaCache = new ResultCache<{ total: number; since: string | null }>(META_CACHE_MS, 1000);
    readonly retentionDays: number;

    constructor(
        private readonly prisma: PrismaService,
        private readonly discord: DiscordService,
        private readonly live: LiveService,
        config: ConfigService<Env, true>,
    ) {
        this.retentionDays = config.get('ACTIVITY_LOG_RETENTION_DAYS', { infer: true });
    }

    // แคตตาล็อกให้ Dashboard เอาไปทำ dropdown ตัวกรอง
    listEventTypes(): ActivityEventType[] {
        const keys = [...LOG_EVENT_MAP.keys(), ...Object.keys(ACTIVITY_ONLY_EVENTS)];
        return keys.map((key) => ({ key, ...activityEventLabel(key) }));
    }

    // ==========================================
    // 🔤 แปลง mention ของ Discord ให้อ่านออกในหน้าเว็บ — หาชื่อจาก cache ของบอท
    // ==========================================
    private resolveUserName(id: string): string | null {
        const user = this.discord.client.users.cache.get(id);
        return user ? user.globalName || user.username : null;
    }

    private resolveChannelName(id: string | null | undefined): string | null {
        if (!id) return null;
        const channel = this.discord.client.channels.cache.get(id);
        return channel && 'name' in channel && channel.name ? channel.name : null;
    }

    private humanize(guildId: string, text: unknown): string {
        const resolvers: MentionResolvers = {
            user: (id) => this.resolveUserName(id),
            role: (id) => this.discord.client.guilds.cache.get(guildId)?.roles.cache.get(id)?.name ?? null,
            channel: (id) => this.resolveChannelName(id),
        };
        return humanizeMentions(text, resolvers);
    }

    // ==========================================
    // ✍️ บันทึกเหตุการณ์ — payload เป็นตัวเดียวกับที่ส่งให้ LogDispatcher.sendLog()
    // ==========================================
    private buildRow(guildId: string, eventKey: string, payload: LogPayload): Prisma.ActivityEventCreateManyInput {
        const ctx = payload.context ?? {};
        const extra = payload.record ?? {};
        const member = ctx.member ?? extra.member ?? null;
        const user: UserLike | null = extra.user ?? member?.user ?? null;
        const executor = extra.executor ?? null;

        const userId = extra.userId || ctx.userId || user?.id || null;
        const channelId = extra.channelId || ctx.channelId || null;
        const executorId = extra.executorId || executor?.id || null;

        const fields = (payload.fields ?? [])
            .filter((field): field is NonNullable<typeof field> => Boolean(field))
            .map((field) => ({ name: this.humanize(guildId, field.name), value: truncate(this.humanize(guildId, field.value), 500) }));

        const metadata: Record<string, unknown> = { ...(extra.metadata ?? {}) };
        if (fields.length) metadata.fields = fields;

        return {
            eventKey,
            guildId,
            userId,
            userName: truncate(extra.userName || displayName(user) || (userId ? this.resolveUserName(userId) : null) || '', 100) || null,
            isBot: Boolean(extra.isBot ?? ctx.isBot ?? user?.bot ?? false),
            channelId,
            channelName: truncate(extra.channelName || this.resolveChannelName(channelId) || '', 100) || null,
            executorId,
            executorName: truncate(extra.executorName || displayName(executor) || (executorId ? this.resolveUserName(executorId) : null) || '', 100) || null,
            summary: truncate(this.humanize(guildId, payload.description) || payload.title || activityEventLabel(eventKey).label, 500),
            metadata: Object.keys(metadata).length ? (metadata as Prisma.InputJsonValue) : undefined,
            createdAt: new Date(),
        };
    }

    // เปิด/ปิดการบันทึกของแต่ละเซิร์ฟเวอร์ตรวจที่ LogDispatcher (ตัวกรอง ACTIVITY_RECORDING)
    record(guildId: string, eventKey: string, payload: LogPayload): void {
        try {
            const row = this.buildRow(guildId, eventKey, payload);
            this.buffer.push(row);
            // ลูกโลกกิจกรรมสด — ใช้ข้อมูลชุดเดียวกับที่บันทึก (ปิดบันทึกของเซิร์ฟเวอร์ไหน ลูกโลกก็ไม่เห็นเซิร์ฟเวอร์นั้น)
            this.live.publish({
                guildId,
                eventKey,
                userId: row.userId,
                userName: row.userName,
                channelName: row.channelName,
                summary: row.summary,
                isBot: row.isBot,
            });
        } catch (err) {
            this.logger.error(`สร้างข้อมูล ${eventKey} ไม่สำเร็จ: ${(err as Error).message}`);
            return;
        }
        if (this.buffer.length >= FLUSH_MAX) {
            void this.flush();
            return;
        }
        if (!this.flushTimer) {
            this.flushTimer = setTimeout(() => void this.flush(), FLUSH_DELAY);
            this.flushTimer.unref?.();
        }
    }

    async flush(): Promise<void> {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        if (this.buffer.length === 0) return;
        const rows = this.buffer.splice(0, this.buffer.length);
        try {
            await this.prisma.activityEvent.createMany({ data: rows });
        } catch (err) {
            this.logger.error(`บันทึกลงฐานข้อมูลไม่สำเร็จ: ${(err as Error).message}`);
        }
    }

    onApplicationBootstrap(): void {
        void this.deleteOld();
    }

    // ปิดเซิร์ฟเวอร์ → เขียนที่ค้างอยู่ให้หมดก่อน
    async onApplicationShutdown(): Promise<void> {
        await this.flush();
    }

    // ==========================================
    // 🔎 ค้นหาเหตุการณ์ (ตาราง Activity Log — แบ่งหน้าด้วย cursor = id ตัวสุดท้ายของหน้าก่อน)
    // ==========================================
    private buildWhere({ guildId, eventKeys, userId, channelId, q, from, to, includeBots }: ActivityFilters): Prisma.ActivityEventWhereInput {
        const where: Prisma.ActivityEventWhereInput = { guildId };
        if (eventKeys?.length) where.eventKey = { in: eventKeys };
        if (userId) where.userId = userId;
        if (channelId) where.channelId = channelId;
        if (!includeBots) where.isBot = false;
        if (from || to) where.createdAt = { ...(from && { gte: from }), ...(to && { lte: to }) };
        if (q) {
            where.OR = [
                { userName: { contains: q, mode: 'insensitive' } },
                { executorName: { contains: q, mode: 'insensitive' } },
                { channelName: { contains: q, mode: 'insensitive' } },
                { summary: { contains: q, mode: 'insensitive' } },
                { userId: q },
            ];
        }
        return where;
    }

    async query(filters: ActivityFilters): Promise<ActivityPage> {
        const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
        const where = this.buildWhere(filters);
        if (filters.cursor) where.id = { lt: filters.cursor };

        const rows = await this.prisma.activityEvent.findMany({ where, orderBy: { id: 'desc' }, take: limit + 1 });
        const hasMore = rows.length > limit;
        const items: ActivityItem[] = (hasMore ? rows.slice(0, limit) : rows).map((row) => ({
            ...row,
            metadata: (row.metadata as ActivityMetadata | null) ?? null,
            createdAt: row.createdAt.toISOString(),
            ...activityEventLabel(row.eventKey),
        }));
        return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
    }

    // จำนวนเหตุการณ์ทั้งหมดที่เก็บอยู่ + ช่วงเวลาที่มีข้อมูล (ใช้บอกผู้ใช้ว่าเริ่มเก็บตั้งแต่เมื่อไหร่)
    async meta(guildId: string, enabled: boolean): Promise<ActivityMeta> {
        const stored = await this.metaCache.get(guildId, async () => {
            const [total, oldest] = await Promise.all([
                this.prisma.activityEvent.count({ where: { guildId } }),
                // เรียงตาม created_at ให้ใช้ index (guild_id, created_at) ได้ทันที
                this.prisma.activityEvent.findFirst({ where: { guildId }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
            ]);
            return { total, since: oldest?.createdAt.toISOString() ?? null };
        });
        return {
            total: stored.total,
            since: stored.since,
            retentionDays: this.retentionDays,
            enabled,
            eventTypes: this.listEventTypes(),
        };
    }

    // ลบเหตุการณ์เก่าเกินกำหนด (ACTIVITY_LOG_RETENTION_DAYS) ทุก 6 ชั่วโมง
    @Interval(CLEANUP_INTERVAL_MS)
    async deleteOld(): Promise<void> {
        try {
            await this.prisma.activityEvent.deleteMany({
                where: { createdAt: { lt: new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000) } },
            });
        } catch (err) {
            this.logger.error(`ล้างข้อมูลเก่าไม่สำเร็จ: ${(err as Error).message}`);
        }
    }
}
