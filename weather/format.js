// ==========================================
// 🔤 FORMAT — แปลงค่าจาก OpenWeatherMap เป็นข้อความภาษาไทย (ใช้ร่วมกันทั้ง embed และกราฟ)
// เวลาทั้งหมดแสดงเป็นเวลาท้องถิ่นของ "สถานที่" (ใช้ offset จาก API) ไม่ใช่ timezone ของเซิร์ฟเวอร์
// ==========================================

// รหัสไอคอนของ OpenWeatherMap (01d, 10n ...) → emoji
const ICON_EMOJI = {
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
const conditionEmoji = (icon) => ICON_EMOJI[icon] || '🌡️';

// Date ที่ "เลื่อน" เป็นเวลาท้องถิ่นแล้ว — อ่านค่าด้วย getUTC* / format ด้วย timeZone: 'UTC'
const shifted = (unix, offset) => new Date((unix + offset) * 1000);

const fmt = (options) => new Intl.DateTimeFormat('th-TH', { ...options, timeZone: 'UTC' });
const FULL_DATE = fmt({ dateStyle: 'full' });
const SHORT_DAY = fmt({ weekday: 'short', day: 'numeric', month: 'short' });

const pad = (n) => String(n).padStart(2, '0');

function formatTime(unix, offset) {
    const d = shifted(unix, offset);
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

const formatFullDate = (unix, offset) => FULL_DATE.format(shifted(unix, offset));
const formatShortDay = (unix, offset) => SHORT_DAY.format(shifted(unix, offset));
// เลขวันแบบนับต่อเนื่อง ใช้เช็คว่าสองเวลาอยู่คนละวันหรือไม่
const localDayNumber = (unix, offset) => Math.floor((unix + offset) / 86400);

// ทิศที่ลม "พัดมาจาก" (องศาแบบเข็มทิศ 0 = เหนือ) → 8 ทิศ
const DIRECTIONS = ['เหนือ', 'ตะวันออกเฉียงเหนือ', 'ตะวันออก', 'ตะวันออกเฉียงใต้', 'ใต้', 'ตะวันตกเฉียงใต้', 'ตะวันตก', 'ตะวันตกเฉียงเหนือ'];
const windDirection = (deg) => (deg == null ? '' : DIRECTIONS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]);

// เกณฑ์ PM2.5 ของกรมควบคุมมลพิษ (ประกาศปี 2566) หน่วย µg/m³
const PM25_LEVELS = [
    { max: 15, emoji: '🔵', label: 'ดีมาก' },
    { max: 25, emoji: '🟢', label: 'ดี' },
    { max: 37.5, emoji: '🟡', label: 'ปานกลาง' },
    { max: 75, emoji: '🟠', label: 'เริ่มมีผลกระทบ' },
    { max: Infinity, emoji: '🔴', label: 'มีผลกระทบต่อสุขภาพ' },
];
const pm25Level = (value) => PM25_LEVELS.find((level) => value <= level.max);

// 31.46 → "31.5" แต่ 31.0 → "31" (ไม่ต้องมี .0 ห้อยท้าย)
const round1 = (n) => String(Math.round(n * 10) / 10);
const formatTemp = (n) => `${round1(n)}°C`;

module.exports = {
    conditionEmoji,
    formatTime,
    formatFullDate,
    formatShortDay,
    localDayNumber,
    windDirection,
    pm25Level,
    round1,
    formatTemp,
};
