import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Logger, Param, Post, Query, Res } from '@nestjs/common';
import {
    defaultWeatherOptions,
    hasWeatherEmbedBody,
    WEATHER_FIELDS,
    WEATHER_LIMITS,
    WEATHER_PLACEHOLDERS,
    WEATHER_RADAR_ZOOMS,
    WEATHER_CHART_HOURS,
    WEATHER_TIMEZONE,
    weatherAttachesFiles,
    type SuccessResponse,
    type WeatherMeta,
    type WeatherPlace,
    type WeatherPreviewResponse,
    type WeatherSaveResponse,
    type WeatherSettings,
} from '@notstack/shared';
import type { Response } from 'express';
import { Audit, SkipAudit } from '../common/decorators/audit.decorator';
import { ApiException, badRequest, notFound } from '../common/exceptions/api.exception';
import { DiscordService } from '../discord/discord.service';
import { GuildId } from '../guilds/decorators/guild-id.decorator';
import { GuildRoute } from '../guilds/decorators/guild-route.decorator';
import { OpenWeatherClient } from './clients/openweather.client';
import { WeatherPreviewDto } from './dto/weather-preview.dto';
import { WeatherSettingsDto } from './dto/weather-settings.dto';
import { WeatherTestDto } from './dto/weather-test.dto';
import { getRenderedRadar } from './report/radar-map.renderer';
import { buildWeatherReport } from './report/weather-report.builder';
import { WeatherReportTask } from './tasks/weather-report.task';
import { WeatherService, type StoredWeatherSettings } from './weather.service';

// ==========================================
// 🌐 WEATHER API — /api/guilds/:guildId/weather/* (ผู้ที่จัดการเซิร์ฟเวอร์นั้นได้)
// ใช้แค่ GET/POST เหมือน API อื่น เพราะชั้นหน้าเว็บจริง (Cloudflare / web server) ตอบ 403 กับ PATCH / DELETE
// GET  meta        ค่าคงที่สำหรับสร้างฟอร์ม
// GET  settings    การตั้งค่าปัจจุบัน + เวลาส่งครั้งถัดไป + ผลการส่งครั้งล่าสุด
// POST settings    บันทึก (ส่งมาเฉพาะฟิลด์ที่แก้ก็ได้ เช่นสวิตช์เปิด/ปิดส่งมาแค่ enabled)
// GET  locations   ค้นหาสถานที่ (?q=ชื่อ หรือพิกัด)
// POST preview     สร้างตัวอย่างจากค่าที่กำลังแก้ (ยังไม่บันทึก)
// GET  radar/:key  รูปแผนที่เรดาร์ของตัวอย่างล่าสุด (GIF ใหญ่เกินจะยัดลง JSON)
// POST test        ส่งรายงานจากค่าที่กำลังแก้เข้าห้องจริงทันที
// ==========================================
@GuildRoute()
@Controller('guilds/:guildId/weather')
export class WeatherController {
    private readonly logger = new Logger('Weather');

    constructor(
        private readonly weather: WeatherService,
        private readonly scheduler: WeatherReportTask,
        private readonly owm: OpenWeatherClient,
        private readonly discord: DiscordService,
    ) {}

