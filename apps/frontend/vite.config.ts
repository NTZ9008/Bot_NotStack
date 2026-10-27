import path from 'node:path';
import { gzipSync } from 'node:zlib';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig, loadEnv } from 'vite';

// ตอน dev หน้าเว็บรันที่ :5173 แล้วส่ง /api กับ /webhook ต่อไปที่ backend (:3035)
// → cookie / การตรวจ Origin (กัน CSRF) ทำงานเหมือน production ที่ Cloudflare Worker ส่ง /api ต่อให้ backend
const API_TARGET = process.env.API_URL || 'http://localhost:3035';

export default defineConfig(({ mode }) => {
    const api = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL;
    let apiOrigin: string | null = null;
    try {
        const url = new URL(api ?? '');
        if (['http:', 'https:'].includes(url.protocol)) apiOrigin = url.origin;
    } catch {
        /* Relative/same-origin API URLs need no preconnect. */
    }
    return {
        plugins: [
            tanstackRouter({ target: 'react', autoCodeSplitting: true }),
            react(),
            tailwindcss(),
            {
                name: 'dashboard-performance',
                transformIndexHtml() {
                    return apiOrigin ? [{ tag: 'link', attrs: { rel: 'preconnect', href: apiOrigin, crossorigin: 'use-credentials' }, injectTo: 'head' }] : [];
                },
                generateBundle(_, bundle) {
                    if (process.env.ANALYZE !== '1') return;
                    const report = Object.values(bundle)
                        .filter((chunk) => chunk.type === 'chunk')
                        .map((chunk) => ({
                            file: chunk.fileName,
                            entry: chunk.isEntry,
                            bytes: Buffer.byteLength(chunk.code),
                            gzip: gzipSync(chunk.code).length,
                            imports: chunk.imports,
                            dynamicImports: chunk.dynamicImports,
                            modules: Object.entries(chunk.modules)
                                .map(([id, info]) => ({ id: path.relative(process.cwd(), id), bytes: info.renderedLength }))
                                .sort((a, b) => b.bytes - a.bytes),
                        }));
                    this.emitFile({ type: 'asset', fileName: 'bundle-report.json', source: JSON.stringify(report, null, 2) });
                },
            },
        ],
        resolve: {
            alias: [
                { find: '@', replacement: path.resolve(import.meta.dirname, 'src') },
                // ลูกโลก (globe.gl) ใช้ WebGL — ไม่ต้องรวม three.js รุ่น WebGPU/TSL ที่ใช้แค่กับ heatmap (ดู three-webgpu-stub.ts)
                { find: /^three\/(webgpu|tsl)$/, replacement: path.resolve(import.meta.dirname, 'src/features/live/three-webgpu-stub.ts') },
            ],
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
    };
});
