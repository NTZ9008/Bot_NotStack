import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(appDir, 'src', 'generated', 'prisma');
const clientEntry = path.join(outputDir, 'client.ts');

// Prisma refuses to overwrite an interrupted/partial generation directory.
// The output is disposable and gitignored, so remove it only when its entry file is missing.
if (existsSync(outputDir) && !existsSync(clientEntry)) rmSync(outputDir, { recursive: true, force: true });

const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const result = spawnSync(command, ['exec', 'prisma', 'generate'], {
    cwd: appDir,
    env: process.env,
    stdio: 'inherit',
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
