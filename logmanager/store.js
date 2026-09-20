// ==========================================
// 💾 LOG SETTINGS STORE
// เก็บการตั้งค่า log แต่ละชนิดลงตาราง log_settings (PostgreSQL ผ่าน Prisma client ตัวเดียวกับระบบเดิม)
// มี cache ใน memory เพราะ event ของ Discord ยิงถี่มาก ไม่ควร query DB ทุกครั้ง
// ==========================================
const { prisma } = require('../db');
const activity = require('./activity');
const { LOG_EVENTS, LOG_EVENT_MAP } = require('./events');

// แถวพิเศษสำหรับสวิตช์เปิด/ปิดทั้งระบบ (ไม่ใช่ event จริง จึงถูกกรองออกตอนส่งให้ Dashboard)
const SYSTEM_KEY = '__system__';

// cache: eventKey -> { enabled, channelId, color }
const cache = new Map();

// ตัวกรองส่วนกลาง (ยกเว้นไม่ต้อง log) — เก็บเป็น Set เพื่อเช็คเร็วตอน event ยิงถี่
const options = {
    ignoredChannels: new Set(),
    ignoredUsers: new Set(),
    ignoredRoles: new Set(),
    ignoreBots: true,
    // บันทึกทุกเหตุการณ์ลงฐานข้อมูลไหม (ใช้ทำกราฟหน้า Overview + ตาราง Activity Log)
    activityRecording: true,
};

const OPTION_KEYS = {
    IGNORED_CHANNELS: 'ignoredChannels',
    IGNORED_USERS: 'ignoredUsers',
    IGNORED_ROLES: 'ignoredRoles',
};
let ready = false;
let readyPromise = null;

// เติมค่า default ของ event ที่ยังไม่มีในตาราง (รองรับกรณีเพิ่ม event ใหม่ในอนาคต)
// ตารางถูกสร้างโดย prisma migrate แล้ว — skipDuplicates ทำให้ไม่ทับค่าที่แอดมินตั้งไว้
async function initLogSettings() {
    if (readyPromise) return readyPromise;

    readyPromise = (async () => {
        // ตัวกรองส่วนกลาง: ห้อง/คน/ยศ ที่ไม่ต้อง log + จะ log การกระทำของบอทไหม
        await prisma.logOption.createMany({
            data: [
                { key: 'IGNORED_CHANNELS', value: '[]' },
                { key: 'IGNORED_USERS', value: '[]' },
                { key: 'IGNORED_ROLES', value: '[]' },
                { key: 'IGNORE_BOTS', value: '1' },
                { key: 'ACTIVITY_RECORDING', value: '1' },
            ],
            skipDuplicates: true,
        });

        // ระบบเปิดไว้ตั้งแต่แรก แต่ทุก event ปิดอยู่ → แอดมินค่อยเลือกเปิดทีละอันจากหน้า Dashboard
        await prisma.logSetting.createMany({
            data: [
                { eventKey: SYSTEM_KEY, enabled: true, channelId: '', color: '' },
                ...LOG_EVENTS.map(event => ({ eventKey: event.key, enabled: false, channelId: '', color: event.color })),
            ],
            skipDuplicates: true,
        });

        await reloadCache();
        ready = true;
        console.log(`📋 Log Manager: โหลดการตั้งค่า ${LOG_EVENTS.length} รายการเรียบร้อย`);
    })();

    return readyPromise;
}

async function reloadCache() {
    await reloadOptions();
    const rows = await prisma.logSetting.findMany();
    cache.clear();
    for (const row of rows) {
        cache.set(row.eventKey, {
            enabled: row.enabled,
            channelId: row.channelId || '',
            color: row.color || LOG_EVENT_MAP.get(row.eventKey)?.color || '#5865F2',
        });
    }
}

function isSystemEnabled() {
    return cache.get(SYSTEM_KEY)?.enabled !== false;
}

// อ่านจาก cache (sync) — ใช้ตอน dispatch log เพื่อไม่ให้ช้า
function getSetting(eventKey) {
    return cache.get(eventKey) || null;
}

