import fs from 'node:fs';
import path from 'node:path';

// ==========================================
// 📁 PATHS — หาตำแหน่งโฟลเดอร์จากที่อยู่ของไฟล์ที่ compile แล้ว (dist/) ไม่ขึ้นกับว่ารันจากโฟลเดอร์ไหน
// ==========================================
function findUp(start: string, predicate: (dir: string) => boolean): string | null {
    let dir = start;
    for (;;) {
        if (predicate(dir)) return dir;
        const parent = path.dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

// apps/backend (โฟลเดอร์ที่มี package.json ของ backend)
export const BACKEND_ROOT = findUp(__dirname, (dir) => fs.existsSync(path.join(dir, 'package.json'))) ?? process.cwd();

// root ของ monorepo (มี pnpm-workspace.yaml) — .env / logs เดิมอยู่ที่นี่
export const REPO_ROOT =
    findUp(BACKEND_ROOT, (dir) => fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) ?? path.resolve(BACKEND_ROOT, '..', '..');

export const DEFAULT_LOG_DIR = path.join(REPO_ROOT, 'logs');

export const ENV_FILES = [path.join(BACKEND_ROOT, '.env'), path.join(REPO_ROOT, '.env')];

// เวอร์ชันที่แสดงในหน้าเว็บและคำสั่ง /botinfo
export const APP_VERSION: string = (() => {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(BACKEND_ROOT, 'package.json'), 'utf8')) as { version?: string };
        return pkg.version ?? '0.0.0';
    } catch {
        return '0.0.0';
    }
})();
