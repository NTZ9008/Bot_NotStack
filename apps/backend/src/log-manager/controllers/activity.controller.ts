import { Controller, Get, Query } from '@nestjs/common';
import type { ActivityInterval, ActivityMeta, ActivityPage, ActivityStats } from '@notstack/shared';
import { GuildId } from '../../guilds/decorators/guild-id.decorator';
import { GuildRoute } from '../../guilds/decorators/guild-route.decorator';
import { ActivityQueryDto } from '../dto/activity-query.dto';
import { ActivityStatsQueryDto } from '../dto/activity-stats-query.dto';
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
    constructor(
        private readonly activity: ActivityService,
        private readonly settings: LogSettingsService,
    ) {}

    @Get('stats')
    stats(@GuildId() guildId: string, @Query() query: ActivityStatsQueryDto): Promise<ActivityStats> {
        return this.activity.stats({ guildId, ...resolveRange(query), timeZone: query.tz ?? 'Asia/Bangkok', limit: query.limit });
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
