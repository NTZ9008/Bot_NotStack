require('dotenv').config();
const { db, getConfig } = require('../db');

const PEGASUS_ORG = 'MUDST-2026-Pegasus';
const PEGASUS_TCG_WEB_REPO = `${PEGASUS_ORG}/pegasus-tcg-web`;

const CONFIG_DEFAULTS = [
    { key: 'PR_CHANNEL_ID', description: 'ห้องสำหรับแจ้งเตือน Pull Request (GitHub PR Bot) — ค่า default สำหรับ repo อื่นๆ' },
    { key: 'PR_CHANNEL_PEGASUS', description: `ห้องสำหรับแจ้งเตือน PR ของ org ${PEGASUS_ORG} โดยเฉพาะ (ถ้าเว้นว่างจะใช้ PR_CHANNEL_ID แทน)` },
    { key: 'PR_MENTION_PEGASUS_TCG_WEB', description: `ชื่อ Role ใน Discord (หรือใส่ mention tag ตรงๆ เช่น <@&ROLE_ID>) ที่จะ mention เมื่อมี PR เปิดจาก repo ${PEGASUS_TCG_WEB_REPO}` },
];

// เพิ่มแถว default ลงตาราง config ที่มีอยู่แล้ว (ถ้ายังไม่มี key นั้น)
// เพื่อให้ไปโผล่ในหน้า Dashboard ช่อง Configuration เหมือนช่องอื่นๆ (LOG_CHANNEL_ID, ALERT_CHANNEL_ID ฯลฯ)
// โดยไม่ต้องแก้ db.js — ใช้ db handle ที่ export ไว้อยู่แล้ว
function seedConfigDefault({ key, description }, retriesLeft = 5) {
    db.run(
        `INSERT OR IGNORE INTO config (key, value, description) VALUES (?, ?, ?)`,
        [key, '', description],
        (err) => {
            if (err && retriesLeft > 0) {
                // ตาราง config อาจยังสร้างไม่เสร็จตอนที่ db.js เพิ่งเปิดไฟล์ → รอแล้วลองใหม่
                setTimeout(() => seedConfigDefault({ key, description }, retriesLeft - 1), 300);
            } else if (err) {
                console.error(`[prbot] ไม่สามารถสร้างค่า default ${key} ได้:`, err.message);
            }
        }
    );
}
CONFIG_DEFAULTS.forEach((entry) => seedConfigDefault(entry));

module.exports = {
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
    PEGASUS_ORG,
    PEGASUS_TCG_WEB_REPO,
    // อ่านค่าสดทุกครั้ง เพราะแอดมินอาจแก้ผ่านหน้า Dashboard ได้ตลอดเวลา
    getDefaultChannelId: () => getConfig('PR_CHANNEL_ID'),
    getPegasusChannelId: () => getConfig('PR_CHANNEL_PEGASUS'),
    getPegasusTcgWebMention: () => getConfig('PR_MENTION_PEGASUS_TCG_WEB'),
};
