import type { Response } from 'express';
import { ResultCache } from '../../common/utils/result-cache';
import { withServerTiming } from '../../common/utils/server-timing';
import { Controller, Get, Query, Res } from '@nestjs/common';
import type { ActivityInterval, ActivityMeta, ActivityPage, ActivityStats } from '@notstack/shared';
import { GuildId } from '../../guilds/decorators/guild-id.decorator';
import { GuildRoute } from '../../guilds/decorators/guild-route.decorator';
import { ActivityQueryDto } from '../dto/activity-query.dto';
import { ActivityStatsQueryDto } from '../dto/activity-stats-query.dto';
import { ActivityStatsService } from '../services/activity-stats.service';
import { ActivityService } from '../services/activity.service';
import { LogSettingsService } from '../services/log-settings.service';

const DEFAULT_RANGE_DAYS = 7;
const MAX_RANGE_DAYS = 365;
const DAY_MS = 86400000;

// ช่วงเวลาที่จะดู — ไม่ระบุ = 7 วันล่าสุด, ระบุเกิน 1 ปีจะถูกตัดให้เหลือ 1 ปี
function resolveRange(query: { from?: Date; to?: Date; interval?: ActivityInterval; includeBots: boolean }) {
    const to = query.to ?? new Date();
    const from = query.from ?? new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);
    const capped = new Date(Math.max(from.getTime(), to.getTime() - MAX_RANGE_DAYS * DAY_MS));
    const spanHours = (to.getTime() - capped.getTime()) / 3600000;
    // ไม่ได้เลือก interval เอง → ช่วงสั้น (ไม่เกิน 3 วัน) ดูรายชั่วโมง ที่เหลือดูรายวัน
    const interval: ActivityInterval = query.interval ?? (spanHours <= 72 ? 'hour' : 'day');
    return { from: capped, to, interval, includeBots: query.includeBots };
}

// ==========================================
// 🛰️ ACTIVITY — /api/guilds/:guildId/activity* (กราฟหน้า Overview + ตาราง Activity Log ของเซิร์ฟเวอร์)
// ==========================================
@GuildRoute()
@Controller('guilds/:guildId/activity')
export class ActivityController {
    private readonly statsCache = new ResultCache<ActivityStats>(15_000, 64, 4 * 1024 * 1024, (value) => Buffer.byteLength(JSON.stringify(value)));
    constructor(
        private readonly activity: ActivityService,
        private readonly activityStats: ActivityStatsService,
        private readonly settings: LogSettingsService,
    ) {}

    @Get('stats')
    stats(@GuildId() guildId: string, @Query() query: ActivityStatsQueryDto, @Res({ passthrough: true }) res: Response): Promise<ActivityStats> {
        // Rolling presets share a short bucket; explicit custom boundaries remain exact.
        const to = query.to ?? new Date(Math.floor(Date.now() / 15_000) * 15_000);
        const from = query.from ?? (query.hours ? new Date(to.getTime() - query.hours * 3600000) : undefined);
        const input = { guildId, ...resolveRange({ ...query, from, to }), timeZone: query.tz ?? 'Asia/Bangkok', limit: query.limit };
        const key = JSON.stringify(input);
        const load = () =>
            this.activityStats.stats(
                query.fresh && !query.to
                    ? {
                          ...input,
                          to: new Date(),
                          from: query.from ?? new Date(Date.now() - (query.hours ?? 168) * 3600000),
                      }
                    : input,
            );
        res.set('Cache-Control', 'no-store');
        return withServerTiming(res, () => this.statsCache.get(key, load, query.fresh));
    }

    @Get()
    list(@GuildId() guildId: string, @Query() query: ActivityQueryDto): Promise<ActivityPage> {
        const range = resolveRange(query);
        return this.activity.query({
            guildId,
            from: range.from,
            to: range.to,
            includeBots: range.includeBots,
            eventKeys: query.eventKey,
            userId: query.userId,
            channelId: query.channelId,
            q: query.q,
            cursor: query.cursor,
            limit: query.limit,
        });
    }

    // ข้อมูลประกอบหน้าเว็บ: ชนิดเหตุการณ์ทั้งหมด + เก็บข้อมูลมาตั้งแต่เมื่อไหร่
    @Get('meta')
    async meta(@GuildId() guildId: string): Promise<ActivityMeta> {
        const { activityRecording } = await this.settings.listOptions(guildId);
        return this.activity.meta(guildId, activityRecording);
    }
}
