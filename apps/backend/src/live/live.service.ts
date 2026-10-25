import crypto from 'node:crypto';
import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
    emptyLiveStats,
    liveKindOf,
    LIVE_KINDS,
    normalizeWeatherOptions,
    type LiveBatch,
    type LiveEvent,
    type LiveHello,
    type LiveHub,
    type LiveKind,
    type LivePoint,
    type LiveStats,
} from '@notstack/shared';
import { DiscordService } from '../discord/discord.service';
import { PrismaService } from '../prisma/prisma.service';
import { coarsePoint, DEFAULT_HUB, localePoint, scatterPoint } from './live-geo.util';

const TICK_MS = 500; // รวม event เป็นชุดก่อนส่ง — Discord ยิงถี่มาก ส่งทีละตัวจะหนักทั้งเครือข่ายและหน้าเว็บ
const STATS_EVERY_MS = 5000; // ไม่มี event ใหม่ก็ส่งสถิติให้ตัวเลขบนหน้าเว็บลดลงตามเวลา
const PING_EVERY_MS = 20_000; // กัน proxy (Cloudflare / nginx) ตัดการเชื่อมต่อที่เงียบนาน
const MAX_PENDING = 40; // ต่อผู้ชมต่อรอบ — เกินนี้ตัดทิ้ง (ยังนับในสถิติ)
const RECENT_SIZE = 150;
const HELLO_RECENT = 40;
const WINDOW_SECONDS = 60;
const HUB_REFRESH_MS = 10 * 60 * 1000;

export type LiveScope = 'public' | 'private';

export interface LiveInput {
    guildId: string;
    eventKey: string;
    userId?: string | null;
    userName?: string | null;
    channelName?: string | null;
    summary?: string | null;
    isBot?: boolean;
    // จุดเริ่มของเส้นโค้งที่ไม่ได้มาจากสมาชิก (เช่น PR จาก GitHub)
    from?: LivePoint;
    kind?: LiveKind;
}

interface LiveRecord {
    id: number;
    kind: LiveKind;
    eventKey: string;
    at: number;
    guildId: string;
    userId: string | null;
    userName: string | null;
    channelName: string | null;
    summary: string | null;
    from?: LivePoint;
}

export interface LiveSink {
    send(event: 'hello' | 'batch', data: LiveHello | LiveBatch): void;
    ping(): void;
}

interface Subscriber {
    scope: LiveScope;
    // null = ทุกเซิร์ฟเวอร์ (ฝั่ง public / ADMIN)
    guildIds: Set<string> | null;
    sink: LiveSink;
    pending: LiveRecord[];
    dropped: number;
}

// นับเหตุการณ์ต่อวินาที (วงแหวน 60 ช่อง) แยกตามเซิร์ฟเวอร์ — รวมเป็น "ต่อนาที" ตอนส่ง
interface Counter {
    seconds: Int32Array;
    counts: Int32Array; // [slot * kinds + kind]
}

// ==========================================
// 🌏 LIVE ACTIVITY — กระจายเหตุการณ์สดให้หน้าเว็บ (ลูกโลก 3D) ผ่าน Server-Sent Events
// รับเหตุการณ์ชุดเดียวกับ Activity Log (เคารพการปิดบันทึกของแต่ละเซิร์ฟเวอร์อยู่แล้ว) + PR จาก GitHub
// - public: ไม่มีชื่อคน / ห้อง / เซิร์ฟเวอร์ / id — ตำแหน่งปัดหยาบ และ seed ของจุดเปลี่ยนทุกวัน (ตามตัวคนข้ามวันไม่ได้)
// - private: เฉพาะเซิร์ฟเวอร์ที่ผู้ใช้จัดการได้ (สิทธิ์เดียวกับหน้า Activity Log)
// ไม่เก็บลงฐานข้อมูล — มีแค่ในหน่วยความจำ (ล่าสุด 150 รายการ)
// ==========================================
@Injectable()
export class LiveService implements OnModuleInit, OnApplicationShutdown {
    private readonly logger = new Logger('Live');
    private readonly subscribers = new Set<Subscriber>();
    private readonly recent: LiveRecord[] = [];
    private readonly counters = new Map<string, Counter>();
    private readonly weatherHubs = new Map<string, LivePoint>();
    private readonly salt = crypto.randomBytes(32);
    private nextId = 1;
    private timer: NodeJS.Timeout | null = null;
    private lastStatsAt = 0;
    private lastPingAt = 0;

    constructor(
        private readonly prisma: PrismaService,
        private readonly discord: DiscordService,
    ) {}

    onModuleInit(): void {
        void this.refreshHubs();
    }

    onApplicationShutdown(): void {
        this.stopTimer();
        this.subscribers.clear();
    }

