// ==========================================
// 💾 WEATHER STORE — การตั้งค่ารายงานสภาพอากาศ (weather_settings มีแถวเดียว id = 1)
// ==========================================
const { prisma } = require('../prisma/client');
const { defaultOptions, normalizeOptions } = require('./options');

const ID = 1;
const DEFAULT_CONTENT = '☀️ พยากรณ์อากาศวันนี้';

// options ในฐานข้อมูลอาจมาจากโค้ดเวอร์ชันเก่า — ผ่าน normalize ทุกครั้งที่อ่าน
const toSettings = (row) => ({
    enabled: row.enabled,
    channelId: row.channelId,
    content: row.content,
    options: normalizeOptions(row.options),
    lastRunAt: row.lastRunAt,
    lastError: row.lastError,
    updatedAt: row.updatedAt,
});

// ครั้งแรกหลังอัปเดต: ยกค่าจากระบบเดิมมา (ห้อง GENERAL_CHANNEL_ID, ศาลายา, 07:00 ทุกวัน) และเปิดไว้เหมือนเดิม
// skipDuplicates = ถ้ามีแถวอยู่แล้ว (เช่นสองคำขอเข้ามาพร้อมกัน) ไม่ทับค่าที่มีอยู่
async function createDefault() {
    const general = await prisma.config.findUnique({ where: { key: 'GENERAL_CHANNEL_ID' }, select: { value: true } });
    const channelId = general?.value || '';
    await prisma.weatherSetting.createMany({
        data: [{ id: ID, enabled: Boolean(channelId), channelId, content: DEFAULT_CONTENT, options: defaultOptions() }],
        skipDuplicates: true,
    });
    return prisma.weatherSetting.findUnique({ where: { id: ID } });
}

async function getSettings() {
    const row = (await prisma.weatherSetting.findUnique({ where: { id: ID } })) || (await createDefault());
    return toSettings(row);
}

async function updateSettings(data) {
    await getSettings(); // สร้างแถวเริ่มต้นก่อน ถ้ายังไม่มี
    return toSettings(await prisma.weatherSetting.update({ where: { id: ID }, data }));
}

// ผลการส่งตามเวลาครั้งล่าสุด (error = null คือส่งสำเร็จ) — แสดงในหน้า Dashboard
async function recordRun(error) {
    await prisma.weatherSetting.update({
        where: { id: ID },
        data: { lastRunAt: new Date(), lastError: error ? String(error).slice(0, 500) : null },
    });
}

module.exports = { getSettings, updateSettings, recordRun };
