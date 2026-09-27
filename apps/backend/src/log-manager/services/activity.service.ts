import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import {
    ACTIVITY_ONLY_EVENTS,
    LOG_EVENT_MAP,
    type ActivityEventType,
    type ActivityInterval,
    type ActivityItem,
    type ActivityMeta,
    type ActivityMetadata,
    type ActivityPage,
    type ActivityStats,
} from '@notstack/shared';
import type { Env } from '../../config/env.validation';
import { DiscordService } from '../../discord/discord.service';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { LogPayload, UserLike } from '../interfaces/log-payload.interface';

const FLUSH_DELAY = 2000; // รอรวม event สักครู่ก่อนเขียนลง DB
const FLUSH_MAX = 100; // ถ้าค้างถึงจำนวนนี้ เขียนทันทีไม่ต้องรอ
const MAX_ROWS_PER_QUERY = 100000; // เพดานกันดึงข้อมูลหนักเกินไปตอนคำนวณสถิติ
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

// จัดกลุ่มเหตุการณ์สำหรับกราฟหน้า Overview
const SERVER_JOIN_KEYS = ['memberJoin'];
const SERVER_LEAVE_KEYS = ['memberLeave', 'memberKick', 'memberBan', 'memberPrune'];
const VOICE_JOIN_KEYS = ['voiceJoin'];
const VOICE_LEAVE_KEYS = ['voiceLeave', 'voiceDisconnected'];
// ย้ายห้อง = ออกจากห้องเดิมแล้วเข้าห้องใหม่ทันที (ใช้ตอนคำนวณเวลาอยู่ในห้องเสียง)
const VOICE_SWITCH_KEYS = ['voiceSwitch', 'voiceMoved'];
const VOICE_KEYS = [...VOICE_JOIN_KEYS, ...VOICE_LEAVE_KEYS, ...VOICE_SWITCH_KEYS];

// ชิ้นส่วน SQL ที่ใช้ซ้ำ — ค่าที่ต่อเข้าไปตรงๆ ถูกจำกัดให้เป็นค่าจากรายการที่กำหนดไว้เท่านั้น (ไม่รับค่าดิบจากผู้ใช้)
const INTERVALS: ActivityInterval[] = ['hour', 'day'];
const botFilter = (includeBots: boolean) => (includeBots ? Prisma.empty : Prisma.sql` AND is_bot = false`);
const safeInterval = (interval: string) => Prisma.raw(`'${INTERVALS.includes(interval as ActivityInterval) ? interval : 'day'}'`);
// ชื่อ time zone ผ่าน regex ก่อน (เช่น Asia/Bangkok) — ค่าที่ไม่เข้าเกณฑ์ใช้ค่าเริ่มต้น
const safeTimeZone = (tz: string) => Prisma.raw(`'${/^[A-Za-z]+(\/[A-Za-z_+-]+){0,2}$/.test(tz || '') ? tz : 'Asia/Bangkok'}'`);