    get subscriberCount(): number {
        return this.subscribers.size;
    }

    // ==========================================
    // 📍 ตำแหน่งของเซิร์ฟเวอร์: สถานที่ในหน้ารายงานอากาศ → ภาษาหลักของเซิร์ฟเวอร์ → กรุงเทพฯ
    // ==========================================
    @Interval(HUB_REFRESH_MS)
    async refreshHubs(): Promise<void> {
        try {
            const rows = await this.prisma.weatherSetting.findMany({ select: { guildId: true, options: true } });
            this.weatherHubs.clear();
            for (const row of rows) {
                const { lat, lon } = normalizeWeatherOptions(row.options).location;
                this.weatherHubs.set(row.guildId, { lat, lon });
            }
        } catch (err) {
            this.logger.warn(`โหลดตำแหน่งเซิร์ฟเวอร์ไม่สำเร็จ: ${(err as Error).message}`);
        }
    }

    hubPoint(guildId: string): LivePoint {
        return this.weatherHubs.get(guildId) ?? localePoint(this.discord.guild(guildId)?.preferredLocale) ?? DEFAULT_HUB;
    }

    private hmac(value: string, length = 12): string {
        return crypto.createHmac('sha256', this.salt).update(value).digest('hex').slice(0, length);
    }

    // key ของเซิร์ฟเวอร์ฝั่ง public — คงที่ตลอดอายุโปรเซส แต่ย้อนกลับเป็น guild id ไม่ได้
    private publicHubKey(guildId: string): string {
        return `h${this.hmac(`hub:${guildId}`)}`;
    }

    private hubOf(scope: LiveScope, guildId: string): LiveHub {
        const point = this.hubPoint(guildId);
        if (scope === 'public') return { key: this.publicHubKey(guildId), ...coarsePoint(point) };
        const guild = this.discord.guild(guildId);
        return { key: guildId, guildId, name: guild?.name ?? guildId, iconUrl: guild?.iconURL({ size: 64 }) ?? null, ...point };
    }

    // ==========================================
    // ✉️ รับเหตุการณ์ใหม่
    // ==========================================
    publish(input: LiveInput): void {
        if (input.isBot) return;
        const record: LiveRecord = {
            id: this.nextId++,
            kind: input.kind ?? liveKindOf(input.eventKey),
            eventKey: input.eventKey,
            at: Date.now(),
            guildId: input.guildId,
            userId: input.userId ?? null,
            userName: input.userName ?? null,
            channelName: input.channelName ?? null,
            summary: input.summary ?? null,
            from: input.from,
        };
        this.recent.push(record);
        if (this.recent.length > RECENT_SIZE) this.recent.splice(0, this.recent.length - RECENT_SIZE);
        this.count(record);

        for (const sub of this.subscribers) {
            if (sub.guildIds && !sub.guildIds.has(record.guildId)) continue;
            if (sub.pending.length >= MAX_PENDING) sub.dropped++;
            else sub.pending.push(record);
        }
    }

    private count(record: LiveRecord): void {
        const second = Math.floor(record.at / 1000);
        let counter = this.counters.get(record.guildId);
        if (!counter) {
            counter = { seconds: new Int32Array(WINDOW_SECONDS).fill(-1), counts: new Int32Array(WINDOW_SECONDS * LIVE_KINDS.length) };
            this.counters.set(record.guildId, counter);
        }
        const slot = second % WINDOW_SECONDS;
        if (counter.seconds[slot] !== second) {
            counter.seconds[slot] = second;
            counter.counts.fill(0, slot * LIVE_KINDS.length, (slot + 1) * LIVE_KINDS.length);
        }
        counter.counts[slot * LIVE_KINDS.length + LIVE_KINDS.indexOf(record.kind)]!++;
    }

    stats(guildIds: Set<string> | null, now = Date.now()): LiveStats {
        const stats = emptyLiveStats();
        const oldest = Math.floor(now / 1000) - WINDOW_SECONDS + 1;
        for (const [guildId, counter] of this.counters) {
            if (guildIds && !guildIds.has(guildId)) continue;
            for (let slot = 0; slot < WINDOW_SECONDS; slot++) {
                if (counter.seconds[slot]! < oldest) continue;
                LIVE_KINDS.forEach((kind, index) => {
                    const value = counter.counts[slot * LIVE_KINDS.length + index]!;
                    stats.perMinute[kind] += value;
                    stats.total += value;
                });
            }
        }
        return stats;
    }