// รวมข้อมูล catalog + ค่าที่ตั้งไว้ ส่งให้ Dashboard
function listSettings() {
    return LOG_EVENTS.map(event => {
        const saved = cache.get(event.key);
        return {
            key: event.key,
            label: event.label,
            group: event.group,
            enabled: saved ? saved.enabled : false,
            channelId: saved ? saved.channelId : '',
            color: saved?.color || event.color,
        };
    });
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const SNOWFLAKE = /^\d{5,25}$/;

// อัปเดตเฉพาะฟิลด์ที่ส่งมา (partial update) — Dashboard บันทึกอัตโนมัติทีละช่อง
async function updateSetting(eventKey, { enabled, channelId, color }) {
    if (!LOG_EVENT_MAP.has(eventKey)) {
        throw new Error(`ไม่รู้จัก log event: ${eventKey}`);
    }

    const data = {};

    if (typeof enabled === 'boolean') {
        data.enabled = enabled;
    }
    if (typeof channelId === 'string') {
        const trimmed = channelId.trim();
        if (trimmed && !SNOWFLAKE.test(trimmed)) throw new Error('รูปแบบ Channel ID ไม่ถูกต้อง');
        data.channelId = trimmed;
    }
    if (typeof color === 'string') {
        const trimmed = color.trim();
        if (!HEX_COLOR.test(trimmed)) throw new Error('รูปแบบสีไม่ถูกต้อง (ต้องเป็น #RRGGBB)');
        data.color = trimmed;
    }

    if (Object.keys(data).length === 0) throw new Error('ไม่มีข้อมูลที่ต้องอัปเดต');

    await prisma.logSetting.updateMany({ where: { eventKey }, data });
    await reloadCache();
    return getSetting(eventKey);
}

async function setSystemEnabled(enabled) {
    await prisma.logSetting.updateMany({ where: { eventKey: SYSTEM_KEY }, data: { enabled: Boolean(enabled) } });
    await reloadCache();
    return isSystemEnabled();
}

// ตั้งห้องเดียวกันให้ทุก event รวดเดียว (ปุ่ม "ใช้ห้องนี้กับทุกรายการ" ในหน้า Dashboard)
async function setChannelForAll(channelId) {
    const trimmed = (channelId || '').trim();
    if (trimmed && !SNOWFLAKE.test(trimmed)) throw new Error('รูปแบบ Channel ID ไม่ถูกต้อง');
    await prisma.logSetting.updateMany({ where: { eventKey: { not: SYSTEM_KEY } }, data: { channelId: trimmed } });
    await reloadCache();
}

async function reloadOptions() {
    const rows = await prisma.logOption.findMany();
    for (const row of rows) {
        if (row.key === 'IGNORE_BOTS') {
            options.ignoreBots = row.value === '1';
            continue;
        }
        if (row.key === 'ACTIVITY_RECORDING') {
            options.activityRecording = row.value !== '0';
            continue;
        }
        const field = OPTION_KEYS[row.key];
        if (!field) continue;
        try {
            const parsed = JSON.parse(row.value || '[]');
            options[field] = new Set(Array.isArray(parsed) ? parsed : []);
        } catch (err) {
            options[field] = new Set();
        }
    }
    activity.setEnabled(options.activityRecording);
}

// อ่านจาก cache (sync) — ใช้ตอนกรอง event
function getOptions() {
    return options;
}

// ส่งให้ Dashboard ในรูปแบบ array
function listOptions() {
    return {
        ignoredChannels: [...options.ignoredChannels],
        ignoredUsers: [...options.ignoredUsers],
        ignoredRoles: [...options.ignoredRoles],
        ignoreBots: options.ignoreBots,
        activityRecording: options.activityRecording,
    };
}

async function updateOptions({ ignoredChannels, ignoredUsers, ignoredRoles, ignoreBots, activityRecording }) {
    const saveList = async (dbKey, list) => {
        if (!Array.isArray(list)) return;
        const cleaned = [...new Set(list.map(id => String(id).trim()).filter(Boolean))];
        const invalid = cleaned.find(id => !SNOWFLAKE.test(id));
        if (invalid) throw new Error(`ไอดีไม่ถูกต้อง: ${invalid}`);
        await prisma.logOption.updateMany({ where: { key: dbKey }, data: { value: JSON.stringify(cleaned) } });
    };

    await saveList('IGNORED_CHANNELS', ignoredChannels);
    await saveList('IGNORED_USERS', ignoredUsers);
    await saveList('IGNORED_ROLES', ignoredRoles);
    if (typeof ignoreBots === 'boolean') {
        await prisma.logOption.updateMany({ where: { key: 'IGNORE_BOTS' }, data: { value: ignoreBots ? '1' : '0' } });
    }
    if (typeof activityRecording === 'boolean') {
        await prisma.logOption.updateMany({ where: { key: 'ACTIVITY_RECORDING' }, data: { value: activityRecording ? '1' : '0' } });
    }

    await reloadOptions();
    return listOptions();
}

module.exports = {
    initLogSettings,
    getOptions,
    listOptions,
    updateOptions,
    isReady: () => ready,
    isSystemEnabled,
    isActivityRecording: () => options.activityRecording,
    getSetting,
    listSettings,
    updateSetting,
    setSystemEnabled,
    setChannelForAll,
    SYSTEM_KEY,
};
