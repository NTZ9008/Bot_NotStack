import { z } from 'zod';
import { SNOWFLAKE_RE } from './common';

// ==========================================
// 🌤️ DAILY WEATHER REPORT — รายงานสภาพอากาศประจำวัน (embed + กราฟพยากรณ์ + แผนที่เรดาร์ฝน)
// options เก็บเป็น JSON ในคอลัมน์ weather_settings.options — ทุกค่าที่มาจากหน้าเว็บผ่าน normalizeWeatherOptions ก่อนเสมอ:
// ตัดฟิลด์แปลกปลอม, บีบค่าให้อยู่ในช่วง, สีต้องเป็น #RRGGBB
// ข้อความ (หัวข้อ / รายละเอียด / ท้าย embed / ข้อความคู่ embed) ใช้ตัวแปร {location} {date} ... แทนค่าตอนส่ง
// รูปที่แนบมี 2 แบบ เปิด/ปิดแยกกัน: กราฟพยากรณ์ (chart) และแผนที่เรดาร์ฝน (radar) — เปิดทั้งคู่ = ส่ง 2 embed
// ==========================================

// รายงานส่งตามเวลาไทยเสมอ ไม่ว่าเซิร์ฟเวอร์จะตั้ง timezone ไว้เป็นอะไร
export const WEATHER_TIMEZONE = 'Asia/Bangkok';

export const WEATHER_LIMITS = {
    maxTitleLength: 200,
    maxDescriptionLength: 1000,
    maxFooterLength: 500,
    maxContentLength: 1000,
    maxLocationNameLength: 80,
} as const;

export const WEATHER_CHART_HOURS = [12, 24, 36, 48] as const;
export const WEATHER_THEMES = ['light', 'dark'] as const;
// ระดับซูมของแผนที่เรดาร์ (ภาพกว้าง 1200px): 8 ≈ 700 กม. / 9 ≈ 350 กม. / 10 ≈ 180 กม. — ยิ่งใกล้ ฝนยิ่งเบลอ
export const WEATHER_RADAR_ZOOMS = [8, 9, 10] as const;
// 0 = อาทิตย์ ... 6 = เสาร์ (ตรงกับ Date#getDay และ cron)
export const WEATHER_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export type WeatherTheme = (typeof WEATHER_THEMES)[number];

// ช่องข้อมูลใน embed — เลือกได้ว่าจะแสดงช่องไหน และเรียงลำดับเองได้ (วิธีคำนวณค่าอยู่ที่ backend weather/report)
export const WEATHER_FIELDS = [
    { key: 'temp', label: '🌡️ อุณหภูมิ', hint: 'อุณหภูมิตอนนี้' },
    { key: 'feelsLike', label: '🥵 รู้สึกเหมือน', hint: 'อุณหภูมิที่ร่างกายรู้สึก (รวมความชื้นและลม)' },
    { key: 'range', label: '🔺 สูงสุด / ต่ำสุด', hint: 'อุณหภูมิสูงสุด-ต่ำสุดใน 24 ชั่วโมงข้างหน้า' },
    { key: 'rain', label: '☔ โอกาสฝนตก', hint: 'โอกาสฝนตกสูงสุดและปริมาณฝนรวมใน 24 ชั่วโมงข้างหน้า' },
    { key: 'humidity', label: '💧 ความชื้น', hint: 'ความชื้นสัมพัทธ์ตอนนี้' },
    { key: 'wind', label: '💨 ลม', hint: 'ความเร็วลม (กม./ชม.) และทิศที่ลมพัดมา' },
    { key: 'pm25', label: '😷 PM2.5', hint: 'ฝุ่น PM2.5 ตอนนี้ พร้อมระดับตามเกณฑ์กรมควบคุมมลพิษ' },
    { key: 'sun', label: '🌅 ขึ้น / ตก', hint: 'เวลาพระอาทิตย์ขึ้นและตกของวันนี้' },
    { key: 'clouds', label: '☁️ เมฆปกคลุม', hint: 'สัดส่วนเมฆบนท้องฟ้าตอนนี้' },
    { key: 'visibility', label: '👁️ ทัศนวิสัย', hint: 'ระยะที่มองเห็นได้ชัด' },
    { key: 'pressure', label: '🧭 ความกดอากาศ', hint: 'ความกดอากาศที่ระดับน้ำทะเล' },
] as const;
export type WeatherFieldKey = (typeof WEATHER_FIELDS)[number]['key'];
const FIELD_KEYS = new Set<string>(WEATHER_FIELDS.map((f) => f.key));

