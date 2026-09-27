import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

// ตอน dev หน้าเว็บรันที่ :5173 แล้วส่ง /api กับ /webhook ต่อไปที่ backend (:3035)
// → cookie / การตรวจ Origin (กัน CSRF) ทำงานเหมือน production ที่ Cloudflare Worker ส่ง /api ต่อให้ backend
const API_TARGET = process.env.API_URL || 'http://localhost:3035';

export default defineConfig({
    plugins: [
        tanstackRouter({ target: 'react', autoCodeSplitting: true }),
        react(),
        tailwindcss(),
    ],
    resolve: {
        alias: { '@': path.resolve(import.meta.dirname, 'src') },
        // ใช้ source (TypeScript) ของ @notstack/shared ตรงๆ — แก้แล้วเห็นผลทันทีไม่ต้อง build
        conditions: ['source', ...defaultClientConditions],
    },
    server: {
        port: 5173,
        proxy: {
            '/api': { target: API_TARGET },
            '/webhook': { target: API_TARGET },
        },
    },
});