function truncate(value: unknown, max: number): string {
    const str = String(value ?? '');
    return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

const displayName = (user: UserLike | null | undefined) => (user ? user.globalName || user.username || user.tag || user.id : null);

interface RangeFilter {
    guildId: string;
    from: Date;
    to: Date;
    includeBots: boolean;
}

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
// ใช้เป็นแหล่งข้อมูลของหน้า Overview (กราฟ) และ Activity Log (ตารางย้อนหลัง)
// เขียนลง DB แบบรวมเป็นชุด (batch) เพราะ event ของ Discord ยิงถี่มาก
// ==========================================
@Injectable()
export class ActivityService implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly logger = new Logger('Activity');
    private readonly buffer: Prisma.ActivityEventCreateManyInput[] = [];
    private flushTimer: NodeJS.Timeout | null = null;
    readonly retentionDays: number;

    constructor(
        private readonly prisma: PrismaService,
        private readonly discord: DiscordService,
        config: ConfigService<Env, true>,
    ) {
        this.retentionDays = config.get('ACTIVITY_LOG_RETENTION_DAYS', { infer: true });
    }

    eventMeta(eventKey: string): { label: string; group: string } | null {
        return LOG_EVENT_MAP.get(eventKey) ?? ACTIVITY_ONLY_EVENTS[eventKey as keyof typeof ACTIVITY_ONLY_EVENTS] ?? null;
    }

    // แคตตาล็อกให้ Dashboard เอาไปทำ dropdown ตัวกรอง
    listEventTypes(): ActivityEventType[] {
        const keys = [...LOG_EVENT_MAP.keys(), ...Object.keys(ACTIVITY_ONLY_EVENTS)];
        return keys.map((key) => {
            const meta = this.eventMeta(key);
            return { key, label: meta?.label || key, group: meta?.group || 'อื่นๆ' };
        });
    }

    // ==========================================
    // 🔤 แปลง mention ของ Discord ให้อ่านออกในหน้าเว็บ (<@123> → @ชื่อ, <#123> → #ห้อง, <t:...> → วันเวลา)
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

    private resolveRoleName(guildId: string, id: string): string | null {
        return this.discord.client.guilds.cache.get(guildId)?.roles.cache.get(id)?.name ?? null;
    }

    private humanize(guildId: string, text: unknown): string {
        if (!text) return '';
        return (
            String(text)
                // userLine() ของ Log Manager เขียนเป็น "<@id>\n`tag`" — ยุบให้เหลือชื่อเดียว
                .replace(/<@!?(\d+)>\s*`[^`]*`/g, (_, id: string) => `@${this.resolveUserName(id) || id}`)
                .replace(/<@!?(\d+)>/g, (_, id: string) => `@${this.resolveUserName(id) || id}`)
                .replace(/<@&(\d+)>/g, (_, id: string) => `@${this.resolveRoleName(guildId, id) || id}`)
                .replace(/<#(\d+)>/g, (_, id: string) => `#${this.resolveChannelName(id) || id}`)
                .replace(/<t:(\d+)(?::[tTdDfFR])?>/g, (_, sec: string) =>
                    new Date(Number(sec) * 1000).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }),
                )
                .replace(/`/g, '')
                .replace(/\s*\n\s*/g, ' · ')
                .trim()
        );
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
            summary: truncate(this.humanize(guildId, payload.description) || payload.title || this.eventMeta(eventKey)?.label || eventKey, 500),
            metadata: Object.keys(metadata).length ? (metadata as Prisma.InputJsonValue) : undefined,
            createdAt: new Date(),
        };
    }

    // เปิด/ปิดการบันทึกของแต่ละเซิร์ฟเวอร์ตรวจที่ LogDispatcher (ตัวกรอง ACTIVITY_RECORDING)
    record(guildId: string, eventKey: string, payload: LogPayload): void {
        try {
            this.buffer.push(this.buildRow(guildId, eventKey, payload));
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
            label: this.eventMeta(row.eventKey)?.label || row.eventKey,
            group: this.eventMeta(row.eventKey)?.group || 'อื่นๆ',
        }));
        return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
    }

    // ==========================================
    // 📊 สถิติสำหรับหน้า Overview
    // ==========================================

    // นับจำนวนเหตุการณ์แยกตามช่วงเวลา (ชั่วโมง/วัน) ตามโซนเวลาที่เลือก
    // ให้ Postgres คืนชื่อช่วงเป็นข้อความไปเลย (to_char) จะได้ไม่ต้องแปลงเวลาไปกลับให้เพี้ยน
    private async timeSeries({ guildId, from, to, includeBots, interval, timeZone }: RangeFilter & { interval: string; timeZone: string }) {
        const rows = await this.prisma.$queryRaw<{ bucket: string; event_key: string; total: number }[]>`
            SELECT to_char(date_trunc(${safeInterval(interval)}, created_at AT TIME ZONE ${safeTimeZone(timeZone)}),
                           'YYYY-MM-DD HH24:00') AS bucket,
                   event_key,
                   COUNT(*)::int AS total
            FROM activity_events
            WHERE guild_id = ${guildId}
              AND created_at >= ${from}
              AND created_at <= ${to}${botFilter(includeBots)}
            GROUP BY 1, 2
            ORDER BY 1 ASC`;
        return rows.map((row) => ({ bucket: String(row.bucket), eventKey: row.event_key, total: Number(row.total) }));
    }

    // ชื่อช่วงเวลาในรูปแบบเดียวกับที่ SQL คืนมา ('YYYY-MM-DD HH:00' ตามโซนเวลาที่เลือก)
    private formatBucket(date: Date, timeZone: string, interval: string): string {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            hourCycle: 'h23',
        })
            .formatToParts(date)
            .reduce<Record<string, string>>((acc, part) => {
                acc[part.type] = part.value;
                return acc;
            }, {});
        return `${parts.year}-${parts.month}-${parts.day} ${interval === 'hour' ? parts.hour : '00'}:00`;
    }

    // เติมช่วงเวลาที่ไม่มีเหตุการณ์ให้ครบ เพื่อให้เส้นกราฟไม่ขาดช่วง
    private bucketLabels(from: Date, to: Date, interval: string, timeZone: string): string[] {
        const step = interval === 'hour' ? 3600000 : 86400000;
        const labels: string[] = [];
        const seen = new Set<string>();
        const push = (date: Date) => {
            const label = this.formatBucket(date, timeZone, interval);
            if (seen.has(label)) return;
            seen.add(label);
            labels.push(label);
        };
        for (let t = from.getTime(); t <= to.getTime() && labels.length < 2000; t += step) push(new Date(t));
        push(to); // ช่องสุดท้ายต้องครอบคลุมเวลาสิ้นสุดเสมอ
        return labels;
    }

    // ใครเคลื่อนไหวมากสุด — นับจำนวนเหตุการณ์ทั้งหมด + แยกประเภทที่คนสนใจ
    private async topUsers({ guildId, from, to, includeBots, limit }: RangeFilter & { limit: number }) {
        const rows = await this.prisma.$queryRaw<
            { user_id: string; user_name: string | null; is_bot: boolean; total: number; messages: number; voice_joins: number; commands: number; last_seen: Date }[]
        >`
            SELECT user_id,
                   MAX(user_name) AS user_name,
                   bool_or(is_bot) AS is_bot,
                   COUNT(*)::int AS total,
                   COUNT(*) FILTER (WHERE event_key = 'messageSent')::int AS messages,
                   COUNT(*) FILTER (WHERE event_key = 'voiceJoin')::int AS voice_joins,
                   COUNT(*) FILTER (WHERE event_key = 'commandUsed')::int AS commands,
                   MAX(created_at) AS last_seen
            FROM activity_events
            WHERE guild_id = ${guildId}
              AND created_at >= ${from}
              AND created_at <= ${to}
              AND user_id IS NOT NULL${botFilter(includeBots)}
            GROUP BY user_id
            ORDER BY total DESC
            LIMIT ${limit}`;
        return rows.map((row) => ({
            userId: row.user_id,
            userName: row.user_name || row.user_id,
            isBot: row.is_bot,
            total: Number(row.total),
            messages: Number(row.messages),
            voiceJoins: Number(row.voice_joins),
            commands: Number(row.commands),
            lastSeen: new Date(row.last_seen).toISOString(),
        }));
    }

    // ห้องเสียงไหนถูกใช้มากสุด (นับจำนวนครั้งที่มีคนเข้า)
    private async topVoiceChannels({ guildId, from, to, includeBots, limit }: RangeFilter & { limit: number }) {
        const rows = await this.prisma.$queryRaw<{ channel_id: string; channel_name: string | null; joins: number; members: number }[]>`
            SELECT channel_id,
                   MAX(channel_name) AS channel_name,
                   COUNT(*)::int AS joins,
                   COUNT(DISTINCT user_id)::int AS members
            FROM activity_events
            WHERE guild_id = ${guildId}
              AND created_at >= ${from}
              AND created_at <= ${to}
              AND channel_id IS NOT NULL
              AND event_key IN ('voiceJoin', 'voiceSwitch', 'voiceMoved')${botFilter(includeBots)}
            GROUP BY channel_id
            ORDER BY joins DESC
            LIMIT ${limit}`;
        return rows.map((row) => ({
            channelId: row.channel_id,
            channelName: row.channel_name || row.channel_id,
            joins: Number(row.joins),
            members: Number(row.members),
        }));
    }

    /**
     * เวลาที่แต่ละคนอยู่ในห้องเสียง — จับคู่ "เข้า" กับ "ออก" ตามลำดับเวลาของแต่ละคน
     * นับเฉพาะช่วงที่เลือกเท่านั้น (คนที่เข้าห้องอยู่ก่อนช่วงเวลาที่เลือกจะยังไม่ถูกนับจนกว่าจะมี event ใหม่)
     */
    private async voiceTime({ guildId, from, to, includeBots }: RangeFilter) {
        const events = await this.prisma.activityEvent.findMany({
            where: {
                guildId,
                createdAt: { gte: from, lte: to },
                eventKey: { in: VOICE_KEYS },
                userId: { not: null },
                ...(includeBots ? {} : { isBot: false }),
            },
            select: { userId: true, userName: true, channelId: true, channelName: true, eventKey: true, createdAt: true },
            orderBy: { id: 'asc' },
            take: MAX_ROWS_PER_QUERY,
        });

        const endOfRange = Math.min(to.getTime(), Date.now());
        const open = new Map<string, { at: number; channelId: string | null; channelName: string | null }>();
        const perUser = new Map<string, { userName: string | null; ms: number; sessions: number }>();
        const perChannel = new Map<string, { channelName: string | null; ms: number }>();

        const close = (userId: string, at: number) => {
            const session = open.get(userId);
            if (!session) return;
            open.delete(userId);
            const ms = Math.max(0, Math.min(at, endOfRange) - session.at);
            if (ms <= 0) return;

            const user = perUser.get(userId) ?? { userName: null, ms: 0, sessions: 0 };
            user.ms += ms;
            user.sessions += 1;
            perUser.set(userId, user);

            if (session.channelId) {
                const channel = perChannel.get(session.channelId) ?? { channelName: session.channelName, ms: 0 };
                channel.ms += ms;
                if (!channel.channelName) channel.channelName = session.channelName;
                perChannel.set(session.channelId, channel);
            }
        };

        for (const ev of events) {
            const userId = ev.userId!;
            const at = ev.createdAt.getTime();
            const isLeave = VOICE_LEAVE_KEYS.includes(ev.eventKey);
            close(userId, at);
            if (!isLeave) open.set(userId, { at, channelId: ev.channelId, channelName: ev.channelName });

            const user = perUser.get(userId) ?? { userName: null, ms: 0, sessions: 0 };
            if (!user.userName) user.userName = ev.userName;
            perUser.set(userId, user);
        }
        // คนที่ยังอยู่ในห้องตอนสิ้นสุดช่วงเวลา — นับถึงตรงนั้น
        for (const userId of [...open.keys()]) close(userId, endOfRange);

        const users = [...perUser.entries()]
            .map(([userId, v]) => ({ userId, userName: v.userName || userId, minutes: Math.round(v.ms / 60000), sessions: v.sessions }))
            .filter((u) => u.minutes > 0)
            .sort((a, b) => b.minutes - a.minutes);

        const channels = [...perChannel.entries()]
            .map(([channelId, v]) => ({ channelId, channelName: v.channelName || channelId, minutes: Math.round(v.ms / 60000) }))
            .filter((c) => c.minutes > 0)
            .sort((a, b) => b.minutes - a.minutes);

        return { users, channels, truncated: events.length >= MAX_ROWS_PER_QUERY };
    }

    // สัดส่วนเหตุการณ์แยกตามชนิด (กราฟโดนัท + ยอดรวมด้านบน)
    private async eventBreakdown({ guildId, from, to, includeBots }: RangeFilter) {
        const rows = await this.prisma.activityEvent.groupBy({
            by: ['eventKey'],
            where: {
                guildId,
                createdAt: { gte: from, lte: to },
                ...(includeBots ? {} : { isBot: false }),
            },
            _count: { _all: true },
            orderBy: { _count: { eventKey: 'desc' } },
        });
        return rows.map((row) => ({
            eventKey: row.eventKey,
            label: this.eventMeta(row.eventKey)?.label || row.eventKey,
            group: this.eventMeta(row.eventKey)?.group || 'อื่นๆ',
            total: row._count._all,
        }));
    }

    async stats({
        guildId,
        from,
        to,
        interval,
        includeBots,
        timeZone,
        limit,
    }: RangeFilter & { interval: ActivityInterval; timeZone: string; limit: number }): Promise<ActivityStats> {
        const range = { guildId, from, to, includeBots };
        const [series, users, channels, breakdown, voice] = await Promise.all([
            this.timeSeries({ ...range, interval, timeZone }),
            this.topUsers({ ...range, limit }),
            this.topVoiceChannels({ ...range, limit }),
            this.eventBreakdown(range),
            this.voiceTime(range),
        ]);

        // รวมเป็นชุดข้อมูลที่หน้าเว็บเอาไปวาดกราฟได้เลย
        const labels = this.bucketLabels(from, to, interval, timeZone);
        const index = new Map(labels.map((label, i) => [label, i]));
        const emptySeries = () => new Array<number>(labels.length).fill(0);
        const datasets = {
            serverJoin: emptySeries(),
            serverLeave: emptySeries(),
            voiceJoin: emptySeries(),
            voiceLeave: emptySeries(),
            total: emptySeries(),
        };

        for (const point of series) {
            const i = index.get(point.bucket);
            if (i === undefined) continue;
            datasets.total[i]! += point.total;
            if (SERVER_JOIN_KEYS.includes(point.eventKey)) datasets.serverJoin[i]! += point.total;
            else if (SERVER_LEAVE_KEYS.includes(point.eventKey)) datasets.serverLeave[i]! += point.total;
            if (VOICE_JOIN_KEYS.includes(point.eventKey)) datasets.voiceJoin[i]! += point.total;
            else if (VOICE_LEAVE_KEYS.includes(point.eventKey)) datasets.voiceLeave[i]! += point.total;
        }

        const sumKeys = (keys: string[]) => breakdown.filter((row) => keys.includes(row.eventKey)).reduce((acc, row) => acc + row.total, 0);
        const totalEvents = breakdown.reduce((acc, row) => acc + row.total, 0);
        const voiceMinutes = voice.users.reduce((acc, u) => acc + u.minutes, 0);

        return {
            range: { from: from.toISOString(), to: to.toISOString(), interval, timeZone, includeBots },
            labels,
            datasets,
            summary: {
                totalEvents,
                serverJoin: sumKeys(SERVER_JOIN_KEYS),
                serverLeave: sumKeys(SERVER_LEAVE_KEYS),
                voiceJoin: sumKeys(VOICE_JOIN_KEYS),
                voiceLeave: sumKeys(VOICE_LEAVE_KEYS),
                messages: sumKeys(['messageSent']),
                activeUsers: users.length,
                voiceMinutes,
            },
            topUsers: users,
            topVoiceChannels: channels,
            topVoiceUsers: voice.users.slice(0, limit),
            voiceChannelMinutes: voice.channels.slice(0, limit),
            breakdown: breakdown.slice(0, 15),
            truncated: voice.truncated,
        };
    }

    // จำนวนเหตุการณ์ทั้งหมดที่เก็บอยู่ + ช่วงเวลาที่มีข้อมูล (ใช้บอกผู้ใช้ว่าเริ่มเก็บตั้งแต่เมื่อไหร่)
    async meta(guildId: string, enabled: boolean): Promise<ActivityMeta> {
        const [total, oldest] = await Promise.all([
            this.prisma.activityEvent.count({ where: { guildId } }),
            this.prisma.activityEvent.findFirst({ where: { guildId }, orderBy: { id: 'asc' }, select: { createdAt: true } }),
        ]);
        return {
            total,
            since: oldest?.createdAt.toISOString() ?? null,
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
