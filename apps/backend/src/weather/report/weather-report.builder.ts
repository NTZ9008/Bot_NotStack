import { Logger } from '@nestjs/common';
import { fillWeatherPlaceholders, WEATHER_FIELDS, type WeatherFieldKey, type WeatherOptions } from '@notstack/shared';
import { AttachmentBuilder, EmbedBuilder, type MessageCreateOptions } from 'discord.js';
import type { ReportFile, WeatherData } from '../interfaces/weather-data.interface';
import { renderForecastChart } from './forecast-chart.renderer';
import { renderRadarMap } from './radar-map.renderer';
import * as fmt from './weather-format';

// ==========================================
// 📰 REPORT — ประกอบข้อความรายงานสภาพอากาศ: ข้อความธรรมดา + embed (ช่องข้อมูลแถวละ 3) + รูปกราฟ / แผนที่เรดาร์
// ใช้ทั้งตอนส่งจริง ส่งทดสอบ และตัวอย่างใน Dashboard
// ==========================================
const logger = new Logger('Weather');

const CHART_FILE = 'weather-chart.png';
const FIELD_LABELS = new Map<string, string>(WEATHER_FIELDS.map((field) => [field.key, field.label]));
const NO_DATA = 'ไม่มีข้อมูล';

export interface WeatherReport {
    content: string;
    embeds: EmbedBuilder[];
    files: ReportFile[];
    // ส่วนเสริมที่สร้างไม่สำเร็จ (เช่นเรดาร์) แต่ยังส่งรายงานส่วนที่เหลือได้
    warnings: string[];
}

interface Summary {
    max: number;
    min: number;
    pop: number | null;
    rainMm: number;
}

// สรุป 24 ชั่วโมงข้างหน้าจากพยากรณ์ทุก 3 ชม. (ใช้ทั้งช่องข้อมูลและตัวแปรในข้อความ)
function summarize({ current, forecast }: WeatherData): Summary {
    const next24 = forecast.filter((slot) => slot.dt > current.dt && slot.dt <= current.dt + 86400);
    const temps = [current.temp, ...next24.map((slot) => slot.temp)];
    return {
        max: Math.max(...temps),
        min: Math.min(...temps),
        pop: next24.length ? Math.max(...next24.map((slot) => slot.pop)) : null,
        rainMm: next24.reduce((sum, slot) => sum + slot.rain, 0),
    };
}

// ค่าในแต่ละช่อง — บรรทัดแรกคือค่าหลัก บรรทัดที่สอง (ถ้ามี) คือรายละเอียด
const FIELD_VALUES: Record<WeatherFieldKey, (w: WeatherData, s: Summary) => string> = {
    temp: ({ current }) => fmt.formatTemp(current.temp),
    feelsLike: ({ current }) => fmt.formatTemp(current.feelsLike),
    range: (_w, s) => `${Math.round(s.max)}° / ${Math.round(s.min)}°`,
    rain: (_w, s) => {
        if (s.pop == null) return NO_DATA;
        const chance = `${Math.round(s.pop * 100)}%`;
        return s.rainMm >= 0.1 ? `${chance}\nฝนรวม ~${fmt.round1(s.rainMm)} มม.` : chance;
    },
    humidity: ({ current }) => `${current.humidity}%`,
    wind: ({ current }) => {
        const kmh = Math.round(current.windSpeed * 3.6);
        if (kmh === 0) return 'ลมสงบ';
        const direction = fmt.windDirection(current.windDeg);
        return direction ? `${kmh} กม./ชม.\nทิศ${direction}` : `${kmh} กม./ชม.`;
    },
    pm25: ({ air }) => {
        if (air?.pm25 == null) return NO_DATA;
        const level = fmt.pm25Level(air.pm25);
        return `${fmt.round1(air.pm25)} µg/m³\n${level.emoji} ${level.label}`;
    },
    sun: ({ current, timezone }) =>
        current.sunrise && current.sunset ? `${fmt.formatTime(current.sunrise, timezone)} / ${fmt.formatTime(current.sunset, timezone)}` : NO_DATA,
    clouds: ({ current }) => (current.clouds == null ? NO_DATA : `${current.clouds}%`),
    visibility: ({ current }) => {
        if (current.visibility == null) return NO_DATA;
        // API ให้ค่าได้สูงสุด 10 กม.
        return current.visibility >= 10000 ? '10 กม. ขึ้นไป' : `${fmt.round1(current.visibility / 1000)} กม.`;
    },
    pressure: ({ current }) => `${current.pressure} hPa`,
};

