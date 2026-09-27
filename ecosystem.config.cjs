// ==========================================
// PM2 — รันบอท Discord + API ในโปรเซสเดียว (apps/backend/dist/main.js) — หน้า Dashboard อยู่ที่ Cloudflare Workers
//   pm2 start ecosystem.config.cjs && pm2 save
// อ่าน .env จาก root ของ repo เหมือนเดิม (ไม่ต้องย้ายไฟล์บนเซิร์ฟเวอร์)
// ==========================================
module.exports = {
    apps: [
        {
            name: 'BotNotStack',
            cwd: './apps/backend',
            script: 'dist/main.js',
            // Nest ปิดตัวอย่างนุ่มนวล (เขียน Activity Log ที่ค้างอยู่ + ตัดการเชื่อมต่อ Discord/DB) ก่อนโดนฆ่า
            kill_timeout: 10000,
            max_memory_restart: '700M',
            time: true,
        },
    ],
};
