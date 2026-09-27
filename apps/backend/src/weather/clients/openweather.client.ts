import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WeatherPlace } from '@notstack/shared';
import { EmbedBuilder } from 'discord.js';
import type { Env } from '../../config/env.validation';
import { weatherApiError } from '../exceptions/weather.exception';
import type { WeatherData } from '../interfaces/weather-data.interface';

const BASE_URL = 'https://api.openweathermap.org';
const TIMEOUT_MS = 8000;
const CACHE_MS = 10 * 60 * 1000;
const CACHE_SIZE = 16;
// 48 ชม. = 16 ช่วงๆ ละ 3 ชม. (+1 เผื่อช่วงแรกเริ่มก่อนเวลาปัจจุบัน)
const FORECAST_SLOTS = 17;

// รูปแบบ response ที่ใช้จาก OpenWeatherMap
interface OwmCondition {
    description?: string;
    icon?: string;
}
interface OwmCurrent {
    id?: number;
    name?: string;
    dt: number;
    timezone?: number;
    coord: { lat: number; lon: number };
    main: { temp: number; feels_like: number; humidity: number; pressure: number; sea_level?: number };
    wind?: { speed?: number; deg?: number };
    clouds?: { all?: number };
    visibility?: number;
    weather?: OwmCondition[];
    sys?: { country?: string; sunrise?: number; sunset?: number };
}
interface OwmForecast {
    list?: { dt: number; main: { temp: number }; pop?: number; rain?: { '3h'?: number }; weather?: OwmCondition[] }[];
}
interface OwmAir {
    list?: { components?: { pm2_5?: number; pm10?: number } }[];
}
interface OwmGeo {
    name: string;
    local_names?: Record<string, string>;
    state?: string;
    country?: string;
    lat: number;
    lon: number;
}

// พิมพ์ชื่อ (ไทย/อังกฤษ) หรือวางพิกัด "13.80, 100.32" จาก Google Maps ก็ได้
const COORDS = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

const toPlace = (row: OwmGeo): WeatherPlace => ({
    name: row.local_names?.th || row.name,
    nameEn: row.local_names?.en || row.name,
    state: row.state || '',
    country: row.country || '',
    lat: row.lat,
    lon: row.lon,
});

function toWeather(current: OwmCurrent, forecast: OwmForecast | null, air: OwmAir | null): WeatherData {
    const condition = current.weather?.[0] ?? {};
    return {
        fetchedAt: Date.now(),
        timezone: current.timezone ?? 0,
        cityId: current.id || null,
        cityName: current.name || '',
        current: {
            dt: current.dt,
            temp: current.main.temp,
            feelsLike: current.main.feels_like,
            humidity: current.main.humidity,
            pressure: current.main.sea_level ?? current.main.pressure,
            windSpeed: current.wind?.speed ?? 0,
            windDeg: current.wind?.deg ?? null,
            clouds: current.clouds?.all ?? null,
            visibility: current.visibility ?? null,
            condition: condition.description || '',
            icon: condition.icon || '',
            sunrise: current.sys?.sunrise ?? null,
            sunset: current.sys?.sunset ?? null,
        },
        forecast: (forecast?.list ?? []).map((slot) => ({
            dt: slot.dt,
            temp: slot.main.temp,
            pop: slot.pop ?? 0,
            rain: slot.rain?.['3h'] ?? 0,
            icon: slot.weather?.[0]?.icon || '',
            condition: slot.weather?.[0]?.description || '',
        })),
        air: air?.list?.[0] ? { pm25: air.list[0].components?.pm2_5 ?? null, pm10: air.list[0].components?.pm10 ?? null } : null,
    };
}

// ==========================================
// 🌐 OPENWEATHERMAP — ดึงข้อมูลอากาศ (ใช้ได้กับ API key แบบฟรี ไม่ต้องสมัคร One Call)
// - อากาศตอนนี้        /data/2.5/weather
// - พยากรณ์ทุก 3 ชม.   /data/2.5/forecast (ใช้ทำกราฟ + สูงสุด/ต่ำสุด/โอกาสฝนตก)
// - ฝุ่น PM2.5         /data/2.5/air_pollution
// - ค้นหาสถานที่       /geo/1.0/direct, /geo/1.0/reverse
// ข้อมูลของแต่ละพิกัดเก็บไว้ 10 นาที — หน้า Dashboard ขอตัวอย่างใหม่ทุกครั้งที่แก้ค่า จะได้ไม่ยิง API ซ้ำ
// ==========================================
@Injectable()
export class OpenWeatherClient {
    private readonly logger = new Logger('Weather');
    private readonly apiKey: string | undefined;
    private readonly cache = new Map<string, { at: number; promise: Promise<WeatherData> }>();

    constructor(config: ConfigService<Env, true>) {
        this.apiKey = config.get('OPENWEATHER_KEY', { infer: true });
    }

    get configured(): boolean {
        return Boolean(this.apiKey);
    }

