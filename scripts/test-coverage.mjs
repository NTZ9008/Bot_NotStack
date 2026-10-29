// รัน unit test ชุดเดียวกับ `pnpm test:unit` แล้วเขียน coverage เป็น lcov ที่ coverage/lcov.info (ใช้ส่งขึ้น Codecov)
// อ่านรายชื่อไฟล์เทสต์จาก script test:unit ใน package.json จะได้ไม่ต้องดูแลรายการซ้ำสองที่
import { mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const files = scripts['test:unit'].split(/\s+/).filter((arg) => arg.endsWith('.cjs'));
mkdirSync(new URL('../coverage/', import.meta.url), { recursive: true });

const result = spawnSync(
    process.execPath,
    [
        // map coverage ของ dist กลับไปที่ไฟล์ .ts ใน src
        '--enable-source-maps',
        '--test',
        '--experimental-test-coverage',
        '--test-coverage-exclude=tests/**',
        '--test-coverage-exclude=**/node_modules/**',
        '--test-reporter=spec',
        '--test-reporter-destination=stdout',
        '--test-reporter=lcov',
        '--test-reporter-destination=coverage/lcov.info',
        ...files,
    ],
    { cwd: root, stdio: 'inherit' },
);
process.exit(result.status ?? 1);
