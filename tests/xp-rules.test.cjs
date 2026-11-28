const { test } = require('node:test');
const assert = require('node:assert/strict');
const { defaultXpSettings, defaultXpRule, matchingXpRules, rollXp, levelForXp, xpAtLevel, xpSettingsSchema } = require('../packages/shared/dist');
const ctx = { source: 'message', channelId: '12345', roleIds: [], messageLength: 100 };
test('default rules preserve original chat/voice amounts and cooldown', () => {
    const rules = defaultXpSettings().rules;
    assert.deepEqual(
        rules.map((r) => [r.source, r.minXp, r.maxXp, r.cooldownSeconds]),
        [
            ['message', 15, 25, 60],
            ['voice', 5, 10, 60],
        ],
    );
});
test('level calculation handles huge jumps, reductions, boundaries and fractional curves', () => {
    const settings = defaultXpSettings();
    assert.equal(levelForXp(99, settings), 0);
    assert.equal(levelForXp(100, settings), 1);
    assert.equal(levelForXp(10000, settings), 10);
    assert.equal(levelForXp(0, settings), 0);
    for (const exponent of [1, 1.1, 1.5, 2, 2.7, 3])
        for (let level = 1; level < 200; level++) {
            const curve = { curveBase: 173, curveExponent: exponent };
            const xp = xpAtLevel(level, curve);
            assert.equal(levelForXp(xp, curve), level);
            assert.equal(levelForXp(xp - 1, curve), level - 1);
        }
});
test('multipliers compose, chance supports 0 and 100 percent, awards round down', () => {
    const rule = { ...defaultXpRule(), minXp: 10, maxXp: 10, multiplierPercent: 150 };
    assert.equal(
        rollXp(rule, 200, () => 0),
        30,
    );
    assert.equal(
        rollXp({ ...rule, chancePercent: 0 }, 100, () => 0),
        0,
    );
    assert.equal(
        rollXp({ ...rule, chancePercent: 50 }, 100, () => 0.5),
        0,
    );
    assert.equal(
        rollXp({ ...rule, minXp: 1, maxXp: 1 }, 100, () => 0),
        1,
    );
});
test('channel/category and any-role filters stack matching rules; exclusions win', () => {
    const settings = defaultXpSettings();
    settings.rules.push({ ...defaultXpRule('message', 'bonus'), channelIds: ['67890'], roleIds: ['11111'] });
    assert.equal(matchingXpRules(settings, { ...ctx, parentId: '67890', roleIds: ['11111'] }).length, 2);
    assert.equal(matchingXpRules(settings, ctx).length, 1);
    settings.excludedRoleIds = ['11111'];
    assert.equal(matchingXpRules(settings, { ...ctx, roleIds: ['11111'] }).length, 0);
    settings.excludedChannelIds = ['67890'];
    assert.equal(matchingXpRules(settings, { ...ctx, parentId: '67890' }).length, 0);
    settings.enabled = false;
    assert.equal(matchingXpRules(settings, ctx).length, 0);
});
test('voice eligibility, minimum message length and command allowlist are enforced', () => {
    const settings = defaultXpSettings();
    const voice = { ...ctx, source: 'voice', voiceMembers: 2 };
    assert.equal(matchingXpRules(settings, voice).length, 1);
    for (const flag of ['muted', 'deafened', 'afk']) assert.equal(matchingXpRules(settings, { ...voice, [flag]: true }).length, 0);
    settings.voiceMinMembers = 3;
    assert.equal(matchingXpRules(settings, voice).length, 0);
    settings.messageMinLength = 101;
    assert.equal(matchingXpRules(settings, ctx).length, 0);
    settings.rules.push({ ...defaultXpRule('command'), enabled: true, commands: ['ping'] });
    assert.equal(matchingXpRules(settings, { ...ctx, source: 'command', command: 'ping' }).length, 1);
    assert.equal(matchingXpRules(settings, { ...ctx, source: 'command', command: 'rank' }).length, 0);
});
test('invalid ranges, duplicate rule IDs and oversized configurations are rejected', () => {
    for (const change of [
        (s) => s.rules.push(s.rules[0]),
        (s) => (s.rules[0].minXp = 999),
        (s) => (s.rules[0].chancePercent = 101),
        (s) => (s.rules[0].cooldownSeconds = 0),
        (s) => (s.curveExponent = 0),
        (s) => (s.rules = Array.from({ length: 51 }, (_, i) => defaultXpRule('message', String(i)))),
    ]) {
        const s = defaultXpSettings();
        change(s);
        assert.equal(xpSettingsSchema.safeParse(s).success, false);
    }
});

test('XP history names members from the Discord cache and admins from their dashboard account', async () => {
    const { LevelsService } = require('../apps/backend/dist/levels/levels.service');
    const at = new Date('2026-11-28T00:00:00Z');
    const row = (id, userId, actorId) => ({ id, guildId: 'g', userId, source: 'admin.add', delta: 10, balance: 10, reason: 'r', actorId, createdAt: at });
    const userQueries = [];
    const prisma = (rows) => ({
        xpHistory: { findMany: async () => rows },
        user: {
            findMany: async (query) => {
                userQueries.push(query.where.id.in);
                return [
                    { id: 1, displayName: 'Mod Ann', username: 'ann', discordUsername: 'ann#1' },
                    { id: 2, displayName: null, username: 'bob', discordUsername: null },
                    { id: 3, displayName: '', username: null, discordUsername: 'carl_dc' },
                    { id: 4, displayName: null, username: null, discordUsername: null },
                ];
            },
        },
    });
    const cached = [];
    const cache = new Map([['111', { displayName: 'Somchai' }]]);
    const ready = { ready: true, cacheMembers: async (guild, ids) => cached.push([guild, ids]), guild: () => ({ members: { cache } }) };
    const rows = [row(9, '111', 1), row(8, '222', 2), row(7, '111', 3), row(6, '333', 4), row(5, '333', null)];
    const page = await new LevelsService(prisma(rows), ready).history('g', {});
    assert.deepEqual(cached, [['g', ['111', '222', '333']]]);
    assert.deepEqual(userQueries, [[1, 2, 3, 4]]);
    assert.deepEqual(
        page.items.map((r) => [r.username, r.actorName]),
        [
            ['Somchai', 'Mod Ann'],
            [null, 'bob'],
            ['Somchai', 'carl_dc'],
            [null, '#4'],
            [null, null],
        ],
    );
    assert.equal(page.items[0].createdAt, at.toISOString());
    assert.equal('guildId' in page.items[0], false);
    assert.equal(page.nextCursor, null);

    // Discord not connected yet and no admin rows: no member lookups, no user query, more pages → cursor
    userQueries.length = 0;
    const many = Array.from({ length: 51 }, (_, i) => row(100 - i, '444', null));
    const offline = await new LevelsService(prisma(many), { ready: false, guild: () => undefined }).history('g', { cursor: 200 });
    assert.equal(offline.items.length, 50);
    assert.equal(offline.items[0].username, null);
    assert.deepEqual(userQueries, []);
    assert.equal(offline.nextCursor, offline.items.at(-1).id);
});
