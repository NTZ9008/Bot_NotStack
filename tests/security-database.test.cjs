const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { PrismaService } = require('../apps/backend/dist/prisma/prisma.service');
const { TokensService } = require('../apps/backend/dist/auth/tokens.service');
const { AuthService } = require('../apps/backend/dist/auth/auth.service');
const { UsersService } = require('../apps/backend/dist/users/users.service');
const { WebhookQueueService } = require('../apps/backend/dist/pr-bot/webhook-queue.service');
const { GeminiService } = require('../apps/backend/dist/chat/gemini.service');
const { WelcomeStore } = require('../apps/backend/dist/welcome/welcome.store');
const { JwtService } = require('../apps/backend/node_modules/@nestjs/jwt');
const bcrypt = require('../apps/backend/node_modules/bcryptjs');
const url = process.env.XP_TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/notstack_xp_test') throw Error('Use pnpm test:integration');
const prisma = new PrismaService({ get: () => url });
const cfg = {
    jwtSecret: 'security-test-only-'.repeat(4),
    isProduction: true,
    cookie: { access: '__Host-ns_at', refresh: '__Secure-ns_rt', oauthState: '__Secure-ns_oauth' },
};
const tokens = new TokensService(prisma, new JwtService(), cfg);
const users = new UsersService(prisma, cfg);
const auth = new AuthService(cfg, tokens, users, {}, { audit: async () => {} });
const quiet = (target) => {
    target.logger = { warn() {}, error() {}, log() {} };
    return target;
};
let user;
before(async () => prisma.$connect());
beforeEach(async () => {
    await prisma.refreshToken.deleteMany();
    await prisma.authSession.deleteMany();
    await prisma.user.deleteMany({ where: { username: { startsWith: 'security-fixture' } } });
    await prisma.webhookDelivery.deleteMany();
    // users_login_method_check: บัญชีต้องมีรหัสผ่านหรือ Discord อย่างน้อยหนึ่งอย่าง
    user = await prisma.user.create({ data: { username: 'security-fixture', passwordHash: await bcrypt.hash('fixture-password', 4), tokenVersion: 0 } });
});
after(async () => prisma.$disconnect());

test('logout revokes copied access and all rotated refresh tokens of that device, leaving other devices active', async () => {
    const first = await tokens.issueRefreshToken(user);
    const other = await tokens.issueRefreshToken(user);
    const access = tokens.signAccessToken(user, first.sessionId);
    const rotated = await tokens.rotateRefreshToken(first.raw);
    assert.equal(rotated.status, 'ok');
    await auth.logout({ user, authSessionId: first.sessionId, cookies: { [cfg.cookie.refresh]: rotated.raw }, get() {} }, { clearCookie() {} });
    const payload = new JwtService().verify(access, { secret: cfg.jwtSecret });
    assert.equal(await tokens.validateSession(payload.sid, user.id, payload.tv), false);
    assert.equal((await tokens.rotateRefreshToken(rotated.raw)).status, 'invalid');
    assert.equal((await tokens.rotateRefreshToken(other.raw)).status, 'ok');
});

test('concurrent rotations have one winner and racing logout leaves no usable successor', async () => {
    const first = await tokens.issueRefreshToken(user);
    const rotations = await Promise.all(Array.from({ length: 5 }, () => tokens.rotateRefreshToken(first.raw)));
    assert.equal(rotations.filter((x) => x.status === 'ok').length, 1);
    assert.equal(rotations.filter((x) => x.status === 'rotated').length, 4);
    for (let i = 0; i < 5; i++) {
        const session = await tokens.issueRefreshToken(user);
        const [result] = await Promise.all([tokens.rotateRefreshToken(session.raw), tokens.revokeFamily(session.sessionId)]);
        assert.equal(await tokens.validateSession(session.sessionId, user.id, 0), false);
        if (result.status === 'ok') assert.equal((await tokens.rotateRefreshToken(result.raw)).status, 'invalid');
    }
});

test('password reset/token-version change invalidates a concurrent refresh and stale authenticated login', async () => {
    const first = await tokens.issueRefreshToken(user);
    const [result] = await Promise.all([tokens.rotateRefreshToken(first.raw), users.bumpTokenVersion(user.id)]);
    assert.equal(await tokens.validateSession(first.sessionId, user.id, 0), false);
    if (result.status === 'ok') assert.equal((await tokens.rotateRefreshToken(result.raw)).status, 'invalid');
    const stale = await tokens.issueRefreshToken(user);
    assert.equal((await tokens.rotateRefreshToken(stale.raw)).status, 'invalid');
    assert.equal(await tokens.validateSession(stale.sessionId, user.id, 0), false);
});

