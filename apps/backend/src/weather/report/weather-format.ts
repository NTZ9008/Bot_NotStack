// ==========================================
// 🔤 FORMAT — แปลงค่าจาก OpenWeatherMap เป็นข้อความภาษาไทย (ใช้ร่วมกันทั้ง embed และกราฟ)
// เวลาทั้งหมดแสดงเป็นเวลาท้องถิ่นของ "สถานที่" (ใช้ offset จาก API) ไม่ใช่ timezone ของเซิร์ฟเวอร์
// ==========================================

// รหัสไอคอนของ OpenWeatherMap (01d, 10n ...) → emoji
const ICON_EMOJI: Record<string, string> = {
    '01d': '☀️', '01n': '🌙',
    '02d': '🌤️', '02n': '☁️',
    '03d': '⛅', '03n': '☁️',
    '04d': '☁️', '04n': '☁️',
    '09d': '🌧️', '09n': '🌧️',
    '10d': '🌦️', '10n': '🌧️',
    '11d': '⛈️', '11n': '⛈️',
    '13d': '❄️', '13n': '❄️',
    '50d': '🌫️', '50n': '🌫️',
};
export const conditionEmoji = (icon: string | null | undefined): string => ICON_EMOJI[icon ?? ''] || '🌡️';

// Date ที่ "เลื่อน" เป็นเวลาท้องถิ่นแล้ว — อ่านค่าด้วย getUTC* / format ด้วย timeZone: 'UTC'
const shifted = (unix: number, offset: number) => new Date((unix + offset) * 1000);

const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('th-TH', { ...options, timeZone: 'UTC' });
const FULL_DATE = fmt({ dateStyle: 'full' });
const SHORT_DAY = fmt({ weekday: 'short', day: 'numeric', month: 'short' });

const pad = (n: number) => String(n).padStart(2, '0');

export function formatTime(unix: number, offset: number): string {
    const d = shifted(unix, offset);
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export const formatFullDate = (unix: number, offset: number): string => FULL_DATE.format(shifted(unix, offset));
export const formatShortDay = (unix: number, offset: number): string => SHORT_DAY.format(shifted(unix, offset));
// เลขวันแบบนับต่อเนื่อง ใช้เช็คว่าสองเวลาอยู่คนละวันหรือไม่
export const localDayNumber = (unix: number, offset: number): number => Math.floor((unix + offset) / 86400);

// ทิศที่ลม "พัดมาจาก" (องศาแบบเข็มทิศ 0 = เหนือ) → 8 ทิศ
const DIRECTIONS = ['เหนือ', 'ตะวันออกเฉียงเหนือ', 'ตะวันออก', 'ตะวันออกเฉียงใต้', 'ใต้', 'ตะวันตกเฉียงใต้', 'ตะวันตก', 'ตะวันตกเฉียงเหนือ'];
export const windDirection = (deg: number | null): string => (deg == null ? '' : DIRECTIONS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!);

// เกณฑ์ PM2.5 ของกรมควบคุมมลพิษ (ประกาศปี 2566) หน่วย µg/m³
const PM25_LEVELS = [
    { max: 15, emoji: '🔵', label: 'ดีมาก' },
    { max: 25, emoji: '🟢', label: 'ดี' },
    { max: 37.5, emoji: '🟡', label: 'ปานกลาง' },
    { max: 75, emoji: '🟠', label: 'เริ่มมีผลกระทบ' },
    { max: Infinity, emoji: '🔴', label: 'มีผลกระทบต่อสุขภาพ' },
];
export const pm25Level = (value: number) => PM25_LEVELS.find((level) => value <= level.max)!;

// 31.46 → "31.5" แต่ 31.0 → "31" (ไม่ต้องมี .0 ห้อยท้าย)
export const round1 = (n: number): string => String(Math.round(n * 10) / 10);
export const formatTemp = (n: number): string => `${round1(n)}°C`;
