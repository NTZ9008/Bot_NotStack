const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { PrismaService } = require('../apps/backend/dist/prisma/prisma.service');
const { LevelsService } = require('../apps/backend/dist/levels/levels.service');
const { defaultXpSettings, defaultXpRule, levelForXp, xpAtLevel, MAX_XP } = require('../packages/shared/dist');
const url = process.env.XP_TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/notstack_xp_test') throw Error('Use the disposable test cluster: pnpm test:integration');
const prisma = new PrismaService({ get: () => url });
const discord = { ready: null, guild: () => null, homeGuildId: '11111' };
const service = new LevelsService(prisma, discord);
const context = { source: 'message', channelId: '12345', roleIds: [], messageLength: 30 };
const mutation = (userId, action, amount) => ({ userId, action, amount, reason: 'test' });
const fixedSettings = () => ({ ...defaultXpSettings(), rules: [{ ...defaultXpRule(), minXp: 100, maxXp: 100, cooldownSeconds: 1 }] });
async function configure(settings, guild = '11111') {
    const current = await service.settings(guild);
    return service.updateSettings(guild, { revision: current.revision, settings });
}
// The service mirrors committed cooldowns in memory; editing xp_progress directly must clear that mirror too.
async function clearCooldown(target = service) {
    await prisma.xpProgress.updateMany({ data: { lastAttemptAt: new Date(0) } });
    target.cooldowns.clear();
}
before(async () => {
    await prisma.$connect();
});
beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE levels, xp_settings, xp_progress, xp_daily, xp_history RESTART IDENTITY');
    service.settingsCache.clear();
    service.cooldowns.clear();
});
after(async () => {
    await prisma.$disconnect();
});

