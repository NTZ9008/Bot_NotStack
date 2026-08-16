require('dotenv').config();
const { db, getConfig } = require('../db');

// org/repo ที่เคยใช้ตอน migrate จาก key เดี่ยวรุ่นก่อน (ไม่ได้ผูกกับ logic การ route อีกต่อไป)
const LEGACY_PEGASUS_ORG = 'MUDST-2026-Pegasus';
const LEGACY_PEGASUS_TCG_WEB_REPO = `${LEGACY_PEGASUS_ORG}/pegasus-tcg-web`;

const ORG_CHANNEL_MAP_KEY = 'PR_ORG_CHANNEL_MAP';
const ORG_CHANNEL_MAP_DESCRIPTION = `JSON กำหนด channel เฉพาะราย GitHub organization เช่น {"${LEGACY_PEGASUS_ORG}":"1234567890123456789"} — org ไหนไม่ได้ระบุในนี้จะใช้ PR_CHANNEL_ID (default) แทน`;
const LEGACY_ORG_CHANNEL_KEY = 'PR_CHANNEL_PEGASUS'; // key เก่าจากรุ่นก่อน (เฉพาะ org เดียว) — ถูกแทนที่ด้วย PR_ORG_CHANNEL_MAP

const REPO_MENTION_MAP_KEY = 'PR_REPO_MENTION_MAP';
const REPO_MENTION_MAP_DESCRIPTION = `JSON กำหนด mention (ชื่อ Role หรือ mention tag) เฉพาะราย GitHub repo (owner/repo) เช่น {"${LEGACY_PEGASUS_ORG}/pegasus-tcg-api":"frontman-pegasus"} — repo ไหนไม่ได้ระบุในนี้จะไม่ mention เลย`;
const LEGACY_REPO_MENTION_KEY = 'PR_MENTION_PEGASUS_TCG_WEB'; // key เก่าจากรุ่นก่อน (เฉพาะ repo เดียว) — ถูกแทนที่ด้วย PR_REPO_MENTION_MAP

const CONFIG_DEFAULTS = [
    { key: 'PR_CHANNEL_ID', description: 'ห้องสำหรับแจ้งเตือน Pull Request (GitHub PR Bot) — ค่า default สำหรับ org/repo ที่ไม่ได้กำหนดไว้ใน PR_ORG_CHANNEL_MAP' },
];

// เพิ่มแถว default ลงตาราง config ที่มีอยู่แล้ว (ถ้ายังไม่มี key นั้น)
// เพื่อให้ไปโผล่ในหน้า Dashboard ช่อง Configuration เหมือนช่องอื่นๆ (LOG_CHANNEL_ID, ALERT_CHANNEL_ID ฯลฯ)
// โดยไม่ต้องแก้ db.js — ใช้ db handle ที่ export ไว้อยู่แล้ว
function seedConfigDefault({ key, description, value = '' }, retriesLeft = 5) {
    db.run(
        `INSERT OR IGNORE INTO config (key, value, description) VALUES (?, ?, ?)`,
        [key, value, description],
        (err) => {
            if (err && retriesLeft > 0) {
                // ตาราง config อาจยังสร้างไม่เสร็จตอนที่ db.js เพิ่งเปิดไฟล์ → รอแล้วลองใหม่
                setTimeout(() => seedConfigDefault({ key, description, value }, retriesLeft - 1), 300);
            } else if (err) {
                console.error(`[prbot] ไม่สามารถสร้างค่า default ${key} ได้:`, err.message);
            }
        }
    );
}
CONFIG_DEFAULTS.forEach((entry) => seedConfigDefault(entry));

// migration ครั้งเดียว: ถ้ายังไม่เคยมี key ปลายทาง (mapKey) ให้สร้างขึ้น
// โดยถ้ามีค่าเก่าจาก legacyKey (รุ่นก่อนหน้า แบบเจาะจง org/repo เดียว) อยู่ ให้ย้ายมาเป็น entry แรกของ map แทนการทิ้งไป
// แล้วลบ legacyKey ทิ้ง เพราะถูกแทนที่ด้วย map ที่กำหนดได้หลายรายการแล้ว
function migrateSingleKeyToMap({ mapKey, mapDescription, legacyKey, legacyMapKeyName }, retriesLeft = 5) {
    db.get(`SELECT value FROM config WHERE key = ?`, [mapKey], (err, existingRow) => {
        if (err) {
            if (retriesLeft > 0) return setTimeout(() => migrateSingleKeyToMap({ mapKey, mapDescription, legacyKey, legacyMapKeyName }, retriesLeft - 1), 300);
            return console.error(`[prbot] ไม่สามารถตรวจสอบ ${mapKey} ได้:`, err.message);
        }
        if (existingRow) return; // มีอยู่แล้ว ไม่ต้องทำอะไรต่อ

        db.get(`SELECT value FROM config WHERE key = ?`, [legacyKey], (err2, legacyRow) => {
            const legacyValue = !err2 && legacyRow ? legacyRow.value : '';
            const initialMap = legacyValue ? { [legacyMapKeyName]: legacyValue } : {};

            seedConfigDefault({ key: mapKey, description: mapDescription, value: JSON.stringify(initialMap) });

            db.run(`DELETE FROM config WHERE key = ?`, [legacyKey], (err3) => {
                if (err3) console.error(`[prbot] ไม่สามารถลบ key เก่า ${legacyKey} ได้:`, err3.message);
            });
        });
    });
}
migrateSingleKeyToMap({
    mapKey: ORG_CHANNEL_MAP_KEY,
    mapDescription: ORG_CHANNEL_MAP_DESCRIPTION,
    legacyKey: LEGACY_ORG_CHANNEL_KEY,
    legacyMapKeyName: LEGACY_PEGASUS_ORG,
});
migrateSingleKeyToMap({
    mapKey: REPO_MENTION_MAP_KEY,
    mapDescription: REPO_MENTION_MAP_DESCRIPTION,
    legacyKey: LEGACY_REPO_MENTION_KEY,
    legacyMapKeyName: LEGACY_PEGASUS_TCG_WEB_REPO,
});

async function getJsonMap(key) {
    const raw = await getConfig(key);
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (err) {
        console.error(`[prbot] รูปแบบ JSON ใน ${key} ไม่ถูกต้อง:`, err.message);
        return {};
    }
}

function lookupCaseInsensitive(map, key) {
    const matchedKey = Object.keys(map).find((k) => k.toLowerCase() === key.toLowerCase());
    return matchedKey ? map[matchedKey] : null;
}

async function getChannelIdForOrg(orgLogin) {
    const map = await getJsonMap(ORG_CHANNEL_MAP_KEY);
    return lookupCaseInsensitive(map, orgLogin);
}

async function getMentionForRepo(repoFullName) {
    const map = await getJsonMap(REPO_MENTION_MAP_KEY);
    return lookupCaseInsensitive(map, repoFullName);
}

module.exports = {
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
    // อ่านค่าสดทุกครั้ง เพราะแอดมินอาจแก้ผ่านหน้า Dashboard ได้ตลอดเวลา
    getDefaultChannelId: () => getConfig('PR_CHANNEL_ID'),
    getChannelIdForOrg,
    getMentionForRepo,
};
