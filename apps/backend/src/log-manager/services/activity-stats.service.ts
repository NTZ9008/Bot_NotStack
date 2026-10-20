import { timeOperation } from '../../common/utils/server-timing';
import { Injectable } from '@nestjs/common';
import type { ActivityInterval, ActivityStats } from '@notstack/shared';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { activityEventLabel } from '../utils/activity-humanize.util';
import {
    SERVER_JOIN_KEYS,
    SERVER_LEAVE_KEYS,
    VOICE_JOIN_KEYS,
    VOICE_KEYS,
    VOICE_LEAVE_KEYS,
    bucketLabels,
    breakdownFromSeries,
    buildDatasets,
    summarizeVoiceTime,
    type VoicePair,
} from '../utils/activity-stats.util';

// ชิ้นส่วน SQL ที่ใช้ซ้ำ — ค่าที่ต่อเข้าไปตรงๆ ถูกจำกัดให้เป็นค่าจากรายการที่กำหนดไว้เท่านั้น (ไม่รับค่าดิบจากผู้ใช้)
const INTERVALS: ActivityInterval[] = ['hour', 'day'];
const botFilter = (includeBots: boolean) => (includeBots ? Prisma.empty : Prisma.sql` AND is_bot = false`);
const safeInterval = (interval: string) => Prisma.raw(`'${INTERVALS.includes(interval as ActivityInterval) ? interval : 'day'}'`);
// ชื่อ time zone ผ่าน regex ก่อน (เช่น Asia/Bangkok) — ค่าที่ไม่เข้าเกณฑ์ใช้ค่าเริ่มต้น
const safeTimeZone = (tz: string) => Prisma.raw(`'${/^[A-Za-z]+(\/[A-Za-z_+-]+){0,2}$/.test(tz || '') ? tz : 'Asia/Bangkok'}'`);

// โซนเวลาที่มี CREATE STATISTICS ของนิพจน์ date_trunc(...) (ดู migration 20261021000000_activity_stats_planner)
// โซนนี้ GROUP BY ด้วย timestamp ได้แผน parallel hash aggregate (เร็วขึ้น 2-6 เท่า) — โซนอื่นใช้ GROUP BY ข้อความแบบเดิมซึ่งเร็วกว่าเมื่อไม่มีสถิติ
const PLANNER_STATS_TIMEZONES = new Set(['Asia/Bangkok']);

interface RangeFilter {
    guildId: string;
    from: Date;
    to: Date;
    includeBots: boolean;
}

// ==========================================
// 📊 ACTIVITY STATS — สถิติสำหรับหน้า Overview (อ่านจากตาราง activity_events ที่ ActivityService บันทึกไว้)
// ==========================================
@Injectable()
export class ActivityStatsService {
    constructor(private readonly prisma: PrismaService) {}

    // นับจำนวนเหตุการณ์แยกตามช่วงเวลา (ชั่วโมง/วัน) ตามโซนเวลาที่เลือก
    // ให้ Postgres คืนชื่อช่วงเป็นข้อความไปเลย (to_char) จะได้ไม่ต้องแปลงเวลาไปกลับให้เพี้ยน
    private async timeSeries({ guildId, from, to, includeBots, interval, timeZone }: RangeFilter & { interval: string; timeZone: string }) {
        const bucket = Prisma.sql`date_trunc(${safeInterval(interval)}, created_at AT TIME ZONE ${safeTimeZone(timeZone)})`;
        const groupKey = PLANNER_STATS_TIMEZONES.has(timeZone) ? bucket : Prisma.sql`1`;
        const rows = await this.prisma.$queryRaw<{ bucket: string; event_key: string; total: number }[]>`
            SELECT to_char(${bucket}, 'YYYY-MM-DD HH24:00') AS bucket,
                   event_key,
                   COUNT(*)::int AS total
            FROM activity_events
            WHERE guild_id = ${guildId}
              AND created_at >= ${from}
              AND created_at <= ${to}${botFilter(includeBots)}
            GROUP BY ${groupKey}, 2
            ORDER BY 1 ASC`;
        return rows.map((row) => ({ bucket: String(row.bucket), eventKey: row.event_key, total: Number(row.total) }));
    }