test('absolute session expiry and refresh reuse revoke access independently of JWT expiry', async () => {
    const first = await tokens.issueRefreshToken(user);
    await prisma.authSession.update({ where: { id: first.sessionId }, data: { absoluteExpiresAt: new Date(0) } });
    assert.equal(await tokens.validateSession(first.sessionId, user.id, 0), false);
    assert.equal((await tokens.rotateRefreshToken(first.raw)).status, 'invalid');
    const fresh = await tokens.issueRefreshToken(user);
    const rotated = await tokens.rotateRefreshToken(fresh.raw);
    await prisma.refreshToken.updateMany({ where: { familyId: fresh.sessionId, revokedAt: { not: null } }, data: { revokedAt: new Date(Date.now() - 31000) } });
    assert.equal((await tokens.rotateRefreshToken(fresh.raw)).status, 'reused');
    assert.equal(await tokens.validateSession(fresh.sessionId, user.id, 0), false);
    assert.equal((await tokens.rotateRefreshToken(rotated.raw)).status, 'invalid');
});

const payload = () =>
    Buffer.from(
        JSON.stringify({
            action: 'opened',
            repository: { full_name: 'fixture/repo', html_url: 'https://github.com/fixture/repo' },
            pull_request: { number: 1, title: 'Fixture', html_url: 'https://github.com/fixture/repo/pull/1' },
        }),
    );
test('webhook persistence deduplicates concurrent delivery and signed-body replay with altered headers', async () => {
    let handled = 0;
    const queue = quiet(new WebhookQueueService(prisma, { handle: async () => handled++ }));
    await Promise.all(Array.from({ length: 8 }, () => queue.enqueue('security-guild', crypto.randomUUID(), 'pull_request', payload())));
    assert.equal(await prisma.webhookDelivery.count(), 1);
    await queue.drain();
    await queue.drain();
    assert.equal(handled, 1);
    assert.equal((await prisma.webhookDelivery.findFirst()).status, 'done');
    await queue.enqueue('security-guild', crypto.randomUUID(), 'pull_request', payload());
    await queue.drain();
    assert.equal(handled, 1);
});

test('webhook processing survives failure and retry; invalid payloads never enter the durable queue', async () => {
    let attempts = 0;
    const queue = quiet(
        new WebhookQueueService(prisma, {
            handle: async () => {
                if (++attempts === 1) throw Error('Discord unavailable');
            },
        }),
    );
    await assert.rejects(queue.enqueue('security-guild', crypto.randomUUID(), 'pull_request', Buffer.from('{}')));
    assert.equal(await prisma.webhookDelivery.count(), 0);
    await queue.enqueue('security-guild', crypto.randomUUID(), 'pull_request', payload());
    await queue.drain();
    assert.equal((await prisma.webhookDelivery.findFirst()).status, 'pending');
    await prisma.webhookDelivery.updateMany({ data: { availableAt: new Date(0) } });
    await queue.drain();
    assert.equal(attempts, 2);
    const row = await prisma.webhookDelivery.findFirst();
    assert.equal(row.status, 'done');
    assert.deepEqual(row.payload, {});
});

test('durable AI quota serializes simultaneous calls from multiple service instances', async () => {
    await prisma.aiUsage.deleteMany();
    const config = { get: (key) => ({ GEMINI_KEY: 'fixture', AI_DAILY_LIMIT: 3, AI_GUILD_DAILY_LIMIT: 3 })[key] };
    const instances = [0, 1].map(() => quiet(new GeminiService(config, prisma, { isHome: () => false })));
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => instances[i % 2].reserve('security-guild')));
    assert.equal(results.filter((x) => x === 'ok').length, 3);
    assert.equal((await prisma.aiUsage.findFirst()).count, 3);
});

test('per-guild image quota is enforced atomically across simultaneous uploads', async () => {
    const guildId = 'security-assets';
    await prisma.welcomeAsset.deleteMany({ where: { guildId } });
    const data = { name: 'fixture', mimeType: 'image/png', width: 1, height: 1, size: 1, data: Buffer.from([0]) };
    await prisma.welcomeAsset.createMany({ data: Array.from({ length: 199 }, () => ({ ...data, guildId })) });
    const store = new WelcomeStore(prisma);
    const results = await Promise.allSettled([store.createAsset(guildId, data), store.createAsset(guildId, data)]);
    assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
    assert.equal(await prisma.welcomeAsset.count({ where: { guildId } }), 200);
    await prisma.welcomeAsset.deleteMany({ where: { guildId } });
});
