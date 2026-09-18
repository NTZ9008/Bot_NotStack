// ตั้งค่า Prisma CLI (prisma generate / prisma migrate ...)
require('dotenv').config({ quiet: true });
const { defineConfig } = require('prisma/config');

module.exports = defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
        path: 'prisma/migrations',
    },
    datasource: {
        // ใช้ process.env ตรงๆ (ไม่ใช้ env() ของ prisma) เพื่อให้ prisma generate ตอน npm install ทำงานได้แม้ยังไม่มี DATABASE_URL
        url: process.env.DATABASE_URL,
    },
});
