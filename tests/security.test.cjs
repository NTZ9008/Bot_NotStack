const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const req = createRequire(require('node:path').resolve('apps/backend/package.json'));
req('reflect-metadata');
const { NestFactory, Reflector } = req('@nestjs/core');
const { Controller, Post, Module } = req('@nestjs/common');
const { CsrfGuard, SignedWebhook } = require('../apps/backend/dist/auth/guards/csrf.guard');
const { AuditRecorderMiddleware } = require('../apps/backend/dist/audit/middleware/audit-recorder.middleware');
const { UsersService } = require('../apps/backend/dist/users/users.service');
const { AuthService } = require('../apps/backend/dist/auth/auth.service');
const { TokensService } = require('../apps/backend/dist/auth/tokens.service');
const { BotConfigService } = require('../apps/backend/dist/bot-config/bot-config.service');
const { PrBotService } = require('../apps/backend/dist/pr-bot/pr-bot.service');
const { GithubWebhookController } = require('../apps/backend/dist/pr-bot/controllers/github-webhook.controller');
const { allowedOrigins } = require('../apps/backend/dist/config/allowed-origins');
const { validateEnv } = require('../apps/backend/dist/config/env.validation');
const { safeImage, readBoundedResponse } = require('../apps/backend/dist/common/utils/safe-image');
const { GeminiService } = require('../apps/backend/dist/chat/gemini.service');
const { JwtService } = req('@nestjs/jwt');
const quiet = (target) => {
    target.logger = { log() {}, warn() {}, error() {} };
    return target;
};

test('HTTP CSRF rejects mixed-case routes, untrusted/missing/http origins; audit records mixed-case mutations', async () => {
    class Probe {
        mutate() {
            return { success: true };
        }
        webhook() {
            return { verifiedSeparately: true };
        }
    }
    Controller('guilds')(Probe);
    Post('delete')(Probe.prototype, 'mutate', Object.getOwnPropertyDescriptor(Probe.prototype, 'mutate'));
    Post('webhook')(Probe.prototype, 'webhook', Object.getOwnPropertyDescriptor(Probe.prototype, 'webhook'));
    SignedWebhook()(Probe.prototype, 'webhook', Object.getOwnPropertyDescriptor(Probe.prototype, 'webhook'));
    class Fixture {}
    Module({ controllers: [Probe] })(Fixture);
    const app = await NestFactory.create(Fixture, { logger: false });
    app.setGlobalPrefix('api');
    const logs = [];
    const audit = new AuditRecorderMiddleware({ audit: async (_req, event) => logs.push(event) });
    app.use((request, response, next) => {
        request.user = { id: 1 };
        audit.use(request, response, next);
    });
    const origins = allowedOrigins(['https://dashboard.example.com']);
    app.useGlobalGuards(quiet(new CsrfGuard(origins, new Reflector())));
    await app.listen(0, '127.0.0.1');
    try {
        const base = await app.getUrl();
        for (const prefix of ['/api', '/API', '/Api']) {
            for (const origin of [null, 'null', 'https://evil.example.com', 'http://dashboard.example.com']) {
                const res = await fetch(`${base}${prefix}/guilds/delete`, { method: 'POST', headers: origin ? { Origin: origin } : {} });
                assert.equal(res.status, 403, `${prefix}: ${origin}`);
            }
        }
        const result = await fetch(`${base}/API/guilds/delete`, { method: 'POST', headers: { Origin: 'https://dashboard.example.com' } });
        assert.equal(result.status, 201);
        assert(logs.some((x) => x.success && x.action.includes('/api/guilds/delete')));
        assert.equal((await fetch(`${base}/API/guilds/webhook`, { method: 'POST' })).status, 201);
    } finally {
        await app.close();
    }
});

test('password failures all perform password comparison; locked and absent accounts have the same HTTP response', async () => {
    const fixture = { id: 1, username: 'test', passwordHash: 'fixture', isActive: true, failedLogins: 0, tokenVersion: 0 };
    for (const user of [null, { ...fixture, lockedUntil: new Date(Date.now() + 60000) }, fixture]) {
        let compared = 0;
        const users = new UsersService({ user: { findUnique: async () => user, update: async () => ({ ...fixture, failedLogins: 1 }) } }, {});
        users.comparePassword = async () => {
            compared++;
            return false;
        };
        const auth = new AuthService({}, {}, users, {}, { audit: async () => {} });
        await assert.rejects(
            auth.validatePasswordLogin({ get() {} }, 'test', 'wrong'),
            (e) => e.getStatus() === 401 && e.message === 'รหัสผ่านหรือชื่อผู้ใช้ไม่ถูกต้อง',
        );
        assert.equal(compared, 1);
    }
});