function buildVars(options: WeatherOptions, weather: WeatherData, summary: Summary): Record<string, string> {
    const { current, timezone } = weather;
    return {
        location: options.location.name,
        date: fmt.formatFullDate(current.dt, timezone),
        time: fmt.formatTime(current.dt, timezone),
        icon: fmt.conditionEmoji(current.icon),
        condition: current.condition,
        temp: fmt.formatTemp(current.temp),
        max: `${Math.round(summary.max)}°C`,
        min: `${Math.round(summary.min)}°C`,
        rain: summary.pop == null ? '-' : `${Math.round(summary.pop * 100)}%`,
    };
}

export async function buildWeatherReport({ content, options }: { content: string; options: WeatherOptions }, weather: WeatherData): Promise<WeatherReport> {
    const summary = summarize(weather);
    const vars = buildVars(options, weather, summary);
    const { embed: style, chart, radar } = options;
    const warnings: string[] = [];

    const embed = new EmbedBuilder().setColor(style.color as `#${string}`);
    const title = fillWeatherPlaceholders(style.title, vars).trim().slice(0, 256);
    if (title) {
        embed.setTitle(title);
        if (style.link && weather.cityId) embed.setURL(`https://openweathermap.org/city/${weather.cityId}`);
    }
    const description = fillWeatherPlaceholders(style.description, vars).trim().slice(0, 4096);
    if (description) embed.setDescription(description);
    if (style.fields.length) {
        embed.addFields(style.fields.map((key) => ({ name: FIELD_LABELS.get(key)!, value: FIELD_VALUES[key](weather, summary), inline: true })));
    }
    if (style.thumbnail && weather.current.icon) {
        embed.setThumbnail(`https://openweathermap.org/img/wn/${weather.current.icon}@2x.png`);
    }

    // เรดาร์กรมอุตุฯ ดึงไม่ได้ / สถานที่อยู่นอกพื้นที่ → ใช้ RainViewer แทน
    const renderRadar = () =>
        renderRadarMap(options.location, radar, weather.timezone).catch((err: Error) => {
            if (radar.source === 'rainviewer') throw err;
            logger.warn(`สร้างแผนที่เรดาร์กรมอุตุฯ ไม่สำเร็จ ใช้ RainViewer แทน: ${err.message}`);
            warnings.push(`แผนที่เรดาร์: ${err.message} — ใช้ภาพจาก RainViewer แทน`);
            return renderRadarMap(options.location, { ...radar, source: 'rainviewer' }, weather.timezone);
        });

    const [chartImage, radarMap] = await Promise.all([
        chart.enabled ? renderForecastChart(weather, chart) : null,
        // เรดาร์เป็นส่วนเสริม — แหล่งเรดาร์ / แผนที่ล่ม ก็ยังส่งรายงานส่วนที่เหลือได้
        radar.enabled
            ? renderRadar().catch((err: Error) => {
                  logger.warn(`สร้างแผนที่เรดาร์ไม่สำเร็จ: ${err.message}`);
                  warnings.push(`แผนที่เรดาร์: ${err.message}`);
                  return null;
              })
            : null,
    ]);

    const embeds = [embed];
    const files: ReportFile[] = [];
    if (chartImage) {
        embed.setImage(`attachment://${CHART_FILE}`);
        files.push({ name: CHART_FILE, contentType: 'image/png', buffer: chartImage });
    }
    if (radarMap) {
        // embed หนึ่งมีรูปใหญ่ได้รูปเดียว — มีกราฟอยู่แล้วให้เรดาร์ไปอยู่ embed ที่ 2 (สีแถบเดียวกัน)
        const target = chartImage ? new EmbedBuilder().setColor(style.color as `#${string}`) : embed;
        target.setImage(`attachment://${radarMap.name}`);
        if (target !== embed) embeds.push(target);
        files.push(radarMap);
    }

    // ข้อความท้าย + เวลา อยู่ท้ายสุดของรายงาน (embed สุดท้าย)
    const last = embeds[embeds.length - 1]!;
    const footer = fillWeatherPlaceholders(style.footer, vars).trim().slice(0, 2048);
    if (footer) last.setFooter({ text: footer });
    if (style.timestamp) last.setTimestamp(weather.fetchedAt);

    return { content: fillWeatherPlaceholders(content, vars).trim().slice(0, 2000), embeds, files, warnings };
}

// แท็กได้เฉพาะยศที่พิมพ์ไว้ในข้อความเอง (<@&id>) — ไม่ให้ @everyone / @here ทำงาน
export function toMessagePayload({ content, embeds, files }: WeatherReport): MessageCreateOptions {
    return {
        content: content || undefined,
        embeds,
        files: files.map((file) => new AttachmentBuilder(file.buffer, { name: file.name })),
        allowedMentions: { parse: [], roles: [...content.matchAll(/<@&(\d+)>/g)].map((m) => m[1]!) },
    };
}