// ตัวแปรที่ใช้ได้ในหัวข้อ / รายละเอียด / ท้าย embed / ข้อความคู่ embed
export const WEATHER_PLACEHOLDERS = [
    { key: 'location', label: 'ชื่อสถานที่' },
    { key: 'date', label: 'วันที่แบบเต็ม เช่น วันพฤหัสบดีที่ 24 กันยายน พ.ศ. 2569' },
    { key: 'time', label: 'เวลาของข้อมูลอากาศตอนนี้ เช่น 07:00' },
    { key: 'icon', label: 'emoji สภาพอากาศตอนนี้ เช่น 🌦️' },
    { key: 'condition', label: 'สภาพอากาศตอนนี้ เช่น ฝนเล็กน้อย' },
    { key: 'temp', label: 'อุณหภูมิตอนนี้ เช่น 31°C' },
    { key: 'max', label: 'อุณหภูมิสูงสุดใน 24 ชม.' },
    { key: 'min', label: 'อุณหภูมิต่ำสุดใน 24 ชม.' },
    { key: 'rain', label: 'โอกาสฝนตกสูงสุดใน 24 ชม. เช่น 80%' },
] as const;

export interface WeatherLocation {
    name: string;
    lat: number;
    lon: number;
    country: string;
}

export interface WeatherOptions {
    schedule: { time: string; days: number[] };
    location: WeatherLocation;
    embed: {
        color: string;
        title: string;
        description: string;
        footer: string;
        // ลิงก์หัวข้อไปหน้าเมืองนั้นบน OpenWeatherMap
        link: boolean;
        // รูปไอคอนสภาพอากาศมุมขวาบน — Discord จะเรียงช่องข้อมูลแถวละ 2 แทน 3 เมื่อมีรูปนี้
        thumbnail: boolean;
        timestamp: boolean;
        fields: WeatherFieldKey[];
    };
    chart: { enabled: boolean; hours: number; showRain: boolean; theme: WeatherTheme; color: string };
    // animated = GIF ย้อนหลัง 1 ชม. — ปิด = ภาพนิ่ง (PNG) ของภาพล่าสุด
    radar: { enabled: boolean; animated: boolean; zoom: number; theme: WeatherTheme };
}

export const WEATHER_DEFAULT_CONTENT = '☀️ พยากรณ์อากาศวันนี้';