test('OAuth linking rejects logout, account switches, other sessions and revoked versions before writing', async () => {
    let links = 0;
    const service = new AuthService(
        {},
        { validateSession: async () => false },
        {
            findById: async () => ({ id: 1, isActive: true }),
            findByDiscordId: async () => null,
            linkDiscord: async () => links++,
        },
        {},
        { audit: async () => {} },
    );
    const result = { flow: { mode: 'link', userId: 1, sessionId: 'original', tokenVersion: 0 }, profile: { id: '12345' } };
    for (const request of [
        {},
        { user: { id: 2 }, authSessionId: 'original' },
        { user: { id: 1, tokenVersion: 0 }, authSessionId: 'other' },
        { user: { id: 1, tokenVersion: 0 }, authSessionId: 'original' },
    ]) {
        assert.equal(await service.completeDiscordFlow(request, {}, result), '/account?discord_error=discord_state');
    }
    assert.equal(links, 0);
});

test('cookies retain HttpOnly/Secure/SameSite and logout clears pending OAuth state too', () => {
    const tokens = new TokensService({}, new JwtService(), {
        isProduction: true,
        cookie: { access: '__Host-ns_at', refresh: '__Secure-ns_rt', oauthState: '__Secure-ns_oauth' },
    });
    const cookies = [];
    tokens.setAuthCookies({ cookie: (name, _, options) => cookies.push({ name, ...options }), setHeader() {} }, 'access', 'refresh');
    assert(cookies.every((x) => x.httpOnly && x.secure));
    assert.equal(cookies[0].sameSite, 'lax');
    assert.equal(cookies[1].sameSite, 'strict');
    const cleared = [];
    tokens.clearAuthCookies({ clearCookie: (name) => cleared.push(name) });
    assert(cleared.includes('__Secure-ns_oauth'));
});

test('invalid webhook signatures never populate configuration cache; unknown guilds are rejected', async () => {
    let lookups = 0;
    const bot = new PrBotService(
        {
            getWebhookSecret: async () => {
                throw Error('must not read secret');
            },
        },
        {},
        {
            guild: {
                findUnique: async () => {
                    lookups++;
                    return null;
                },
            },
        },
        { get() {} },
        {},
    );
    assert.equal(await bot.verifySignature('12345', Buffer.from('{}'), 'bad', false), false);
    assert.equal(lookups, 0);
    assert.equal(await bot.verifySignature('12345', Buffer.from('{}'), 'sha256=' + '0'.repeat(64), false), false);
    assert.equal(lookups, 1);
    const config = new BotConfigService({ config: { findMany: async () => [] } }, { isHome: () => false });
    for (let i = 0; i < 100; i++) await config.get(String(i), 'missing');
    assert.equal(config.cache.size, 0);
});

test('webhook controller ACKs only after durable enqueue succeeds', async () => {
    let acknowledged = false;
    const controller = new GithubWebhookController(
        { homeGuildId: '12345', verifySignature: async () => true },
        {
            enqueue: async () => {
                throw Error('DB unavailable');
            },
        },
    );
    await assert.rejects(
        controller.legacy(Buffer.from('{}'), 'sig', 'pull_request', 'id', {
            sendStatus() {
                acknowledged = true;
            },
        }),
        /DB unavailable/,
    );
    assert.equal(acknowledged, false);
});

test('image processing rejects vector input, excessive dimensions and oversized streamed downloads', async () => {
    await assert.rejects(safeImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>')));
    const sharp = req('sharp');
    const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#ffffff' } })
        .png()
        .toBuffer();
    const result = await safeImage(png);
    assert.equal(result.width, 2);
    assert.equal(result.mimeType, 'image/png');
    const oversized = Buffer.from(png);
    oversized.writeUInt32BE(100000, 16);
    oversized.writeUInt32BE(100000, 20);
    await assert.rejects(safeImage(oversized));
    let cancelled = false;
    const stream = new ReadableStream({
        pull(controller) {
            controller.enqueue(new Uint8Array(6));
        },
        cancel() {
            cancelled = true;
        },
    });
    await assert.rejects(readBoundedResponse(new Response(stream), 10), /too large/);
    assert(cancelled);
});

test('production startup requires HTTPS origins and a strong secret; proxy hop counts/wildcards are rejected', () => {
    const base = { DATABASE_URL: 'postgresql://fixture/fixture' };
    assert.throws(() => validateEnv(base));
    const prod = { ...base, JWT_SECRET: 'x'.repeat(48), DASHBOARD_URL: 'https://dashboard.example.com' };
    assert.equal(validateEnv(prod).NODE_ENV, 'production');
    for (const patch of [
        { NODE_ENV: 'prod' },
        { DASHBOARD_URL: 'http://dashboard.example.com' },
        { CORS_ORIGINS: 'https://*.example.com' },
        { TRUST_PROXY: '1' },
        { TRUST_PROXY: 'true' },
    ]) {
        assert.throws(() => validateEnv({ ...prod, ...patch }));
    }
    assert.equal(validateEnv(prod).HOST, '127.0.0.1');
});

test('AI requests fail closed when durable quota reservation fails', async () => {
    const ai = quiet(
        new GeminiService(
            { get: (key) => ({ GEMINI_KEY: 'fixture', AI_DAILY_LIMIT: 5, AI_GUILD_DAILY_LIMIT: 2 })[key] },
            {
                $transaction: async () => {
                    throw Error('DB unavailable');
                },
            },
            { isHome: () => false },
        ),
    );
    assert.equal(await ai.reserve('guild'), 'disabled');
});
