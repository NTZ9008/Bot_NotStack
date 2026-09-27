// ตั้งค่า Prisma CLI (prisma generate / prisma migrate ...)
// อ่าน DATABASE_URL จาก apps/backend/.env ก่อน แล้วค่อยใช้ .env ที่ root ของ repo (ไฟล์เดิมบนเซิร์ฟเวอร์)
import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';

// Prisma CLI ถูกเรียกจากโฟลเดอร์ apps/backend เสมอ (pnpm --filter / postinstall)
const appDir = process.cwd();
dotenv.config({ path: [path.join(appDir, '.env'), path.join(appDir, '..', '..', '.env')], quiet: true });

export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
        path: 'prisma/migrations',
    },
    datasource: {
        // ใช้ process.env ตรงๆ (ไม่ใช้ env() ของ prisma) เพื่อให้ prisma generate ตอนติดตั้งทำงานได้แม้ยังไม่มี DATABASE_URL
        url: process.env.DATABASE_URL,
    },
});
