// Create a disposable local cluster; never reads the application's DATABASE_URL.
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const dir = mkdtempSync('/tmp/notstack-xp-test-');
const server = createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
const url = `postgresql://xp_test@127.0.0.1:${port}/notstack_xp_test`;
let started = false;
try {
    execFileSync('initdb', ['-D', `${dir}/data`, '-U', 'xp_test', '--auth=trust', '--no-locale', '--encoding=UTF8'], { stdio: 'pipe' });
    execFileSync('pg_ctl', ['-D', `${dir}/data`, '-l', `${dir}/postgres.log`, '-o', `-p ${port} -h 127.0.0.1 -k ${dir}`, '-w', 'start'], {
        stdio: 'pipe',
    });
    started = true;
    execFileSync('createdb', ['-h', '127.0.0.1', '-p', String(port), '-U', 'xp_test', 'notstack_xp_test']);
    execFileSync('pnpm', ['--filter', '@notstack/backend', 'db:migrate'], {
        cwd: root,
        env: { ...process.env, DATABASE_URL: url },
        stdio: 'inherit',
    });
    execFileSync(
        'pnpm',
        [
            '--filter',
            '@notstack/backend',
            'exec',
            'prisma',
            'migrate',
            'diff',
            '--from-config-datasource',
            '--to-schema',
            'prisma/schema.prisma',
            '--exit-code',
        ],
        {
            cwd: root,
            env: { ...process.env, DATABASE_URL: url },
            stdio: 'inherit',
        },
    );
    const result = spawnSync(process.execPath, ['--test', 'tests/xp-database.test.cjs'], {
        cwd: root,
        env: { ...process.env, XP_TEST_DATABASE_URL: url },
        stdio: 'inherit',
    });
    process.exitCode = result.status ?? 1;
} finally {
    if (started) execFileSync('pg_ctl', ['-D', `${dir}/data`, '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
    rmSync(dir, { recursive: true, force: true });
}
