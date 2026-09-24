// ==========================================
// ⚙️ OPTIONS — การตั้งค่ารายงานสภาพอากาศ (เก็บเป็น JSON ในคอลัมน์ weather_settings.options)
// ทุกค่าที่มาจากหน้าเว็บผ่าน normalizeOptions ก่อนเสมอ: ตัดฟิลด์แปลกปลอม, บีบค่าให้อยู่ในช่วง, สีต้องเป็น #RRGGBB
// ข้อความ (หัวข้อ / รายละเอียด / ท้าย embed / ข้อความคู่ embed) ใช้ตัวแปร {location} {date} ... แทนค่าตอนส่ง
// ==========================================

// รายงานส่งตามเวลาไทยเสมอ ไม่ว่าเซิร์ฟเวอร์จะตั้ง timezone ไว้เป็นอะไร
const SCHEDULE_TIMEZONE = 'Asia/Bangkok';

const LIMITS = {
    maxTitleLength: 200,
    maxDescriptionLength: 1000,
    maxFooterLength: 500,
    maxContentLength: 1000,
    maxLocationNameLength: 80,
};

const CHART_HOURS = [12, 24, 36, 48];
const CHART_THEMES = ['light', 'dark'];

// ช่องข้อมูลใน embed — เลือกได้ว่าจะแสดงช่องไหน และเรียงลำดับเองได้ (วิธีคำนวณค่าอยู่ใน weather/report.js)
const FIELDS = [
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
];
const FIELD_KEYS = new Set(FIELDS.map((f) => f.key));

// ตัวแปรที่ใช้ได้ในหัวข้อ / รายละเอียด / ท้าย embed / ข้อความคู่ embed
const PLACEHOLDERS = [
    { key: 'location', label: 'ชื่อสถานที่' },
    { key: 'date', label: 'วันที่แบบเต็ม เช่น วันพฤหัสบดีที่ 24 กันยายน พ.ศ. 2569' },
    { key: 'time', label: 'เวลาของข้อมูลอากาศตอนนี้ เช่น 07:00' },
    { key: 'icon', label: 'emoji สภาพอากาศตอนนี้ เช่น 🌦️' },
    { key: 'condition', label: 'สภาพอากาศตอนนี้ เช่น ฝนเล็กน้อย' },
    { key: 'temp', label: 'อุณหภูมิตอนนี้ เช่น 31°C' },
    { key: 'max', label: 'อุณหภูมิสูงสุดใน 24 ชม.' },
    { key: 'min', label: 'อุณหภูมิต่ำสุดใน 24 ชม.' },
    { key: 'rain', label: 'โอกาสฝนตกสูงสุดใน 24 ชม. เช่น 80%' },
];

// 0 = อาทิตย์ ... 6 = เสาร์ (ตรงกับ Date#getDay และ node-schedule)
const DAYS = [0, 1, 2, 3, 4, 5, 6];

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

