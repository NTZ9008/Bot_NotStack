require('dotenv').config();
const { db, getConfig } = require('../db');

const PR_CHANNEL_KEY = 'PR_CHANNEL_ID';

// เพิ่มแถว default ลงตาราง config ที่มีอยู่แล้ว (ถ้ายังไม่มี key นี้)
// เพื่อให้ไปโผล่ในหน้า Dashboard ช่อง Configuration เหมือนช่องอื่นๆ (LOG_CHANNEL_ID, ALERT_CHANNEL_ID ฯลฯ)
// โดยไม่ต้องแก้ db.js — ใช้ db handle ที่ export ไว้อยู่แล้ว
function seedChannelConfig(retriesLeft = 5) {
    db.run(
        `INSERT OR IGNORE INTO config (key, value, description) VALUES (?, ?, ?)`,
        [PR_CHANNEL_KEY, '', 'ห้องสำหรับแจ้งเตือน Pull Request (GitHub PR Bot)'],
        (err) => {
            if (err && retriesLeft > 0) {
                // ตาราง config อาจยังสร้างไม่เสร็จตอนที่ db.js เพิ่งเปิดไฟล์ → รอแล้วลองใหม่
                setTimeout(() => seedChannelConfig(retriesLeft - 1), 300);
            } else if (err) {
                console.error('[prbot] ไม่สามารถสร้างค่า default PR_CHANNEL_ID ได้:', err.message);
            }
        }
    );
}
seedChannelConfig();

module.exports = {
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
    // อ่านค่าสดทุกครั้ง เพราะแอดมินอาจแก้ผ่านหน้า Dashboard ได้ตลอดเวลา
    getChannelId: () => getConfig(PR_CHANNEL_KEY),
};
