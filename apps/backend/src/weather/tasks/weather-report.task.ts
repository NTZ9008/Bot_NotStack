import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { WEATHER_TIMEZONE } from '@notstack/shared';
import { CronJob } from 'cron';
import { Events, type Guild } from 'discord.js';
import { sleep } from '../../common/utils/parse.util';
import { OnDiscord } from '../../discord/decorators/on-discord.decorator';
import { WeatherException } from '../exceptions/weather.exception';
import { WeatherService, type StoredWeatherSettings } from '../weather.service';

// ส่งไม่สำเร็จ (API ล่ม / เน็ตหลุด) → ลองใหม่อีก 2 ครั้ง หลัง 1 และ 5 นาที
const RETRY_DELAYS_MS = [60 * 1000, 5 * 60 * 1000];

// ==========================================
// ⏰ DAILY WEATHER REPORT — ส่งรายงานตามเวลาที่ตั้งไว้ของแต่ละเซิร์ฟเวอร์ (เวลาไทยเสมอ)
// ตั้งเวลาใหม่ทุกครั้งที่บันทึกการตั้งค่า (ยกเลิกของเดิมก่อนเสมอ จะได้ไม่ส่งซ้ำ)
// ==========================================
@Injectable()
export class WeatherReportTask implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly logger = new Logger('Weather');
    private readonly jobs = new Map<string, CronJob>();

    constructor(private readonly weather: WeatherService) {}

    async onApplicationBootstrap(): Promise<void> {
        try {
            const rows = await this.weather.listEnabled();
            for (const { guildId, settings } of rows) this.schedule(guildId, settings);
            if (rows.length) this.logger.log(`🌤️ ตั้งเวลารายงานสภาพอากาศ ${rows.length} เซิร์ฟเวอร์`);
        } catch (err) {
            this.logger.error(`ตั้งเวลารายงานสภาพอากาศไม่สำเร็จ: ${(err as Error).message}`);
        }
    }

    onApplicationShutdown(): void {
        for (const job of this.jobs.values()) void job.stop();
        this.jobs.clear();
    }

    // บอทถูกเตะออกจากเซิร์ฟเวอร์ → หยุดส่ง (การตั้งค่ายังเก็บไว้ เชิญกลับมาแล้วบันทึกใหม่ก็ส่งต่อได้)
    @OnDiscord(Events.GuildDelete)
    onGuildLeave(guild: Guild): void {
        if (guild.available) this.cancel(guild.id);
    }

    private cancel(guildId: string): void {
        const job = this.jobs.get(guildId);
        if (job) void job.stop();
        this.jobs.delete(guildId);
    }

    schedule(guildId: string, settings: StoredWeatherSettings): void {
        this.cancel(guildId);
        const { time, days } = settings.options.schedule;
        if (!settings.enabled || !settings.channelId || !days.length) return;

        const [hour, minute] = time.split(':').map(Number);
        const job = CronJob.from({
            cronTime: `0 ${minute} ${hour} * * ${days.join(',')}`,
            timeZone: WEATHER_TIMEZONE,
            start: true,
            onTick: () => {
                this.run(guildId).catch((err: Error) => this.logger.error(`ระบบรายงานสภาพอากาศผิดพลาด (${guildId}): ${err.message}`));
            },
        });
        this.jobs.set(guildId, job);
    }

    // เวลาที่จะส่งครั้งถัดไป (null = ปิดอยู่ / ยังไม่ได้ตั้งเวลา)
    nextRunAt(guildId: string): Date | null {
        const job = this.jobs.get(guildId);
        return job ? job.nextDate().toJSDate() : null;
    }

    private async run(guildId: string): Promise<void> {
        for (let attempt = 0; ; attempt++) {
            // อ่านค่าใหม่ทุกรอบ — ระหว่างรอลองใหม่ แอดมินอาจปิดรายงานหรือเปลี่ยนห้องไปแล้ว
            const settings = await this.weather.getSettings(guildId);
            if (!settings.enabled) return;
            try {
                const channel = await this.weather.sendReport(guildId, settings);
                await this.weather.recordRun(guildId, null);
                this.logger.log(`ส่งรายงานสภาพอากาศเข้า #${channel.name ?? settings.channelId} (${guildId}) แล้ว`);
                return;
            } catch (err) {
                const retryable = !(err instanceof WeatherException) || err.retryable;
                const retry = retryable && attempt < RETRY_DELAYS_MS.length;
                this.logger.error(`ส่งรายงานไม่สำเร็จ (${guildId} ครั้งที่ ${attempt + 1})${retry ? ' — จะลองใหม่' : ''}: ${(err as Error).message}`);
                if (!retry) {
                    await this.weather.recordRun(guildId, (err as Error).message || String(err));
                    return;
                }
                await sleep(RETRY_DELAYS_MS[attempt]!);
            }
        }
    }
}
