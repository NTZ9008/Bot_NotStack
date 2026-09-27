import { HttpStatus, Injectable } from '@nestjs/common';
import {
    defaultWeatherOptions,
    normalizeWeatherOptions,
    WEATHER_DEFAULT_CONTENT,
    weatherAttachesFiles,
    type WeatherOptions,
} from '@notstack/shared';
import { PermissionFlagsBits, type SendableChannels } from 'discord.js';
import { BotConfigService } from '../bot-config/bot-config.service';
import { DiscordService } from '../discord/discord.service';
import type { Prisma, WeatherSetting } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OpenWeatherClient } from './clients/openweather.client';
import { WeatherException } from './exceptions/weather.exception';
import { buildWeatherReport, toMessagePayload } from './report/weather-report.builder';

export interface StoredWeatherSettings {
    enabled: boolean;
    channelId: string;
    content: string;
    options: WeatherOptions;
    lastRunAt: Date | null;
    lastError: string | null;
    updatedAt: Date;
}

export interface WeatherSettingsPatch {
    enabled?: boolean;
    channelId?: string;
    content?: string;
    options?: WeatherOptions;
}

const PERMISSION_LABELS = {
    ViewChannel: 'ดูห้อง',
    SendMessages: 'ส่งข้อความ',
    EmbedLinks: 'ฝังลิงก์ (Embed Links)',
    AttachFiles: 'แนบไฟล์',
} as const;

// options ในฐานข้อมูลอาจมาจากโค้ดเวอร์ชันเก่า — ผ่าน normalize ทุกครั้งที่อ่าน
const toSettings = (row: WeatherSetting): StoredWeatherSettings => ({
    enabled: row.enabled,
    channelId: row.channelId,
    content: row.content,
    options: normalizeWeatherOptions(row.options),
    lastRunAt: row.lastRunAt,
    lastError: row.lastError,
    updatedAt: row.updatedAt,
});