    private async request<T>(path: string, params: Record<string, string | number>): Promise<T> {
        if (!this.apiKey) throw weatherApiError('ยังไม่ได้ตั้งค่า OPENWEATHER_KEY ในไฟล์ .env', false);

        const url = new URL(path, BASE_URL);
        for (const [name, value] of Object.entries({ ...params, appid: this.apiKey })) url.searchParams.set(name, String(value));

        let res: Response;
        try {
            res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        } catch (err) {
            // ไม่ใส่ URL ลงในข้อความ — มี API key อยู่ใน query string
            throw weatherApiError(`ติดต่อ OpenWeatherMap ไม่ได้ (${(err as Error).name === 'TimeoutError' ? 'หมดเวลา' : (err as Error).message})`);
        }
        const data = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
        if (res.ok) return data as T;

        if (res.status === 401) throw weatherApiError('OPENWEATHER_KEY ไม่ถูกต้อง หรือยังไม่เปิดใช้งาน', false);
        if (res.status === 429) throw weatherApiError('เรียก OpenWeatherMap บ่อยเกินโควตา กรุณารอสักครู่');
        throw weatherApiError(`OpenWeatherMap ตอบกลับ ${res.status}${data?.message ? `: ${data.message}` : ''}`);
    }

    async searchLocations(query: string): Promise<WeatherPlace[]> {
        const q = String(query || '').trim();
        if (!q) return [];

        const coords = q.match(COORDS);
        if (coords) {
            const lat = Number(coords[1]);
            const lon = Number(coords[2]);
            if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return [];
            const rows = await this.request<OwmGeo[]>('/geo/1.0/reverse', { lat, lon, limit: 1 });
            const place = rows?.[0] ? toPlace(rows[0]) : { name: '', nameEn: '', state: '', country: '' };
            // ใช้พิกัดที่ผู้ใช้วางมาตรงๆ (reverse geocoding ใช้แค่หาชื่อ)
            return [{ ...place, name: place.name || q, lat, lon }];
        }

        const rows = await this.request<OwmGeo[]>('/geo/1.0/direct', { q, limit: 5 });
        if (rows?.length) return rows.map(toPlace);

        // บางชื่อ (เช่น "Salaya,TH") ไม่มีในฐานข้อมูล geocoding แต่มีในรายชื่อเมืองของ API อากาศ
        try {
            const data = await this.request<OwmCurrent>('/data/2.5/weather', { q, lang: 'th' });
            return [{ name: data.name ?? q, nameEn: data.name ?? q, state: '', country: data.sys?.country || '', lat: data.coord.lat, lon: data.coord.lon }];
        } catch {
            return [];
        }
    }

    /**
     * อากาศตอนนี้ + พยากรณ์ 48 ชม. + ฝุ่น ของพิกัดเดียว
     * @param fresh ไม่ใช้ข้อมูลใน cache (ใช้ตอนส่งรายงานจริง)
     */
    fetchWeather({ lat, lon }: { lat: number; lon: number }, { fresh = false } = {}): Promise<WeatherData> {
        const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
        const hit = this.cache.get(key);
        if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.promise;

        const params = { lat, lon, units: 'metric', lang: 'th' };
        const promise = Promise.all([
            this.request<OwmCurrent>('/data/2.5/weather', params),
            this.request<OwmForecast>('/data/2.5/forecast', { ...params, cnt: FORECAST_SLOTS }),
            // ฝุ่นเป็นข้อมูลเสริม — ดึงไม่ได้ก็ยังส่งรายงานได้ (ช่อง PM2.5 จะขึ้นว่าไม่มีข้อมูล)
            this.request<OwmAir>('/data/2.5/air_pollution', { lat, lon }).catch((err: Error) => {
                this.logger.warn(`ดึงข้อมูลฝุ่นไม่สำเร็จ: ${err.message}`);
                return null;
            }),
        ]).then(([current, forecast, air]) => toWeather(current, forecast, air));

        // เก็บ promise ไว้เลย — คำขอที่เข้ามาพร้อมกันจะรอผลเดียวกัน ไม่ยิง API ซ้ำ
        this.cache.delete(key);
        this.cache.set(key, { at: Date.now(), promise });
        if (this.cache.size > CACHE_SIZE) this.cache.delete(this.cache.keys().next().value!);
        promise.catch(() => {
            if (this.cache.get(key)?.promise === promise) this.cache.delete(key);
        });
        return promise;
    }

    // embed แบบย่อของคำสั่ง /weather (ค้นหาจากชื่อเมือง) — null ถ้าหาเมืองไม่เจอหรือเรียก API ไม่สำเร็จ
    async cityEmbed(city: string): Promise<EmbedBuilder | null> {
        try {
            const data = await this.request<OwmCurrent>('/data/2.5/weather', { q: city, units: 'metric', lang: 'th' });
            const weather = data.weather?.[0];
            if (!weather) return null;
            return new EmbedBuilder()
                .setColor('#00A2E8')
                .setTitle(`🌤️ อากาศที่ ${data.name}, ${data.sys?.country ?? ''}`)
                .setDescription((weather.description ?? '').replace(/^\w/, (c) => c.toUpperCase()) || null)
                .addFields(
                    { name: '🌡️ อุณหภูมิ', value: `${data.main.temp} °C`, inline: true },
                    { name: '💨 ลม', value: `${data.wind?.speed ?? 0} m/s`, inline: true },
                    { name: '💧 ความชื้น', value: `${data.main.humidity}%`, inline: true },
                )
                .setThumbnail(`https://openweathermap.org/img/wn/${weather.icon}@2x.png`)
                .setFooter({ text: 'ข้อมูลจาก OpenWeatherMap' })
                .setTimestamp();
        } catch (err) {
            this.logger.warn(`/weather ${city}: ${(err as Error).message}`);
            return null;
        }
    }
}
