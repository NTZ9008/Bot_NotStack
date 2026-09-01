// ==========================================
// 💾 LOG SETTINGS STORE
// เก็บการตั้งค่า log แต่ละชนิดลงตาราง log_settings (ใช้ db handle ตัวเดียวกับระบบเดิม)
// มี cache ใน memory เพราะ event ของ Discord ยิงถี่มาก ไม่ควร query DB ทุกครั้ง
// ==========================================
const { db } = require('../db');
const { LOG_EVENTS, LOG_EVENT_MAP } = require('./events');

// แถวพิเศษสำหรับสวิตช์เปิด/ปิดทั้งระบบ (ไม่ใช่ event จริง จึงถูกกรองออกตอนส่งให้ Dashboard)
const SYSTEM_KEY = '__system__';

// cache: eventKey -> { enabled, channelId, color }
const cache = new Map();
let ready = false;
let readyPromise = null;

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

// สร้างตาราง + เติมค่า default ของ event ที่ยังไม่มีในตาราง (รองรับกรณีเพิ่ม event ใหม่ในอนาคต)
async function initLogSettings() {
    if (readyPromise) return readyPromise;

    readyPromise = (async () => {
        await run(`CREATE TABLE IF NOT EXISTS log_settings (
            event_key TEXT PRIMARY KEY,
            enabled INTEGER DEFAULT 0,
            channel_id TEXT DEFAULT '',
            color TEXT DEFAULT ''
        )`);

        // ระบบเปิดไว้ตั้งแต่แรก แต่ทุก event ปิดอยู่ → แอดมินค่อยเลือกเปิดทีละอันจากหน้า Dashboard
        await run(`INSERT OR IGNORE INTO log_settings (event_key, enabled, channel_id, color) VALUES (?, 1, '', '')`, [SYSTEM_KEY]);

        for (const event of LOG_EVENTS) {
            await run(
                `INSERT OR IGNORE INTO log_settings (event_key, enabled, channel_id, color) VALUES (?, 0, '', ?)`,
                [event.key, event.color]
            );
        }

        await reloadCache();
        ready = true;
        console.log(`📋 Log Manager: โหลดการตั้งค่า ${LOG_EVENTS.length} รายการเรียบร้อย`);
    })();

    return readyPromise;
}

async function reloadCache() {
    const rows = await all(`SELECT event_key, enabled, channel_id, color FROM log_settings`);
    cache.clear();
    for (const row of rows) {
        cache.set(row.event_key, {
            enabled: row.enabled === 1,
            channelId: row.channel_id || '',
            color: row.color || LOG_EVENT_MAP.get(row.event_key)?.color || '#5865F2',
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

    const fields = [];
    const params = [];

    if (typeof enabled === 'boolean') {
        fields.push('enabled = ?');
        params.push(enabled ? 1 : 0);
    }
    if (typeof channelId === 'string') {
        const trimmed = channelId.trim();
        if (trimmed && !SNOWFLAKE.test(trimmed)) throw new Error('รูปแบบ Channel ID ไม่ถูกต้อง');
        fields.push('channel_id = ?');
        params.push(trimmed);
    }
    if (typeof color === 'string') {
        const trimmed = color.trim();
        if (!HEX_COLOR.test(trimmed)) throw new Error('รูปแบบสีไม่ถูกต้อง (ต้องเป็น #RRGGBB)');
        fields.push('color = ?');
        params.push(trimmed);
    }

    if (fields.length === 0) throw new Error('ไม่มีข้อมูลที่ต้องอัปเดต');

    params.push(eventKey);
    await run(`UPDATE log_settings SET ${fields.join(', ')} WHERE event_key = ?`, params);
    await reloadCache();
    return getSetting(eventKey);
}

async function setSystemEnabled(enabled) {
    await run(`UPDATE log_settings SET enabled = ? WHERE event_key = ?`, [enabled ? 1 : 0, SYSTEM_KEY]);
    await reloadCache();
    return isSystemEnabled();
}

// ตั้งห้องเดียวกันให้ทุก event รวดเดียว (ปุ่ม "ใช้ห้องนี้กับทุกรายการ" ในหน้า Dashboard)
async function setChannelForAll(channelId) {
    const trimmed = (channelId || '').trim();
    if (trimmed && !SNOWFLAKE.test(trimmed)) throw new Error('รูปแบบ Channel ID ไม่ถูกต้อง');
    await run(`UPDATE log_settings SET channel_id = ? WHERE event_key != ?`, [trimmed, SYSTEM_KEY]);
    await reloadCache();
}

module.exports = {
    initLogSettings,
    isReady: () => ready,
    isSystemEnabled,
    getSetting,
    listSettings,
    updateSetting,
    setSystemEnabled,
    setChannelForAll,
    SYSTEM_KEY,
};