function defaultOptions() {
    return {
        schedule: {
            time: '07:00',
            days: [...DAYS],
        },
        // ค่าเดิมของระบบรายงานอากาศก่อนหน้านี้ ("Salaya,TH")
        location: {
            name: 'ศาลายา',
            lat: 13.8015,
            lon: 100.3242,
            country: 'TH',
        },
        embed: {
            color: '#F59E0B',
            title: 'รายงานสภาพอากาศ {location}',
            description: '{date}\n{icon} **{condition}**',
            footer: 'ข้อมูลจาก OpenWeatherMap',
            // ลิงก์หัวข้อไปหน้าเมืองนั้นบน OpenWeatherMap
            link: true,
            // รูปไอคอนสภาพอากาศมุมขวาบน — Discord จะเรียงช่องข้อมูลแถวละ 2 แทน 3 เมื่อมีรูปนี้
            thumbnail: false,
            timestamp: true,
            fields: ['temp', 'feelsLike', 'range', 'rain', 'humidity', 'wind', 'pm25', 'sun', 'clouds'],
        },
        chart: {
            enabled: true,
            hours: 24,
            showRain: true,
            theme: 'light',
            color: '#F97316',
        },
    };
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
const color = (value, fallback) => (HEX_COLOR.test(String(value)) ? String(value).toUpperCase() : fallback);
const oneOf = (list, value, fallback) => (list.includes(value) ? value : fallback);
const text = (value, maxLength, fallback) => (typeof value === 'string' ? value.slice(0, maxLength) : fallback);

function normalizeSchedule(src, base) {
    const s = isObject(src) ? src : {};
    const days = Array.isArray(s.days)
        ? [...new Set(s.days.map(Number).filter((d) => DAYS.includes(d)))].sort((a, b) => a - b)
        : base.days;
    return {
        time: TIME.test(String(s.time)) ? String(s.time) : base.time,
        days,
    };
}

function normalizeLocation(src, base) {
    const l = isObject(src) ? src : {};
    const lat = Number(l.lat);
    const lon = Number(l.lon);
    // พิกัดใช้ไม่ได้ = ใช้สถานที่เดิมทั้งก้อน (ไม่ผสมชื่อใหม่กับพิกัดเก่า)
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return { ...base };
    const name = String(l.name ?? '').trim().slice(0, LIMITS.maxLocationNameLength);
    return {
        name: name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
        lat: Math.round(lat * 1e4) / 1e4,
        lon: Math.round(lon * 1e4) / 1e4,
        country: /^[A-Z]{2}$/.test(String(l.country)) ? String(l.country) : '',
    };
}

function normalizeEmbed(src, base) {
    const e = isObject(src) ? src : {};
    const fields = Array.isArray(e.fields)
        ? [...new Set(e.fields.filter((key) => FIELD_KEYS.has(key)))]
        : base.fields;
    return {
        color: color(e.color, base.color),
        title: text(e.title, LIMITS.maxTitleLength, base.title),
        description: text(e.description, LIMITS.maxDescriptionLength, base.description),
        footer: text(e.footer, LIMITS.maxFooterLength, base.footer),
        link: bool(e.link, base.link),
        thumbnail: bool(e.thumbnail, base.thumbnail),
        timestamp: bool(e.timestamp, base.timestamp),
        fields,
    };
}

function normalizeChart(src, base) {
    const c = isObject(src) ? src : {};
    return {
        enabled: bool(c.enabled, base.enabled),
        hours: oneOf(CHART_HOURS, Number(c.hours), base.hours),
        showRain: bool(c.showRain, base.showRain),
        theme: oneOf(CHART_THEMES, c.theme, base.theme),
        color: color(c.color, base.color),
    };
}

// options ในฐานข้อมูลอาจมาจากโค้ดเวอร์ชันเก่า — ผ่านตัวนี้ทุกครั้งที่อ่าน จะได้มีฟิลด์ครบเสมอ
function normalizeOptions(input) {
    const src = isObject(input) ? input : {};
    const base = defaultOptions();
    return {
        schedule: normalizeSchedule(src.schedule, base.schedule),
        location: normalizeLocation(src.location, base.location),
        embed: normalizeEmbed(src.embed, base.embed),
        chart: normalizeChart(src.chart, base.chart),
    };
}

// แทน {key} ด้วยค่าใน vars — ตัวแปรที่ไม่รู้จักปล่อยไว้ตามเดิม ผู้ใช้จะได้เห็นว่าพิมพ์ผิด
function fillPlaceholders(template, vars) {
    return String(template ?? '').replace(/\{(\w+)\}/g, (match, key) =>
        Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match);
}

module.exports = {
    SCHEDULE_TIMEZONE,
    LIMITS,
    CHART_HOURS,
    CHART_THEMES,
    FIELDS,
    PLACEHOLDERS,
    defaultOptions,
    normalizeOptions,
    fillPlaceholders,
};