    // ==========================================
    // 🔒 แปลงเป็นข้อมูลที่ส่งออก — ฝั่ง public ตัดทุกอย่างที่ระบุตัวคน / ห้อง / เซิร์ฟเวอร์ทิ้ง
    // ==========================================
    project(scope: LiveScope, record: LiveRecord): LiveEvent {
        const hub = this.hubPoint(record.guildId);
        if (scope === 'public') {
            const day = new Date(record.at).toISOString().slice(0, 10);
            const from = record.from ?? scatterPoint(coarsePoint(hub), this.hmac(`${day}:${record.guildId}:${record.userId ?? record.id}`, 32));
            return {
                id: record.id,
                kind: record.kind,
                eventKey: record.eventKey,
                at: new Date(record.at).toISOString(),
                from,
                hub: this.publicHubKey(record.guildId),
            };
        }
        return {
            id: record.id,
            kind: record.kind,
            eventKey: record.eventKey,
            at: new Date(record.at).toISOString(),
            from: record.from ?? scatterPoint(hub, `${record.guildId}:${record.userId ?? record.id}`),
            hub: record.guildId,
            guildId: record.guildId,
            guildName: this.discord.guild(record.guildId)?.name ?? undefined,
            userName: record.userName,
            channelName: record.channelName,
            summary: record.summary,
        };
    }

    // ==========================================
    // 📡 ผู้ชม
    // ==========================================
    subscribe(scope: LiveScope, guildIds: Set<string> | null, sink: LiveSink): () => void {
        const sub: Subscriber = { scope, guildIds, sink, pending: [], dropped: 0 };
        this.subscribers.add(sub);
        sink.send('hello', this.hello(scope, guildIds));
        this.startTimer();
        return () => {
            this.subscribers.delete(sub);
            if (this.subscribers.size === 0) this.stopTimer();
        };
    }

    // สิทธิ์ของผู้ใช้เปลี่ยน (ตรวจซ้ำเป็นระยะจาก controller)
    updateScope(sink: LiveSink, guildIds: Set<string> | null): void {
        for (const sub of this.subscribers) if (sub.sink === sink) sub.guildIds = guildIds;
    }

    hello(scope: LiveScope, guildIds: Set<string> | null): LiveHello {
        const client = this.discord.ready;
        const ids = guildIds ? [...guildIds] : client ? [...client.guilds.cache.keys()] : [];
        const hubs = new Map<string, LiveHub>();
        for (const guildId of ids) {
            const hub = this.hubOf(scope, guildId);
            hubs.set(hub.key, hub);
        }
        const records = this.recent.filter((record) => !guildIds || guildIds.has(record.guildId)).slice(-HELLO_RECENT);
        // เหตุการณ์เก่าของเซิร์ฟเวอร์ที่ไม่อยู่ในรายการ (บอทออกไปแล้ว) ยังต้องมีจุดให้เส้นวิ่งไปหา
        for (const record of records) {
            const hub = this.hubOf(scope, record.guildId);
            if (!hubs.has(hub.key)) hubs.set(hub.key, hub);
        }
        return { scope, hubs: [...hubs.values()], recent: records.map((record) => this.project(scope, record)), stats: this.stats(guildIds) };
    }

    private startTimer(): void {
        if (this.timer) return;
        this.timer = setInterval(() => this.tick(), TICK_MS);
        this.timer.unref?.();
    }

    private stopTimer(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    tick(now = Date.now()): void {
        const sendStats = now - this.lastStatsAt >= STATS_EVERY_MS;
        const sendPing = now - this.lastPingAt >= PING_EVERY_MS;
        if (sendStats) this.lastStatsAt = now;
        if (sendPing) this.lastPingAt = now;
        // public ทุกคนได้ข้อมูลชุดเดียวกัน — แปลงครั้งเดียวต่อรอบ
        const publicCache = new Map<number, LiveEvent>();
        let publicStats: LiveStats | null = null;

        for (const sub of [...this.subscribers]) {
            try {
                if (sub.pending.length || sub.dropped || sendStats) {
                    const events = sub.pending.map((record) => {
                        if (sub.scope === 'private') return this.project('private', record);
                        let event = publicCache.get(record.id);
                        if (!event) publicCache.set(record.id, (event = this.project('public', record)));
                        return event;
                    });
                    const stats = sub.scope === 'public' ? (publicStats ??= this.stats(null, now)) : this.stats(sub.guildIds, now);
                    sub.sink.send('batch', { events, stats, dropped: sub.dropped });
                    sub.pending = [];
                    sub.dropped = 0;
                } else if (sendPing) {
                    sub.sink.ping();
                }
            } catch (err) {
                // socket ปิดไปแล้วแต่ยังไม่ได้ยิน close — ถอดออกเลย
                this.logger.debug(`ส่งไม่สำเร็จ: ${(err as Error).message}`);
                this.subscribers.delete(sub);
            }
        }
        if (this.subscribers.size === 0) this.stopTimer();
    }
}
