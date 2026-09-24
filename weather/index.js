// ==========================================
// 🌤️ DAILY WEATHER REPORT — ส่งรายงานสภาพอากาศประจำวันตามเวลาที่ตั้งไว้ (เวลาไทย)
// แทนระบบเดิมใน index.js (ส่งอากาศศาลายาเข้าห้อง GENERAL_CHANNEL_ID ตอน 07:00 ทุกวัน)
// ตั้งค่าทุกอย่างได้จาก Dashboard แท็บ Weather (API อยู่ใน weather/routes.js)
// ==========================================
const schedule = require('node-schedule');
const { PermissionFlagsBits } = require('discord.js');
const store = require('./store');
const { fetchWeather } = require('./api');
const { buildWeatherReport, toMessagePayload } = require('./report');
const { SCHEDULE_TIMEZONE } = require('./options');

// ส่งไม่สำเร็จ (API ล่ม / เน็ตหลุด) → ลองใหม่อีก 2 ครั้ง หลัง 1 และ 5 นาที
const RETRY_DELAYS_MS = [60 * 1000, 5 * 60 * 1000];

const PERMISSION_LABELS = {
    ViewChannel: 'ดูห้อง',
    SendMessages: 'ส่งข้อความ',
    EmbedLinks: 'ฝังลิงก์ (Embed Links)',
    AttachFiles: 'แนบไฟล์',
};

let botClient = null;
let job = null;

// error ที่ลองใหม่ก็ไม่หาย (ห้องผิด / ไม่มีสิทธิ์) — ข้อความส่งกลับไปให้หน้าเว็บได้
class ReportError extends Error {
    constructor(message) {
        super(message);
        this.status = 400;
        this.expose = true;
        this.retryable = false;
    }
}

async function resolveReportChannel(client, channelId, withChart) {
    if (!client?.isReady()) {
        const err = new ReportError('บอทยังไม่ออนไลน์');
        err.status = 503;
        err.retryable = true;
        throw err;
    }
    if (!channelId) throw new ReportError('ยังไม่ได้เลือกห้องที่จะส่ง');

    const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
    if (!channel) throw new ReportError(`ไม่พบห้อง ${channelId} (อาจถูกลบ หรือบอทมองไม่เห็นห้องนี้)`);
    if (!channel.guild || !channel.isTextBased() || channel.isVoiceBased()) {
        throw new ReportError(`ห้อง #${channel.name} ไม่ใช่ห้องข้อความของเซิร์ฟเวอร์`);
    }

    const me = channel.guild.members.me || await channel.guild.members.fetchMe().catch(() => null);
    const required = ['ViewChannel', 'SendMessages', 'EmbedLinks', ...(withChart ? ['AttachFiles'] : [])];
    const permissions = me ? channel.permissionsFor(me) : null;
    const missing = permissions ? required.filter((name) => !permissions.has(PermissionFlagsBits[name])) : required;
    if (missing.length) {
        throw new ReportError(`บอทไม่มีสิทธิ์ ${missing.map((name) => PERMISSION_LABELS[name]).join(' / ')} ในห้อง #${channel.name}`);
    }
    return channel;
}

/**
 * ส่งรายงาน 1 ครั้ง — ใช้ทั้งตอนถึงเวลาและปุ่ม "ส่งทดสอบ"
 * @param {import('discord.js').Client} client
 * @param {{channelId: string, content: string, options: object}} settings options ผ่าน normalize แล้ว
 * @param {{fresh?: boolean}} [opts] fresh = ดึงข้อมูลอากาศใหม่ ไม่ใช้ cache
 */
async function sendWeatherReport(client, settings, { fresh = true } = {}) {
    const channel = await resolveReportChannel(client, settings.channelId, settings.options.chart.enabled);
    const weather = await fetchWeather(settings.options.location, { fresh });
    const report = await buildWeatherReport(settings, weather);
    await channel.send(toMessagePayload(report));
    return channel;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runScheduledReport() {
    for (let attempt = 0; ; attempt++) {
        // อ่านค่าใหม่ทุกรอบ — ระหว่างรอลองใหม่ แอดมินอาจปิดรายงานหรือเปลี่ยนห้องไปแล้ว
        const settings = await store.getSettings();
        if (!settings.enabled) return;
        try {
            const channel = await sendWeatherReport(botClient, settings);
            await store.recordRun(null);
            console.log(`[Weather] ส่งรายงานสภาพอากาศเข้า #${channel.name} แล้ว`);
            return;
        } catch (err) {
            const retry = err.retryable !== false && attempt < RETRY_DELAYS_MS.length;
            console.error(`[Weather] ส่งรายงานไม่สำเร็จ (ครั้งที่ ${attempt + 1})${retry ? ' — จะลองใหม่' : ''}:`, err.message);
            if (!retry) {
                await store.recordRun(err.message || String(err));
                return;
            }
            await sleep(RETRY_DELAYS_MS[attempt]);
        }
    }
}

// ตั้งเวลาใหม่ทุกครั้งที่บันทึกการตั้งค่า (ยกเลิกของเดิมก่อนเสมอ จะได้ไม่ส่งซ้ำ)
function scheduleReport(settings) {
    job?.cancel();
    job = null;
    const { time, days } = settings.options.schedule;
    if (!settings.enabled || !settings.channelId || !days.length) return;

    const [hour, minute] = time.split(':').map(Number);
    const rule = new schedule.RecurrenceRule();
    rule.tz = SCHEDULE_TIMEZONE;
    rule.dayOfWeek = days;
    rule.hour = hour;
    rule.minute = minute;
    rule.second = 0;
    job = schedule.scheduleJob(rule, () => {
        runScheduledReport().catch((err) => console.error('[Weather] ระบบรายงานสภาพอากาศผิดพลาด:', err));
    });
}

// เวลาที่จะส่งครั้งถัดไป (null = ปิดอยู่ / ยังไม่ได้ตั้งเวลา)
const nextRunAt = () => job?.nextInvocation()?.toDate() ?? null;

async function initWeather(client) {
    botClient = client;
    scheduleReport(await store.getSettings());
}

module.exports = { initWeather, scheduleReport, sendWeatherReport, resolveReportChannel, nextRunAt };