    // ใครเคลื่อนไหวมากสุด — นับจำนวนเหตุการณ์ทั้งหมด + แยกประเภทที่คนสนใจ
    private async topUsers({ guildId, from, to, includeBots, limit }: RangeFilter & { limit: number }) {
        const rows = await this.prisma.$queryRaw<
            {
                user_id: string;
                user_name: string | null;
                is_bot: boolean;
                total: number;
                messages: number;
                voice_joins: number;
                commands: number;
                last_seen: Date;
            }[]
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
                   SUM(joins)::int AS joins,
                   COUNT(user_id)::int AS members
            FROM (
                -- รวมต่อคนก่อน แทน COUNT(DISTINCT user_id) ที่บังคับให้ sort ทุกแถว
                SELECT channel_id, user_id, MAX(channel_name) AS channel_name, COUNT(*) AS joins
                FROM activity_events
                WHERE guild_id = ${guildId}
                  AND created_at >= ${from}
                  AND created_at <= ${to}
                  AND channel_id IS NOT NULL
                  AND event_key IN ('voiceJoin', 'voiceSwitch', 'voiceMoved')${botFilter(includeBots)}
                GROUP BY channel_id, user_id
            ) per_user
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

    // เวลาที่แต่ละคนอยู่ในห้องเสียง (นับเฉพาะช่วงที่เลือก — คนที่เข้าห้องอยู่ก่อนช่วงเวลาจะยังไม่ถูกนับจนกว่าจะมี event ใหม่)
    // จับคู่ "เข้า" กับ event ถัดไปของคนเดียวกันด้วย LEAD() ใน Postgres แล้วรวมเป็นยอดต่อ (คน, ห้อง)
    // — ไม่ต้องลากทุกแถวมาที่ Node (ห้องเสียงที่คนเยอะมีหลายหมื่นแถวต่อสัปดาห์)
    private async voiceTime({ guildId, from, to, includeBots }: RangeFilter) {
        const end = new Date(Math.min(to.getTime(), Date.now()));
        const rows = await this.prisma.$queryRaw<VoicePair[]>`
            SELECT user_id AS "userId",
                   MAX(user_name) AS "userName",
                   channel_id AS "channelId",
                   MAX(channel_name) AS "channelName",
                   COALESCE(SUM(ms) FILTER (WHERE ms > 0), 0)::float8 AS ms,
                   COUNT(*) FILTER (WHERE ms > 0)::int AS sessions
            FROM (
                SELECT user_id, user_name, channel_id, channel_name, event_key,
                       EXTRACT(EPOCH FROM (LEAST(COALESCE(LEAD(created_at) OVER w, ${end}), ${end}) - created_at)) * 1000 AS ms
                FROM activity_events
                WHERE guild_id = ${guildId}
                  AND created_at >= ${from}
                  AND created_at <= ${to}
                  AND event_key IN (${Prisma.join(VOICE_KEYS)})
                  AND user_id IS NOT NULL${botFilter(includeBots)}
                WINDOW w AS (PARTITION BY user_id ORDER BY id)
            ) ev
            WHERE event_key NOT IN (${Prisma.join(VOICE_LEAVE_KEYS)})
            GROUP BY user_id, channel_id`;
        return summarizeVoiceTime(rows);
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
        const [series, users, channels, voice] = await Promise.all([
            timeOperation('timeSeries', () => this.timeSeries({ ...range, interval, timeZone })),
            timeOperation('topUsers', () => this.topUsers({ ...range, limit })),
            timeOperation('topVoiceChannels', () => this.topVoiceChannels({ ...range, limit })),
            timeOperation('voiceTime', () => this.voiceTime(range)),
        ]);

        // รวมเป็นชุดข้อมูลที่หน้าเว็บเอาไปวาดกราฟได้เลย
        const labels = bucketLabels(from, to, interval, timeZone);
        const datasets = buildDatasets(labels, series);
        // สัดส่วนเหตุการณ์แยกตามชนิด (กราฟโดนัท + ยอดรวมด้านบน) — คิดจากผลรายช่วงเวลาที่ได้มาแล้ว ไม่ต้อง scan ตารางซ้ำ
        const breakdown = breakdownFromSeries(series).map((row) => ({ ...row, ...activityEventLabel(row.eventKey) }));

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
            truncated: false, // คำนวณใน Postgres ทั้งช่วงแล้ว ไม่มีการตัดแถว
        };
    }
}
