const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const req = createRequire(require('node:path').resolve('apps/backend/package.json'));
req('reflect-metadata');
const express = req('express');
const { MetricsService } = require('../apps/backend/dist/monitoring/metrics.service');
const { validateEnv } = require('../apps/backend/dist/config/env.validation');
const token = 'test-monitoring-secret-with-at-least-32-characters';

function fixture(enabled = true, failDb = false) {
    let queries = 0;
    const config = { get: (key) => ({ METRICS_TOKEN: enabled ? token : undefined, TOKEN: 'configured' })[key] };
    const discord = { ready: { ws: { ping: 42 } }, client: { guilds: { cache: { size: 3 } } } };
    const prisma = {
        $transaction: async (fn) => {
            queries++;
            if (failDb) throw new Error('private database error');
            await new Promise((resolve) => setTimeout(resolve, 10));
            return fn({ $executeRaw: async () => 0, $queryRaw: async () => [{ value: 1 }] });
        },
    };
    const metrics = new MetricsService(config, discord, prisma);
    return { metrics, discord, queries: () => queries };
}

async function serve(metrics, run) {
    const app = express();
    app.use(metrics.middleware);
    app.use(express.json());
    app.get('/api/guilds/:guildId', (_req, res) => res.sendStatus(503));
    app.post('/api/body', (_req, res) => res.sendStatus(200));
    app.use((err, _req, res, next) => {
        if (res.headersSent) return next(err);
        res.sendStatus(err.status || 500);
    });
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    try {
        await run(`http://127.0.0.1:${server.address().port}`);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

test('metrics endpoint fails closed and requires its own bearer token before probing database', async () => {
    for (const enabled of [false, true]) {
        const f = fixture(enabled);
        await serve(f.metrics, async (base) => {
            for (const headers of [{}, { Authorization: 'Bearer incorrect' }]) {
                assert.equal((await fetch(`${base}/api/metrics`, { headers })).status, enabled ? 401 : 404);
            }
            assert.equal(f.queries(), 0);
            const response = await fetch(`${base}/API/METRICS/`, { headers: { Authorization: `Bearer ${token}` } });
            assert.equal(response.status, enabled ? 200 : 404);
            if (enabled) {
                assert.match(response.headers.get('content-type'), /text\/plain/);
                assert.equal(response.headers.get('cache-control'), 'no-store');
                const body = await response.text();
                assert.match(body, /notstack_database_up 1/);
                assert.match(body, /notstack_discord_gateway_ping_seconds 0.042/);
                assert.match(body, /notstack_process_cpu_seconds_total/);
                assert.equal((await fetch(`${base}/api/metrics`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })).status, 405);
            }
        });
    }
});

test('HTTP metrics count final error statuses, normalize routes and exclude scrapes', async () => {
    const { metrics } = fixture();
    await serve(metrics, async (base) => {
        for (const id of ['private-guild-one', 'private-guild-two']) await fetch(`${base}/api/guilds/${id}?secret=private-query`);
        await fetch(`${base}/api/missing-private-route`);
        await fetch(`${base}/api/body`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid' });
        const response = await fetch(`${base}/api/metrics`, { headers: { Authorization: `Bearer ${token}` } });
        const body = await response.text();
        assert.match(body, /notstack_http_requests_total\{method="GET",route="\/api\/guilds\/:guildId",status_code="503"\} 2/);
        assert.match(body, /route="unmatched",status_code="404"\} 1/);
        assert.match(body, /route="unmatched",status_code="400"\} 1/);
        assert.doesNotMatch(body, /private-guild|private-query|missing-private|\/api\/metrics/);
        assert.match(body, /notstack_http_request_duration_seconds_count\{method="GET",route="\/api\/guilds\/:guildId",status_code="503"\} 2/);
    });
});

test('database failure remains scrapeable and concurrent scrapes share one database probe', async () => {
    const f = fixture(true, true);
    f.discord.ready = null;
    const failed = await f.metrics.scrape();
    assert.match(failed, /notstack_database_up 0/);
    assert.match(failed, /notstack_discord_ready 0/);
    assert.match(failed, /notstack_discord_gateway_ping_seconds Nan/i);
    assert.doesNotMatch(failed, /private database error/);
    const healthy = fixture();
    await Promise.all([healthy.metrics.scrape(), healthy.metrics.scrape()]);
    assert.equal(healthy.queries(), 1);
});

test('metrics configuration accepts disabled state and rejects weak credentials', () => {
    const base = { NODE_ENV: 'test', DATABASE_URL: 'postgresql://unused/test' };
    assert.equal(validateEnv(base).METRICS_TOKEN, undefined);
    assert.equal(validateEnv({ ...base, METRICS_TOKEN: '  ' }).METRICS_TOKEN, undefined);
    assert.throws(() => validateEnv({ ...base, METRICS_TOKEN: 'short' }), /METRICS_TOKEN/);
    assert.equal(validateEnv({ ...base, METRICS_TOKEN: token }).METRICS_TOKEN, token);
});
