// ==========================================
// 🌐 OPENWEATHERMAP — ดึงข้อมูลอากาศ (ใช้ได้กับ API key แบบฟรี ไม่ต้องสมัคร One Call)
// - อากาศตอนนี้        /data/2.5/weather
// - พยากรณ์ทุก 3 ชม.   /data/2.5/forecast (ใช้ทำกราฟ + สูงสุด/ต่ำสุด/โอกาสฝนตก)
// - ฝุ่น PM2.5         /data/2.5/air_pollution
// - ค้นหาสถานที่       /geo/1.0/direct, /geo/1.0/reverse
// ข้อมูลของแต่ละพิกัดเก็บไว้ 10 นาที — หน้า Dashboard ขอตัวอย่างใหม่ทุกครั้งที่แก้ค่า จะได้ไม่ยิง API ซ้ำ
// ==========================================
const BASE_URL = 'https://api.openweathermap.org';
const TIMEOUT_MS = 8000;
const CACHE_MS = 10 * 60 * 1000;
const CACHE_SIZE = 16;
// 48 ชม. = 16 ช่วงๆ ละ 3 ชม. (+1 เผื่อช่วงแรกเริ่มก่อนเวลาปัจจุบัน)
const FORECAST_SLOTS = 17;

// error ที่อ่านแล้วเข้าใจได้ — expose = ส่งข้อความนี้กลับไปให้หน้าเว็บได้เลย
class WeatherApiError extends Error {
    constructor(message) {
        super(message);
        this.status = 502;
        this.expose = true;
        this.retryable = true;
    }
}

async function request(path, params) {
    const key = process.env.OPENWEATHER_KEY;
    if (!key) {
        const err = new WeatherApiError('ยังไม่ได้ตั้งค่า OPENWEATHER_KEY ในไฟล์ .env');
        err.retryable = false;
        throw err;
    }

    const url = new URL(path, BASE_URL);
    for (const [name, value] of Object.entries({ ...params, appid: key })) url.searchParams.set(name, value);

    let res;
    try {
        res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
        // ไม่ใส่ URL ลงในข้อความ — มี API key อยู่ใน query string
        throw new WeatherApiError(`ติดต่อ OpenWeatherMap ไม่ได้ (${err.name === 'TimeoutError' ? 'หมดเวลา' : err.message})`);
    }
    const data = await res.json().catch(() => null);
    if (res.ok) return data;

    if (res.status === 401) {
        const err = new WeatherApiError('OPENWEATHER_KEY ไม่ถูกต้อง หรือยังไม่เปิดใช้งาน');
        err.retryable = false;
        throw err;
    }
    if (res.status === 429) throw new WeatherApiError('เรียก OpenWeatherMap บ่อยเกินโควตา กรุณารอสักครู่');
    throw new WeatherApiError(`OpenWeatherMap ตอบกลับ ${res.status}${data?.message ? `: ${data.message}` : ''}`);
}

// ==========================================
// ค้นหาสถานที่ — พิมพ์ชื่อ (ไทย/อังกฤษ) หรือวางพิกัด "13.80, 100.32" จาก Google Maps ก็ได้
// ==========================================
const COORDS = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

const toPlace = (row) => ({
    name: row.local_names?.th || row.name,
    nameEn: row.local_names?.en || row.name,
    state: row.state || '',
    country: row.country || '',
    lat: row.lat,
    lon: row.lon,
});

async function searchLocations(query) {
    const q = String(query || '').trim();
    if (!q) return [];

    const coords = q.match(COORDS);
    if (coords) {
        const lat = Number(coords[1]);
        const lon = Number(coords[2]);
        if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return [];
        const rows = await request('/geo/1.0/reverse', { lat, lon, limit: 1 });
        const place = rows?.[0] ? toPlace(rows[0]) : { name: '', nameEn: '', state: '', country: '' };
        // ใช้พิกัดที่ผู้ใช้วางมาตรงๆ (reverse geocoding ใช้แค่หาชื่อ)
        return [{ ...place, name: place.name || q, lat, lon }];
    }

    const rows = await request('/geo/1.0/direct', { q, limit: 5 });
    if (rows?.length) return rows.map(toPlace);

    // บางชื่อ (เช่น "Salaya,TH") ไม่มีในฐานข้อมูล geocoding แต่มีในรายชื่อเมืองของ API อากาศ
    try {
        const data = await request('/data/2.5/weather', { q, lang: 'th' });
        return [{ name: data.name, nameEn: data.name, state: '', country: data.sys?.country || '', lat: data.coord.lat, lon: data.coord.lon }];
    } catch {
        return [];
    }
}

// ==========================================
// ข้อมูลอากาศของพิกัดเดียว (อากาศตอนนี้ + พยากรณ์ 48 ชม. + ฝุ่น)
// ==========================================
function toWeather(current, forecast, air) {
    const condition = current.weather?.[0] || {};
    return {
        fetchedAt: Date.now(),
        // วินาทีที่ต่างจาก UTC ของสถานที่นั้น (ไทย = 25200) — ใช้แสดงเวลาท้องถิ่นของสถานที่
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
        forecast: (forecast?.list || []).map((slot) => ({
            dt: slot.dt,
            temp: slot.main.temp,
            pop: slot.pop ?? 0,
            rain: slot.rain?.['3h'] ?? 0,
            icon: slot.weather?.[0]?.icon || '',
            condition: slot.weather?.[0]?.description || '',
        })),
        air: air?.list?.[0]
            ? { pm25: air.list[0].components?.pm2_5 ?? null, pm10: air.list[0].components?.pm10 ?? null }
            : null,
    };
}

const cache = new Map();

/**
 * @param {{lat: number, lon: number}} location
 * @param {{fresh?: boolean}} [opts] fresh = ไม่ใช้ข้อมูลใน cache (ใช้ตอนส่งรายงานจริง)
 */
async function fetchWeather({ lat, lon }, { fresh = false } = {}) {
    const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    const hit = cache.get(key);
    if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.promise;

    const params = { lat, lon, units: 'metric', lang: 'th' };
    const promise = Promise.all([
        request('/data/2.5/weather', params),
        request('/data/2.5/forecast', { ...params, cnt: FORECAST_SLOTS }),
        // ฝุ่นเป็นข้อมูลเสริม — ดึงไม่ได้ก็ยังส่งรายงานได้ (ช่อง PM2.5 จะขึ้นว่าไม่มีข้อมูล)
        request('/data/2.5/air_pollution', { lat, lon }).catch((err) => {
            console.warn('[Weather] ดึงข้อมูลฝุ่นไม่สำเร็จ:', err.message);
            return null;
        }),
    ]).then(([current, forecast, air]) => toWeather(current, forecast, air));

    // เก็บ promise ไว้เลย — คำขอที่เข้ามาพร้อมกันจะรอผลเดียวกัน ไม่ยิง API ซ้ำ
    cache.delete(key);
    cache.set(key, { at: Date.now(), promise });
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
    promise.catch(() => {
        if (cache.get(key)?.promise === promise) cache.delete(key);
    });
    return promise;
}

module.exports = { WeatherApiError, searchLocations, fetchWeather };