    // error ที่ตั้งใจส่งให้ผู้ใช้อ่าน (ข้อความภาษาไทย) ส่งต่อตามเดิม ที่เหลือ log ไว้แล้วตอบข้อความกลางๆ
    private fail(err: unknown, fallbackMessage: string): never {
        if (err instanceof HttpException) throw err;
        this.logger.error(`${fallbackMessage}: ${err instanceof Error ? err.stack : String(err)}`);
        throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, fallbackMessage);
    }

    private view(guildId: string, settings: StoredWeatherSettings): WeatherSettings {
        return {
            ...settings,
            lastRunAt: settings.lastRunAt?.toISOString() ?? null,
            updatedAt: settings.updatedAt.toISOString(),
            nextRunAt: this.scheduler.nextRunAt(guildId)?.toISOString() ?? null,
        };
    }

    private assertValid(settings: { enabled: boolean; channelId: string; options: StoredWeatherSettings['options'] }): void {
        if (!hasWeatherEmbedBody(settings.options)) {
            throw badRequest('รายงานว่างเปล่า — ต้องมีหัวข้อ รายละเอียด ช่องข้อมูล กราฟ หรือเรดาร์ อย่างน้อย 1 อย่าง');
        }
        if (!settings.enabled) return;
        if (!settings.channelId) throw badRequest('ต้องเลือกห้องที่จะส่งก่อนเปิดใช้งาน');
        if (!settings.options.schedule.days.length) throw badRequest('ต้องเลือกวันที่จะส่งอย่างน้อย 1 วันก่อนเปิดใช้งาน');
    }

    @Get('meta')
    meta(): WeatherMeta {
        return {
            apiKeyConfigured: this.owm.configured,
            timezone: WEATHER_TIMEZONE,
            fields: WEATHER_FIELDS,
            placeholders: WEATHER_PLACEHOLDERS,
            chartHours: WEATHER_CHART_HOURS,
            radarZooms: WEATHER_RADAR_ZOOMS,
            limits: WEATHER_LIMITS,
            defaultOptions: defaultWeatherOptions(),
        };
    }

    @Get('settings')
    async settings(@GuildId() guildId: string): Promise<WeatherSettings> {
        try {
            return this.view(guildId, await this.weather.getSettings(guildId));
        } catch (err) {
            this.fail(err, 'โหลดการตั้งค่ารายงานสภาพอากาศไม่สำเร็จ');
        }
    }

    @Audit('weather.settings_update')
    @Post('settings')
    @HttpCode(HttpStatus.OK)
    async save(@GuildId() guildId: string, @Body() data: WeatherSettingsDto): Promise<WeatherSaveResponse> {
        try {
            if (data.channelId && this.discord.ready && !(await this.discord.fetchGuildChannel(guildId, data.channelId))) {
                throw badRequest('ไม่พบห้องนี้ในเซิร์ฟเวอร์');
            }
            const current = await this.weather.getSettings(guildId);
            this.assertValid({ ...current, ...data });

            const settings = await this.weather.updateSettings(guildId, data);
            this.scheduler.schedule(guildId, settings);

            // เตือน (แต่ไม่ห้ามบันทึก) ถ้าห้องที่เลือกบอทส่งเข้าไปไม่ได้ — แอดมินอาจไปแก้สิทธิ์ใน Discord ทีหลัง
            let warning: string | null = null;
            if (settings.enabled && this.discord.ready) {
                warning = await this.weather
                    .resolveReportChannel(guildId, settings.channelId, weatherAttachesFiles(settings.options))
                    .then(() => null, (err: Error) => err.message);
            }
            return { success: true, settings: this.view(guildId, settings), warning };
        } catch (err) {
            this.fail(err, 'บันทึกการตั้งค่าไม่สำเร็จ');
        }
    }

    @Get('locations')
    async locations(@Query('q') q: unknown): Promise<WeatherPlace[]> {
        try {
            return await this.owm.searchLocations(String(q ?? '').slice(0, 100));
        } catch (err) {
            this.fail(err, 'ค้นหาสถานที่ไม่สำเร็จ');
        }
    }

    // POST ที่แค่สร้างตัวอย่าง ไม่ได้แก้ข้อมูล — ไม่ต้องลง audit log (ถูกเรียกทุกครั้งที่แก้ค่าในฟอร์ม)
    @SkipAudit()
    @Post('preview')
    @HttpCode(HttpStatus.OK)
    async preview(@GuildId() guildId: string, @Body() body: WeatherPreviewDto, @Res({ passthrough: true }) res: Response): Promise<WeatherPreviewResponse> {
        try {
            const weather = await this.owm.fetchWeather(body.options.location);
            const report = await buildWeatherReport(body, weather);
            // รูปกราฟเล็กพอส่งเป็น data URL ได้ แต่ภาพเรดาร์ (GIF หลาย MB) ให้หน้าเว็บโหลดผ่าน URL แยก เบราว์เซอร์จะได้ cache ไว้
            const files = Object.fromEntries(
                report.files.map((file) => [
                    file.name,
                    file.key ? `/api/guilds/${guildId}/weather/radar/${file.key}` : `data:${file.contentType};base64,${file.buffer.toString('base64')}`,
                ]),
            );
            res.set('Cache-Control', 'no-store');
            return {
                content: report.content,
                embeds: report.embeds.map((embed) => embed.toJSON()),
                files,
                warnings: report.warnings,
                fetchedAt: weather.fetchedAt,
            };
        } catch (err) {
            this.fail(err, 'สร้างตัวอย่างรายงานไม่สำเร็จ');
        }
    }

    @Get('radar/:key')
    async radar(@Param('key') key: string, @Res() res: Response): Promise<void> {
        const map = /^[0-9a-f]{16}$/.test(key) ? await getRenderedRadar(key) : null;
        if (!map) throw notFound('ไม่พบภาพเรดาร์นี้ (หมดอายุแล้ว) — แก้ค่าใดๆ เพื่อสร้างตัวอย่างใหม่');
        res.set('Cache-Control', 'private, max-age=600').type(map.contentType).send(map.buffer);
    }

    @Audit('weather.test_send')
    @Post('test')
    @HttpCode(HttpStatus.OK)
    async test(@GuildId() guildId: string, @Body() input: WeatherTestDto): Promise<SuccessResponse> {
        try {
            if (!this.discord.ready) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, 'บอทยังไม่ออนไลน์ กรุณาลองใหม่อีกครั้ง');
            if (!input.channelId) throw badRequest('กรุณาเลือกห้องที่จะส่งก่อน');
            this.assertValid({ ...input, enabled: false });

            // ใช้ข้อมูลอากาศชุดเดียวกับตัวอย่างที่เห็นในหน้าเว็บ (cache 10 นาที)
            const channel = await this.weather.sendReport(guildId, input, { fresh: false });
            return { success: true, message: `ส่งรายงานทดสอบเข้า #${channel.name ?? input.channelId} แล้ว` };
        } catch (err) {
            this.fail(err, 'ส่งรายงานทดสอบไม่สำเร็จ');
        }
    }
}
