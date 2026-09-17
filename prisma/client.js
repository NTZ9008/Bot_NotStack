// ==========================================
// 🐘 PRISMA CLIENT (PostgreSQL)
// client ตัวเดียวใช้ทั้งโปรเจกต์ — ไฟล์นี้ไม่มี side effect (ไม่ seed ข้อมูล)
// จึงใช้ได้ทั้งจากบอท (ผ่าน db.js) และสคริปต์ย้ายข้อมูลจาก SQLite
// ==========================================
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

if (!process.env.DATABASE_URL) {
    throw new Error('ยังไม่ได้ตั้งค่า DATABASE_URL ในไฟล์ .env (เช่น postgresql://user:password@host:5432/dbname)');
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

module.exports = { prisma };