// ==========================================
// 🌤️ WEATHER — การตั้งค่ารายงานสภาพอากาศ (weather_settings เซิร์ฟเวอร์ละแถว) + ส่งรายงาน 1 ครั้ง
// การตั้งเวลาส่งอยู่ที่ WeatherReportTask
// ==========================================
@Injectable()
export class WeatherService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly discord: DiscordService,
        private readonly config: BotConfigService,
        private readonly owm: OpenWeatherClient,
    ) {}

    // ครั้งแรกที่เปิดหน้า Weather ของเซิร์ฟเวอร์: ใช้ห้อง GENERAL_CHANNEL_ID ของเซิร์ฟเวอร์นั้นเป็นค่าเริ่มต้น
    // เซิร์ฟเวอร์หลักเปิดไว้เลยเหมือนระบบเดิม ส่วนเซิร์ฟเวอร์อื่นปิดไว้ก่อนจนกว่าแอดมินจะเปิดเอง
    // skipDuplicates = ถ้ามีแถวอยู่แล้ว (เช่นสองคำขอเข้ามาพร้อมกัน) ไม่ทับค่าที่มีอยู่
    private async createDefault(guildId: string): Promise<WeatherSetting> {
        const channelId = (await this.config.get(guildId, 'GENERAL_CHANNEL_ID')) ?? '';
        await this.prisma.weatherSetting.createMany({
            data: [
                {
                    guildId,
                    enabled: this.discord.isHome(guildId) && Boolean(channelId),
                    channelId,
                    content: WEATHER_DEFAULT_CONTENT,
                    options: defaultWeatherOptions() as unknown as Prisma.InputJsonValue,
                },
            ],
            skipDuplicates: true,
        });
        return (await this.prisma.weatherSetting.findUnique({ where: { guildId } }))!;
    }

    async getSettings(guildId: string): Promise<StoredWeatherSettings> {
        const row = (await this.prisma.weatherSetting.findUnique({ where: { guildId } })) ?? (await this.createDefault(guildId));
        return toSettings(row);
    }

    async updateSettings(guildId: string, data: WeatherSettingsPatch): Promise<StoredWeatherSettings> {
        await this.getSettings(guildId); // สร้างแถวเริ่มต้นก่อน ถ้ายังไม่มี
        const { options, ...rest } = data;
        const row = await this.prisma.weatherSetting.update({
            where: { guildId },
            data: { ...rest, ...(options ? { options: options as unknown as Prisma.InputJsonValue } : {}) },
        });
        return toSettings(row);
    }

    // ทุกเซิร์ฟเวอร์ที่เปิดรายงานไว้ (ใช้ตั้งเวลาตอนเปิดเซิร์ฟเวอร์)
    async listEnabled(): Promise<{ guildId: string; settings: StoredWeatherSettings }[]> {
        const rows = await this.prisma.weatherSetting.findMany({ where: { enabled: true } });
        return rows.map((row) => ({ guildId: row.guildId, settings: toSettings(row) }));
    }

    // ผลการส่งตามเวลาครั้งล่าสุด (error = null คือส่งสำเร็จ) — แสดงในหน้า Dashboard
    async recordRun(guildId: string, error: string | null): Promise<void> {
        await this.prisma.weatherSetting.updateMany({
            where: { guildId },
            data: { lastRunAt: new Date(), lastError: error ? String(error).slice(0, 500) : null },
        });
    }

    // ห้องต้องเป็นห้องข้อความของเซิร์ฟเวอร์นี้ และบอทต้องมีสิทธิ์ครบ — ไม่อย่างนั้นโยน error ที่อ่านเข้าใจได้
    async resolveReportChannel(guildId: string, channelId: string, withFiles: boolean): Promise<SendableChannels & { name?: string }> {
        if (!this.discord.ready) throw new WeatherException('บอทยังไม่ออนไลน์', true, HttpStatus.SERVICE_UNAVAILABLE);
        if (!channelId) throw new WeatherException('ยังไม่ได้เลือกห้องที่จะส่ง', false);

        const channel = await this.discord.fetchGuildChannel(guildId, channelId);
        if (!channel) throw new WeatherException(`ไม่พบห้อง ${channelId} ในเซิร์ฟเวอร์นี้ (อาจถูกลบ หรือบอทมองไม่เห็นห้องนี้)`, false);
        const name = 'name' in channel ? channel.name : channelId;
        if (!('guild' in channel) || !channel.isTextBased() || channel.isVoiceBased() || !channel.isSendable()) {
            throw new WeatherException(`ห้อง #${name} ไม่ใช่ห้องข้อความของเซิร์ฟเวอร์`, false);
        }

        const me = channel.guild.members.me ?? (await channel.guild.members.fetchMe().catch(() => null));
        const required = ['ViewChannel', 'SendMessages', 'EmbedLinks', ...(withFiles ? (['AttachFiles'] as const) : [])] as const;
        const permissions = me ? channel.permissionsFor(me) : null;
        const missing = permissions ? required.filter((key) => !permissions.has(PermissionFlagsBits[key])) : [...required];
        if (missing.length) {
            throw new WeatherException(`บอทไม่มีสิทธิ์ ${missing.map((key) => PERMISSION_LABELS[key]).join(' / ')} ในห้อง #${name}`, false);
        }
        return channel;
    }

    /**
     * ส่งรายงาน 1 ครั้ง — ใช้ทั้งตอนถึงเวลาและปุ่ม "ส่งทดสอบ"
     * @param fresh ดึงข้อมูลอากาศใหม่ ไม่ใช้ cache
     */
    async sendReport(guildId: string, settings: { channelId: string; content: string; options: WeatherOptions }, { fresh = true } = {}) {
        const channel = await this.resolveReportChannel(guildId, settings.channelId, weatherAttachesFiles(settings.options));
        const weather = await this.owm.fetchWeather(settings.options.location, { fresh });
        const report = await buildWeatherReport(settings, weather);
        await channel.send(toMessagePayload(report));
        return channel;
    }
}