export function defaultWeatherOptions(): WeatherOptions {
    return {
        schedule: { time: '07:00', days: [...WEATHER_DAYS] },
        // ค่าเดิมของระบบรายงานอากาศก่อนหน้านี้ ("Salaya,TH")
        location: { name: 'ศาลายา', lat: 13.8015, lon: 100.3242, country: 'TH' },
        embed: {
            color: '#F59E0B',
            title: 'รายงานสภาพอากาศ {location}',
            description: '{date}\n{icon} **{condition}**',
            footer: 'ข้อมูลจาก OpenWeatherMap',
            link: true,
            thumbnail: false,
            timestamp: true,
            fields: ['temp', 'feelsLike', 'range', 'rain', 'humidity', 'wind', 'pm25', 'sun', 'clouds'],
        },
        chart: { enabled: true, hours: 24, showRain: true, theme: 'light', color: '#F97316' },
        radar: { enabled: true, animated: true, zoom: 9, theme: 'light' },
    };
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
const color = (value: unknown, fallback: string) => (HEX_COLOR.test(String(value)) ? String(value).toUpperCase() : fallback);
const oneOf = <T>(list: readonly T[], value: unknown, fallback: T): T => (list.includes(value as T) ? (value as T) : fallback);
const text = (value: unknown, maxLength: number, fallback: string) => (typeof value === 'string' ? value.slice(0, maxLength) : fallback);

function normalizeSchedule(src: unknown, base: WeatherOptions['schedule']): WeatherOptions['schedule'] {
    const s = isObject(src) ? src : {};
    const days = Array.isArray(s.days)
        ? [...new Set(s.days.map(Number).filter((d) => (WEATHER_DAYS as readonly number[]).includes(d)))].sort((a, b) => a - b)
        : base.days;
    return { time: TIME.test(String(s.time)) ? String(s.time) : base.time, days };
}

function normalizeLocation(src: unknown, base: WeatherLocation): WeatherLocation {
    const l = isObject(src) ? src : {};
    const lat = Number(l.lat);
    const lon = Number(l.lon);
    // พิกัดใช้ไม่ได้ = ใช้สถานที่เดิมทั้งก้อน (ไม่ผสมชื่อใหม่กับพิกัดเก่า)
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return { ...base };
    const name = String(l.name ?? '')
        .trim()
        .slice(0, WEATHER_LIMITS.maxLocationNameLength);
    return {
        name: name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
        lat: Math.round(lat * 1e4) / 1e4,
        lon: Math.round(lon * 1e4) / 1e4,
        country: /^[A-Z]{2}$/.test(String(l.country)) ? String(l.country) : '',
    };
}

function normalizeEmbed(src: unknown, base: WeatherOptions['embed']): WeatherOptions['embed'] {
    const e = isObject(src) ? src : {};
    const fields = Array.isArray(e.fields) ? [...new Set(e.fields.filter((key): key is WeatherFieldKey => FIELD_KEYS.has(key as string)))] : base.fields;
    return {
        color: color(e.color, base.color),
        title: text(e.title, WEATHER_LIMITS.maxTitleLength, base.title),
        description: text(e.description, WEATHER_LIMITS.maxDescriptionLength, base.description),
        footer: text(e.footer, WEATHER_LIMITS.maxFooterLength, base.footer),
        link: bool(e.link, base.link),
        thumbnail: bool(e.thumbnail, base.thumbnail),
        timestamp: bool(e.timestamp, base.timestamp),
        fields,
    };
}

function normalizeChart(src: unknown, base: WeatherOptions['chart']): WeatherOptions['chart'] {
    const c = isObject(src) ? src : {};
    return {
        enabled: bool(c.enabled, base.enabled),
        hours: oneOf<number>(WEATHER_CHART_HOURS, Number(c.hours), base.hours),
        showRain: bool(c.showRain, base.showRain),
        theme: oneOf(WEATHER_THEMES, c.theme, base.theme),
        color: color(c.color, base.color),
    };
}

function normalizeRadar(src: unknown, base: WeatherOptions['radar']): WeatherOptions['radar'] {
    const r = isObject(src) ? src : {};
    return {
        enabled: bool(r.enabled, base.enabled),
        animated: bool(r.animated, base.animated),
        zoom: oneOf<number>(WEATHER_RADAR_ZOOMS, Number(r.zoom), base.zoom),
        theme: oneOf(WEATHER_THEMES, r.theme, base.theme),
    };
}

// options ในฐานข้อมูลอาจมาจากโค้ดเวอร์ชันเก่า — ผ่านตัวนี้ทุกครั้งที่อ่าน จะได้มีฟิลด์ครบเสมอ
export function normalizeWeatherOptions(input: unknown): WeatherOptions {
    const src = isObject(input) ? input : {};
    const base = defaultWeatherOptions();
    return {
        schedule: normalizeSchedule(src.schedule, base.schedule),
        location: normalizeLocation(src.location, base.location),
        embed: normalizeEmbed(src.embed, base.embed),
        chart: normalizeChart(src.chart, base.chart),
        radar: normalizeRadar(src.radar, base.radar),
    };
}

// แทน {key} ด้วยค่าใน vars — ตัวแปรที่ไม่รู้จักปล่อยไว้ตามเดิม ผู้ใช้จะได้เห็นว่าพิมพ์ผิด
export function fillWeatherPlaceholders(template: string, vars: Record<string, string>): string {
    return String(template ?? '').replace(/\{(\w+)\}/g, (match, key: string) => (Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match));
}

// embed ที่ไม่มีอะไรเลย Discord ไม่ยอมส่ง — ใช้เช็คก่อนบันทึก/ส่งทดสอบ
export const hasWeatherEmbedBody = ({ embed, chart, radar }: WeatherOptions): boolean =>
    Boolean(embed.title.trim() || embed.description.trim() || embed.fields.length || chart.enabled || radar.enabled);

// มีรูปแนบ = บอทต้องมีสิทธิ์แนบไฟล์ในห้องนั้นด้วย
export const weatherAttachesFiles = ({ chart, radar }: WeatherOptions): boolean => chart.enabled || radar.enabled;

// ==========================================
// API
// ==========================================
const channelIdField = z
    .string({ error: 'Channel ID ไม่ถูกต้อง' })
    .nullable()
    .transform((value) => (value ?? '').trim())
    .refine((value) => !value || SNOWFLAKE_RE.test(value), 'Channel ID ไม่ถูกต้อง');
const contentField = z
    .string({ error: 'ข้อความต้องเป็นตัวอักษร' })
    .max(WEATHER_LIMITS.maxContentLength, `ข้อความยาวเกิน ${WEATHER_LIMITS.maxContentLength} ตัวอักษร`);
const optionsField = z.unknown().transform(normalizeWeatherOptions);

// บันทึกเฉพาะฟิลด์ที่ส่งมา (สวิตช์เปิด/ปิดส่งมาแค่ enabled)
export const weatherSettingsInputSchema = z.object({
    enabled: z.boolean({ error: 'enabled ต้องเป็น true หรือ false' }).optional(),
    channelId: channelIdField.optional(),
    content: contentField.optional(),
    options: optionsField.optional(),
});
export type WeatherSettingsInput = z.input<typeof weatherSettingsInputSchema>;

// ตัวอย่าง / ส่งทดสอบ ใช้ค่าที่กำลังแก้อยู่ในหน้าเว็บ (ยังไม่ต้องบันทึก)
export const weatherPreviewSchema = z.object({
    content: contentField.optional().transform((value) => value ?? ''),
    options: optionsField.optional().transform((value) => value ?? defaultWeatherOptions()),
});

export const weatherTestSchema = weatherPreviewSchema.extend({
    channelId: channelIdField.optional().transform((value) => value ?? ''),
});

export interface WeatherSettings {
    enabled: boolean;
    channelId: string;
    content: string;
    options: WeatherOptions;
    lastRunAt: string | null;
    // null = ส่งสำเร็จ
    lastError: string | null;
    updatedAt: string;
    // เวลาที่จะส่งครั้งถัดไป (null = ปิดอยู่ / ยังไม่ได้ตั้งเวลา)
    nextRunAt: string | null;
}

export interface WeatherSaveResponse {
    success: true;
    settings: WeatherSettings;
    // บันทึกได้ แต่บอทยังส่งเข้าห้องที่เลือกไม่ได้ (ห้องผิด / ไม่มีสิทธิ์)
    warning: string | null;
}

export interface WeatherMeta {
    apiKeyConfigured: boolean;
    timezone: string;
    fields: typeof WEATHER_FIELDS;
    placeholders: typeof WEATHER_PLACEHOLDERS;
    chartHours: readonly number[];
    radarZooms: readonly number[];
    limits: typeof WEATHER_LIMITS;
    defaultOptions: WeatherOptions;
}

export interface WeatherPlace {
    name: string;
    nameEn: string;
    state: string;
    country: string;
    lat: number;
    lon: number;
}

// embed แบบ JSON ของ discord.js (เฉพาะส่วนที่หน้าเว็บใช้แสดงตัวอย่าง)
export interface PreviewEmbed {
    color?: number;
    title?: string;
    url?: string;
    description?: string;
    fields?: { name: string; value: string; inline?: boolean }[];
    image?: { url: string };
    thumbnail?: { url: string };
    footer?: { text: string };
    timestamp?: string;
}

export interface WeatherPreviewResponse {
    content: string;
    embeds: PreviewEmbed[];
    // ชื่อไฟล์แนบ (attachment://ชื่อ) → data URL หรือ path ของ API (รูปเรดาร์ที่ใหญ่เกินจะยัดลง JSON)
    files: Record<string, string>;
    // ส่วนเสริมที่สร้างไม่สำเร็จ (เช่นเรดาร์) แต่ยังส่งรายงานส่วนที่เหลือได้
    warnings: string[];
    fetchedAt: number;
}