test('existing XP is preserved and awards create durable history', async () => {
    await prisma.level.create({ data: { guildId: '11111', userId: '22222', xp: 10000, level: 1 } });
    const result = await service.list('11111');
    assert.equal(result.items[0].xp, 10000);
    assert.equal(result.items[0].level, 10);
    await configure(fixedSettings());
    assert.equal(await service.award('11111', '22222', context), 100);
    assert.equal((await service.list('11111')).items[0].xp, 10100);
    assert.equal((await service.history('11111', {})).items[0].delta, 100);
});
test('concurrent awards for the same rule respect a single persisted cooldown', async () => {
    await configure(fixedSettings());
    const results = await Promise.all(Array.from({ length: 8 }, () => service.award('11111', '22222', context)));
    assert.equal(
        results.reduce((a, b) => a + b, 0),
        100,
    );
    assert.equal((await service.list('11111')).items[0].xp, 100);
});
test('concurrent admin additions and awards never overwrite newer balances', async () => {
    await configure(fixedSettings());
    const results = await Promise.all([
        service.award('11111', '22222', context),
        ...Array.from({ length: 8 }, () => service.mutateMember('11111', mutation('22222', 'add', 100), 1)),
    ]);
    assert.equal((await service.list('11111')).items[0].xp, 900);
    const history = await service.history('11111', {});
    assert.equal(history.items.length, 9);
    assert.equal(history.items[0].balance, 900);
    for (const result of results.slice(1)) {
        assert.equal(result.afterXp - result.beforeXp, 100);
        assert.equal(result.delta, 100);
        assert(history.items.some((row) => row.source === 'admin.add' && row.balance === result.afterXp));
    }
    assert.equal(new Set(results.slice(1).map((r) => r.afterXp)).size, 8);
});
test('member mutation receipts report committed before/after values for every action', async () => {
    const check = async (action, amount, beforeXp, afterXp) => {
        const result = await service.mutateMember('11111', mutation('22222', action, amount), 1);
        assert.deepEqual(result, { success: true, userId: '22222', action, beforeXp, afterXp, delta: afterXp - beforeXp });
        const latest = (await service.history('11111', {})).items[0];
        assert.equal(latest.balance, result.afterXp);
        assert.equal(latest.delta, result.delta);
    };
    await check('add', 100, 0, 100);
    await check('add', 50, 100, 150);
    await check('subtract', 1000, 150, 0);
    await check('set', 250, 0, 250);
    await check('reset', 0, 250, 0);
    await check('set', 300, 0, 300);
    await check('delete', 0, 300, 0);
    assert.equal(await prisma.level.count(), 0);
    await check('delete', 0, 0, 0);
});
test('guild reset receipt reports only the affected guild and handles an empty guild', async () => {
    await service.mutateMember('11111', mutation('22222', 'set', 100), 1);
    await service.mutateMember('11111', mutation('33333', 'set', 250), 1);
    await service.mutateMember('99999', mutation('22222', 'set', 500), 1);
    assert.deepEqual(await service.resetGuild('11111', 'new season', 1), {
        success: true,
        affectedMembers: 2,
        beforeXp: 350,
        afterXp: 0,
        delta: -350,
    });
    const empty = await service.resetGuild('11111', 'already empty', 1);
    assert.equal(empty.affectedMembers, 0);
    assert.equal(empty.beforeXp, 0);
    assert.equal(empty.afterXp, 0);
    assert.equal(empty.delta, 0);
    assert.equal((await service.list('99999')).items[0].xp, 500);
});
test('rule stacking obeys both rule and shared daily caps across restarts', async () => {
    const settings = fixedSettings();
    settings.dailyCap = 150;
    settings.rules[0].dailyCap = 120;
    settings.rules.push({ ...settings.rules[0], id: 'bonus', dailyCap: 0 });
    await configure(settings);
    assert.equal(await service.award('11111', '22222', context), 150);
    const restarted = new LevelsService(prisma, discord);
    await clearCooldown();
    assert.equal(await restarted.award('11111', '22222', context), 0);
    assert.equal((await restarted.list('11111')).items[0].xp, 150);
});
test('failed chance consumes cooldown without adding XP', async () => {
    const settings = fixedSettings();
    settings.rules[0].chancePercent = 0;
    await configure(settings);
    assert.equal(await service.award('11111', '22222', context), 0);
    assert.equal(await prisma.xpProgress.count(), 1);
    assert.equal(await prisma.level.count(), 0);
    settings.rules[0].chancePercent = 100;
    await configure(settings);
    assert.equal(await service.award('11111', '22222', context), 0);
});
test('day rollover resets caps while member resets do not reset daily earnings', async () => {
    const settings = fixedSettings();
    settings.dailyCap = 100;
    await configure(settings);
    await service.award('11111', '22222', context);
    await service.mutateMember('11111', mutation('22222', 'reset', 0), 1);
    await clearCooldown();
    assert.equal(await service.award('11111', '22222', context), 0);
    await prisma.xpDaily.updateMany({ data: { day: '2000-01-01' } });
    await prisma.xpProgress.updateMany({ data: { day: '2000-01-01', lastAttemptAt: new Date(0) } });
    service.cooldowns.clear();
    assert.equal(await service.award('11111', '22222', context), 100);
});
test('full member CRUD, clamp-to-zero, overflow guard, pagination and guild isolation', async () => {
    await service.mutateMember('11111', mutation('22222', 'set', 10000), 1);
    await service.mutateMember('11111', mutation('33333', 'add', 10000), 1);
    await service.mutateMember('99999', mutation('22222', 'set', 500), 1);
    let page = await service.list('11111', { page: 2, pageSize: 1 });
    assert.equal(page.total, 2);
    assert.equal(page.items[0].rank, 2);
    assert.equal(page.items[0].userId, '33333');
    await service.mutateMember('11111', mutation('22222', 'subtract', 20000), 1);
    page = await service.list('11111', { page: 1, pageSize: 1, userId: '22222' });
    assert.equal(page.items[0].level, 0);
    assert.equal(page.items[0].rank, 2);
    await service.mutateMember('11111', mutation('22222', 'set', MAX_XP), 1);
    await assert.rejects(service.mutateMember('11111', mutation('22222', 'add', 1), 1));
    assert.equal((await service.list('11111', { page: 1, pageSize: 1, userId: '22222' })).items[0].xp, MAX_XP);
    await service.mutateMember('11111', mutation('22222', 'delete', 0), 1);
    assert.equal((await service.list('99999')).items[0].xp, 500);
    await service.resetGuild('11111', 'new season', 1);
    assert.equal((await service.list('11111')).total, 0);
    assert.equal((await service.list('99999')).total, 1);
    assert((await service.history('11111', {})).items.some((r) => r.source === 'admin.reset_all'));
});
test('name search preserves global ranks and ID lookup avoids Discord search', async () => {
    const userId = '123456789012345678';
    await service.mutateMember('11111', mutation(userId, 'set', 100), 1);
    await service.mutateMember('11111', mutation('223456789012345678', 'set', 200), 1);
    let calls = 0;
    const searchService = new LevelsService(prisma, {
        ...discord,
        requireGuild: () => ({
            members: {
                fetch: async ({ query, limit }) => {
                    calls++;
                    assert.equal(query, 'Alice');
                    assert.equal(limit, 100);
                    return new Map([[userId, {}]]);
                },
            },
        }),
    });
    const named = await searchService.list('11111', { page: 1, pageSize: 25, q: 'Alice' });
    assert.equal(named.total, 1);
    assert.equal(named.items[0].rank, 2);
    assert.equal(named.searchLimited, false);
    const exact = await searchService.list('11111', { page: 1, pageSize: 25, q: userId });
    assert.equal(exact.items[0].userId, userId);
    assert.equal(exact.items[0].rank, 2);
    assert.equal(calls, 1);
});
test('settings CRUD uses revision conflicts; changing curve preserves XP', async () => {
    const initial = await service.settings('11111');
    assert.equal(initial.revision, 0);
    const settings = fixedSettings();
    settings.rules.push({ ...defaultXpRule('command', 'custom'), enabled: true });
    await service.updateSettings('11111', { revision: 0, settings });
    await assert.rejects(service.updateSettings('11111', { revision: 0, settings }));
    await service.mutateMember('11111', mutation('22222', 'set', 10000), 1);
    settings.curveBase = 10;
    settings.curveExponent = 1;
    settings.rules.splice(0, 1);
    await configure(settings);
    const page = await service.list('11111');
    assert.equal(page.items[0].xp, 10000);
    assert.equal(page.items[0].level, 1000);
    assert.equal((await service.settings('11111')).settings.rules.length, 1);
    assert.equal((await service.settings('99999')).revision, 0);
});
test('curve updates persist the same levels as the shared formula at exact boundaries', async () => {
    for (const exponent of [1.3, 2.5, 3]) {
        const settings = { ...fixedSettings(), curveBase: 1, curveExponent: exponent };
        const amounts = [0, 1, 8, 27, 64, 125, 1000, xpAtLevel(100, settings), MAX_XP];
        for (const [index, xp] of amounts.entries()) {
            await service.mutateMember('11111', mutation(String(index), 'set', xp), 1);
        }
        await configure(settings);
        for (const row of await prisma.level.findMany({ where: { guildId: '11111' } })) {
            assert.equal(row.level, levelForXp(row.xp, settings), `XP=${row.xp}, exponent=${exponent}`);
        }
    }
});
test('transaction rolls back cooldown, balance and daily cap when history write fails', async () => {
    await configure(fixedSettings());
    const original = service.lockedMember.bind(service);
    service.lockedMember = (guild, user, work) =>
        original(guild, user, (tx) =>
            work(
                new Proxy(tx, {
                    get(target, key) {
                        if (key === 'xpHistory')
                            return {
                                create: async () => {
                                    throw Error('simulated write failure');
                                },
                            };
                        return target[key];
                    },
                }),
            ),
        );
    try {
        await assert.rejects(service.award('11111', '22222', context));
    } finally {
        service.lockedMember = original;
    }
    assert.equal(await prisma.xpProgress.count(), 0);
    assert.equal(await prisma.level.count(), 0);
    assert.equal(await prisma.xpDaily.count(), 0);
    assert.equal(await service.award('11111', '22222', context), 100);
});
test('awards skip the transaction when XP is off or every matching rule is cooling down', async () => {
    let transactions = 0;
    const original = service.lockedMember.bind(service);
    service.lockedMember = (...args) => {
        transactions++;
        return original(...args);
    };
    try {
        await configure({ ...fixedSettings(), enabled: false });
        assert.equal(await service.award('11111', '22222', context), 0);
        assert.equal(transactions, 0);
        await configure({ ...fixedSettings(), rules: [{ ...fixedSettings().rules[0], cooldownSeconds: 60 }] });
        assert.equal(await service.award('11111', '22222', context), 100);
        assert.equal(await service.award('11111', '22222', context), 0);
        assert.equal(transactions, 1);
        // Another member is not affected by the first member's cooldown.
        assert.equal(await service.award('11111', '33333', context), 100);
        assert.equal(transactions, 2);
    } finally {
        service.lockedMember = original;
    }
});
test('awards for different members do not wait on each other, settings changes wait for awards', async () => {
    await configure(fixedSettings());
    const order = [];
    const original = service.lockedMember.bind(service);
    let release;
    const held = new Promise((resolve) => (release = resolve));
    // Hold member A's transaction open; member B must still complete.
    service.lockedMember = (guild, user, work) =>
        original(guild, user, async (tx) => {
            const result = await work(tx);
            if (user === '22222') await held;
            order.push(user);
            return result;
        });
    try {
        const slow = service.award('11111', '22222', context);
        await new Promise((resolve) => setTimeout(resolve, 200));
        assert.equal(await service.award('11111', '33333', context), 100);
        const settings = service.updateSettings('11111', { ...(await service.settings('11111')), settings: { ...fixedSettings(), multiplierPercent: 200 } }).then(() =>
            order.push('settings'),
        );
        await new Promise((resolve) => setTimeout(resolve, 200));
        assert.deepEqual(order, ['33333']);
        release();
        await Promise.all([slow, settings]);
        assert.deepEqual(order, ['33333', '22222', 'settings']);
    } finally {
        service.lockedMember = original;
    }
});
test('level changes are published after commit for awards and admin edits only when the level moves', async () => {
    await configure(fixedSettings());
    const changes = [];
    const subscription = service.levelChanges.subscribe((change) => changes.push(change));
    try {
        // สูตรเริ่มต้น 100 × level² → 100 XP = เลเวล 1, 400 XP = เลเวล 2
        assert.equal(await service.award('11111', '22222', context), 100);
        await service.mutateMember('11111', mutation('22222', 'add', 300), 1);
        await service.mutateMember('11111', mutation('22222', 'add', 1), 1);
        await service.mutateMember('11111', mutation('22222', 'set', 0), 1);
        await assert.rejects(service.mutateMember('11111', mutation('22222', 'set', MAX_XP + 1), 1));
    } finally {
        subscription.unsubscribe();
    }
    assert.deepEqual(
        changes.map((c) => [c.source, c.previousLevel, c.level, c.xp, c.channelId]),
        [
            ['message', 0, 1, 100, '12345'],
            ['admin.add', 1, 2, 400, null],
            ['admin.set', 2, 0, 0, null],
        ],
    );
});
test('XP management endpoints default to manage; only leaderboard is view', () => {
    const { LevelsController } = require('../apps/backend/dist/levels/levels.controller');
    const { GUILD_ACCESS_KEY } = require('../apps/backend/dist/guilds/decorators/guild-route.decorator');
    assert.equal(Reflect.getMetadata(GUILD_ACCESS_KEY, LevelsController), 'manage');
    assert.equal(Reflect.getMetadata(GUILD_ACCESS_KEY, LevelsController.prototype.list), 'view');
    for (const name of ['settings', 'update', 'member', 'reset', 'history'])
        assert.notEqual(Reflect.getMetadata(GUILD_ACCESS_KEY, LevelsController.prototype[name]), 'view');
});
test('HTTP API enforces manage permission, guild boundary and Zod validation', async () => {
    const { Module } = require('../apps/backend/node_modules/@nestjs/common');
    const { NestFactory } = require('../apps/backend/node_modules/@nestjs/core');
    const { LevelsController } = require('../apps/backend/dist/levels/levels.controller');
    const { GuildAccessGuard } = require('../apps/backend/dist/guilds/guards/guild-access.guard');
    const { GuildAccessService } = require('../apps/backend/dist/guilds/guild-access.service');
    const { ZodValidationPipe } = require('../apps/backend/dist/common/pipes/zod-validation.pipe');
    const member = (manage) => ({ permissions: { has: () => manage } });
    const access = new GuildAccessService(
        {
            ready: true,
            guild: (id) =>
                id === '11111'
                    ? {
                          id,
                          ownerId: '00000',
                          members: {
                              cache: new Map([
                                  ['manager', member(true)],
                                  ['viewer', member(false)],
                              ]),
                              fetch: async () => {
                                  throw Error('not a member');
                              },
                          },
                      }
                    : null,
        },
        prisma,
    );
    class TestModule {}
    Module({
        controllers: [LevelsController],
        providers: [{ provide: LevelsService, useValue: service }, { provide: GuildAccessService, useValue: access }, GuildAccessGuard],
    })(TestModule);
    const app = await NestFactory.create(TestModule, { logger: false });
    app.use((req, _res, next) => {
        req.user = { id: 1, role: 'USER', discordId: req.headers['x-test-user'] ?? 'viewer' };
        next();
    });
    app.useGlobalPipes(new ZodValidationPipe());
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const request = (route, user = 'viewer', body) =>
        fetch(`${base}/guilds/${route}`, {
            method: body ? 'POST' : 'GET',
            headers: { 'x-test-user': user, 'Content-Type': 'application/json' },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
    try {
        assert.equal((await request('11111/levels')).status, 200);
        for (const route of ['settings', 'history']) assert.equal((await request(`11111/levels/${route}`)).status, 403);
        assert.equal((await request('11111/levels/members', 'viewer', mutation('22222', 'add', 10))).status, 403);
        assert.equal((await request('99999/levels/members', 'manager', mutation('22222', 'add', 10))).status, 403);
        assert.equal((await request('11111/levels/members', 'manager', { ...mutation('22222', 'add', 10), amount: -1 })).status, 400);
        assert.equal((await request('11111/levels/reset', 'manager', { confirmation: 'wrong', reason: 'test' })).status, 400);
        const updated = await request('11111/levels/members', 'manager', mutation('22222', 'add', 100));
        assert.equal(updated.status, 200);
        assert.deepEqual(await updated.json(), {
            success: true,
            userId: '22222',
            action: 'add',
            beforeXp: 0,
            afterXp: 100,
            delta: 100,
        });
        assert.equal((await service.list('11111')).items[0].xp, 100);
        assert.equal((await service.list('99999')).total, 0);
    } finally {
        await app.close();
    }
});
