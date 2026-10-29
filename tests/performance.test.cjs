const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../apps/backend/node_modules/reflect-metadata');
const { ResultCache } = require('../apps/backend/dist/common/utils/result-cache');
const { RankCardController } = require('../apps/backend/dist/rank/rank-card.controller');
const { RankCardRenderer } = require('../apps/backend/dist/rank/rank-card.renderer');
const { WelcomeRenderer } = require('../apps/backend/dist/welcome/welcome.renderer');
const { WelcomeController } = require('../apps/backend/dist/welcome/welcome.controller');
const { loadImage } = require('../apps/backend/node_modules/@napi-rs/canvas');
const shared = require('../packages/shared/dist');
const response = () => ({
    headers: {},
    set(k, v) {
        this.headers[k] = v;
        return this;
    },
    type(v) {
        this.mime = v;
        return this;
    },
    send(v) {
        this.body = v;
        return this;
    },
});

test('result cache deduplicates, expires, evicts by bytes and never caches failures', async () => {
    let now = 0,
        calls = 0;
    const cache = new ResultCache(
        15,
        2,
        5,
        (x) => x.length,
        () => now,
    );
    const load = async () => {
        calls++;
        return 'abc';
    };
    assert.deepEqual(await Promise.all([cache.get('g1', load), cache.get('g1', load)]), ['abc', 'abc']);
    await cache.get('g1', load);
    assert.equal(calls, 1);
    await cache.get('g2', load);
    await cache.get('g1', load);
    assert.equal(calls, 3); // Byte cap evicts g1 even though entry cap is not reached.
    now = 16;
    await cache.get('g1', load);
    assert.equal(calls, 4);
    await assert.rejects(
        cache.get('failed', async () => {
            throw new Error('offline');
        }),
    );
    assert.equal(await cache.get('failed', async () => 'ok'), 'ok');
});

test('clearing fences in-flight results and permits a fresh request', async () => {
    const cache = new ResultCache(1000);
    let finish;
    const old = cache.get(
        'key',
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    await Promise.resolve();
    cache.clear();
    await cache.get('key', async () => 'new');
    finish('old');
    assert.equal(await old, 'old');
    assert.equal(await cache.get('key', async () => 'wrong'), 'new');
});

test('rank preview isolates guild/user/draft/format, validates cache hits and invalidates saves', async () => {
    let renders = 0,
        allowed = true;
    const cards = {
        assertOwnedAssets: async () => {
            if (!allowed) throw new Error('asset removed');
        },
        preview: async (...args) => {
            renders++;
            return Buffer.from(args.at(-1) ? 'webp' : 'png');
        },
    };
    const controller = new RankCardController({ saveTheme: async (_, theme) => theme }, cards, {}, {}, {});
    controller.logger = { error() {} };
    const body = { kind: 'rank', theme: shared.defaultRankTheme() };
    const user = { id: 1, discordId: 'u' };
    const res = response();
    await Promise.all([controller.preview('g', body, user, res, '1'), controller.preview('g', body, user, response(), '1')]);
    assert.equal(renders, 1);
    assert.equal(res.mime, 'image/webp');
    assert.equal(res.body.toString(), 'webp');
    assert.match(res.headers['Server-Timing'], /total;dur=/);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    const legacy = await controller.preview('g', body, user, response());
    assert.equal(legacy.image, 'data:image/png;base64,cG5n');
    await controller.preview('other', body, user, response(), '1');
    await controller.preview('g', body, { ...user, id: 2 }, response(), '1');
    await controller.preview('g', { ...body, theme: { ...body.theme, style: { ...body.theme.style, accentColor: '#ff0000' } } }, user, response(), '1');
    assert.equal(renders, 5);
    allowed = false;
    await assert.rejects(controller.preview('g', body, user, response(), '1'));
    allowed = true;
    await controller.saveTheme('g', { theme: body.theme });
    await controller.preview('g', body, user, response(), '1');
    assert.equal(renders, 6);
});

test('welcome binary preview preserves Thai variables and validates deleted assets before cache hits', async () => {
    let exists = true,
        renders = 0;
    const vars = { user: 'ชื่อทดสอบ', username: 'demo', id: '1', server: 'เซิร์ฟเวอร์', memberCount: '3' };
    const controller = new WelcomeController(
        { getAssetInfo: async () => (exists ? {} : null) },
        {},
        {
            resolveSample: async () => ({}),
            renderImage: async () => {
                renders++;
                return { image: Buffer.from('webp'), vars };
            },
        },
        {},
    );
    const body = { design: shared.defaultDesign(), backgroundId: 1, userId: null };
    const res = response();
    await controller.preview('g', body, { id: 1, discordId: null }, res, '1');
    await controller.preview('g', body, { id: 1, discordId: null }, response(), '1');
    assert.equal(renders, 1);
    assert.deepEqual(JSON.parse(decodeURIComponent(res.headers['X-Preview-Vars'])), vars);
    exists = false;
    await assert.rejects(controller.preview('g', body, { id: 1, discordId: null }, response(), '1'));
});

test('compact previews are smaller WebP images while Discord outputs remain full-size PNG', async () => {
    const renderer = new RankCardRenderer();
    const data = {
        displayName: 'สมาชิกทดสอบ',
        username: 'demo',
        avatar: null,
        rank: 1,
        level: 12,
        xp: 15500,
        levelStartXp: 14400,
        nextLevelXp: 16900,
        serverName: 'Server',
    };
    for (const layout of shared.RANK_LAYOUTS) {
        const style = { ...shared.defaultRankStyle(), layout };
        const full = await renderer.renderRank(style, data, {});
        const small = await renderer.renderRank(style, data, {}, true);
        assert.equal(full.subarray(1, 4).toString(), 'PNG');
        assert.equal(small.subarray(8, 12).toString(), 'WEBP');
        const image = await loadImage(small);
        assert(image.width <= 800 && image.height <= 1000);
        assert(small.length < full.length);
        const original = await loadImage(full);
        assert.equal(original.width, shared.RANK_CARD_SIZES[layout].width);
    }
    const welcome = new WelcomeRenderer({});
    const design = shared.defaultDesign();
    const input = { design, vars: { user: 'Test', username: 'test', server: 'Server', id: '1', memberCount: '2' } };
    const small = await welcome.render(input, true);
    const full = await welcome.render(input);
    assert.equal(small.subarray(8, 12).toString(), 'WEBP');
    assert.equal(full.subarray(1, 4).toString(), 'PNG');
    assert.equal((await loadImage(full)).width, design.width);
});

test('overview cache shares rolling presets, isolates filters and preserves explicit refresh/custom boundaries', async () => {
    const { ActivityController } = require('../apps/backend/dist/log-manager/controllers/activity.controller');
    let calls = 0;
    const controller = new ActivityController({}, { stats: async (input) => ({ ...input, revision: ++calls }) }, {});
    const query = { includeBots: false, limit: 10, hours: 720 };
    const first = await controller.stats('g', query, response());
    const warm = await controller.stats('g', query, response());
    assert.equal(first.revision, warm.revision);
    for (const [guild, extra] of [
        ['other', {}],
        ['g', { includeBots: true }],
        ['g', { tz: 'UTC' }],
        ['g', { interval: 'hour' }],
        ['g', { limit: 20 }],
        ['g', { hours: 24 }],
    ]) {
        assert.notEqual((await controller.stats(guild, { ...query, ...extra }, response())).revision, first.revision);
    }
    const custom = { ...query, from: new Date('2026-09-01T01:02:03.123Z'), to: new Date('2026-09-20T11:12:13.456Z') };
    const exact = await controller.stats('g', custom, response());
    assert.equal(exact.from.toISOString(), custom.from.toISOString());
    assert.equal(exact.to.toISOString(), custom.to.toISOString());
    const fresh = await controller.stats('g', { ...custom, fresh: true }, response());
    assert.notEqual(fresh.revision, exact.revision);
    assert.equal((await controller.stats('g', custom, response())).revision, fresh.revision);
});

test('explicit overview refresh still enforces the maximum one-year range', async () => {
    const { ActivityController } = require('../apps/backend/dist/log-manager/controllers/activity.controller');
    const controller = new ActivityController({}, { stats: async (input) => input }, {});
    const data = await controller.stats('g', { from: new Date('2000-01-01'), fresh: true, includeBots: false, limit: 10 }, response());
    assert.equal(data.to.getTime() - data.from.getTime(), 365 * 86400000);
});

const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
};

test('concurrent guild permission checks share work and isolate users and guilds', async () => {
    const { GuildAccessService } = require('../apps/backend/dist/guilds/guild-access.service');
    const service = new GuildAccessService({}, {});
    const gate = deferred();
    let calls = 0;
    service.checkGuildManager = async () => {
        calls++;
        return gate.promise;
    };
    const requests = Array.from({ length: 20 }, () => service.canManageGuild({ id: 'g' }, 'u'));
    requests.push(service.canManageGuild({ id: 'other' }, 'u'), service.canManageGuild({ id: 'g' }, 'other'));
    await Promise.resolve();
    assert.equal(calls, 3);
    gate.resolve(true);
    assert((await Promise.all(requests)).every(Boolean));
    assert.equal(await service.canManageGuild({ id: 'g' }, 'u'), true);
    assert.equal(calls, 3);
});

for (const invalidate of ['member', 'guild']) {
    test(`permission ${invalidate} invalidation fences old pending checks`, async () => {
        const { GuildAccessService } = require('../apps/backend/dist/guilds/guild-access.service');
        const service = new GuildAccessService({}, {});
        const old = deferred();
        let calls = 0;
        service.checkGuildManager = async () => (++calls === 1 ? old.promise : false);
        const first = service.canManageGuild({ id: 'g' }, 'u');
        await Promise.resolve();
        if (invalidate === 'member') service.forget('u', 'g');
        else service.forgetGuild('g');
        assert.equal(await service.canManageGuild({ id: 'g' }, 'u'), false);
        old.resolve(true);
        await first;
        assert.equal(await service.canManageGuild({ id: 'g' }, 'u'), false);
        assert.equal(calls, 2);
    });
}

test('rejected permission checks release pending work for retry', async () => {
    const { GuildAccessService } = require('../apps/backend/dist/guilds/guild-access.service');
    const service = new GuildAccessService({}, {});
    service.checkGuildManager = async () => {
        throw new Error('offline');
    };
    await assert.rejects(service.canManageGuild({ id: 'g' }, 'u'), /offline/);
    service.checkGuildManager = async () => true;
    assert.equal(await service.canManageGuild({ id: 'g' }, 'u'), true);
});

test('activity metadata shares concurrent queries, isolates guilds and keeps enabled request-specific', async () => {
    const { ActivityService } = require('../apps/backend/dist/log-manager/services/activity.service');
    const gate = deferred();
    let counts = 0,
        oldest = 0;
    const service = new ActivityService(
        {
            activityEvent: {
                count: async () => {
                    counts++;
                    await gate.promise;
                    return 42;
                },
                findFirst: async () => {
                    oldest++;
                    await gate.promise;
                    return { createdAt: new Date('2026-01-01') };
                },
            },
        },
        {},
        {},
        { get: () => 90 },
    );
    const requests = Array.from({ length: 20 }, (_, i) => service.meta('g', i % 2 === 0));
    requests.push(service.meta('other', true));
    await Promise.resolve();
    assert.equal(counts, 2);
    assert.equal(oldest, 2);
    gate.resolve();
    const results = await Promise.all(requests);
    assert.equal(results[0].total, 42);
    assert.equal(results[0].since, '2026-01-01T00:00:00.000Z');
    assert.equal(results[0].enabled, true);
    assert.equal(results[1].enabled, false);
    await service.meta('g', true);
    assert.equal(counts, 2);
});

test('bounded mapping fills a free slot without waiting for the slowest request and preserves order', async () => {
    const { mapConcurrent } = require('../apps/backend/dist/common/utils/map-concurrent');
    const gates = Array.from({ length: 7 }, deferred);
    const started = [];
    const result = mapConcurrent(gates, 3, async (gate, index) => {
        started.push(index);
        await gate.promise;
        return index;
    });
    assert.deepEqual(started, [0, 1, 2]);
    gates[1].resolve();
    await new Promise(setImmediate);
    assert.deepEqual(started, [0, 1, 2, 3]);
    gates.forEach((gate) => gate.resolve());
    assert.deepEqual(await result, [0, 1, 2, 3, 4, 5, 6]);
    assert.deepEqual(await mapConcurrent([], 3, async () => null), []);
    await assert.rejects(
        mapConcurrent([1], 0, async () => null),
        RangeError,
    );
});

for (const mode of ['whitelist', 'blacklist']) {
    test(`${mode} overview batches guild-scoped membership reads and resolves repeated users only once`, async () => {
        const { VoiceGuardService } = require('../apps/backend/dist/voice-guard/voice-guard.service');
        const prefix = mode === 'whitelist' ? 'voiceWhitelist' : 'voiceBlacklist';
        const channels = Array.from({ length: 8 }, (_, i) => ({ channelId: `c${i}`, guildId: 'g', enabled: i % 2 === 0, notify: false }));
        let queries = 0,
            active = 0,
            peak = 0;
        const fetched = [];
        const db = {
            [`${prefix}Channel`]: {
                findMany: async ({ where }) => {
                    assert.deepEqual(where, { guildId: 'g' });
                    queries++;
                    return channels;
                },
            },
            [`${prefix}User`]: {
                findMany: async ({ where }) => {
                    assert.deepEqual(
                        where.channelId.in,
                        channels.map((c) => c.channelId),
                    );
                    queries++;
                    return channels.slice(0, 7).flatMap((c, i) => [
                        { channelId: c.channelId, userId: 'shared' },
                        { channelId: c.channelId, userId: `u${i}` },
                    ]);
                },
            },
        };
        const service = new VoiceGuardService(db, {
            guild: () => ({ channels: { cache: new Map([['c0', { name: 'General' }]]) } }),
            fetchUser: async (id) => {
                fetched.push(id);
                peak = Math.max(peak, ++active);
                await new Promise(setImmediate);
                active--;
                return id === 'u0' ? null : { username: id, globalName: `Name ${id}`, displayAvatarURL: () => `avatar:${id}` };
            },
        });
        const rows = await service.overview(mode, 'g');
        assert.equal(queries, 2);
        assert.equal(fetched.length, 8);
        assert.equal(new Set(fetched).size, 8);
        assert.equal(peak, 5);
        assert.equal(rows[0].channelName, 'General');
        assert.equal(rows[1].channelName, 'c1');
        assert.equal(rows[1].enabled, false);
        assert.equal(rows[0].users[0].username, 'Name shared');
        assert.equal(rows[0].users[1].username, 'u0');
        assert.deepEqual(rows[7].users, []);
    });
}

test('Room Access keeps fresh permissions and room-specific expiry while deduplicating profile lookups', async () => {
    const { RoomAccessService } = require('../apps/backend/dist/room-access/room-access.service');
    const { Collection, OverwriteType } = require('../apps/backend/node_modules/discord.js');
    const channels = Array.from({ length: 8 }, (_, i) => ({ channelId: `c${i}` }));
    const fetched = [],
        forced = [];
    let active = 0,
        peak = 0;
    const service = new RoomAccessService(
        {
            roomAccessChannel: {
                findMany: async ({ where }) => {
                    assert.deepEqual(where, { guildId: 'g' });
                    return channels;
                },
            },
            roomAccess: { findMany: async () => [{ roomId: 'c0', userId: 'u', expireAt: new Date(12345) }] },
        },
        {
            requireReady() {},
            fetchGuildChannel: async (guild, id, force) => {
                assert.equal(guild, 'g');
                forced.push(force);
                peak = Math.max(peak, ++active);
                await new Promise(setImmediate);
                active--;
                if (id === 'c7') return null;
                return {
                    name: id,
                    permissionOverwrites: {
                        cache: new Collection([
                            ['u', { type: OverwriteType.Member, allow: { has: () => true } }],
                            ['denied', { type: OverwriteType.Member, allow: { has: () => false } }],
                            ['role', { type: OverwriteType.Role, allow: { has: () => true } }],
                        ]),
                    },
                };
            },
            fetchUser: async (id) => {
                fetched.push(id);
                return null;
            },
        },
    );
    const rows = await service.list('g');
    assert.equal(peak, 5);
    assert.equal(forced.length, 8);
    assert(forced.every(Boolean));
    assert.deepEqual(fetched, ['u']);
    assert.equal(rows.length, 7);
    assert.deepEqual(
        rows.map((row) => row.roomId),
        channels.slice(0, 7).map((row) => row.channelId),
    );
    assert.equal(rows[0].type, 'temporary');
    assert.equal(rows[0].expireAt, 12345);
    assert.equal(rows[1].type, 'permanent');
    assert.equal(rows[1].expireAt, null);
    assert.equal(rows[0].username, 'u');
    assert.equal(rows[0].avatar, null);
});

test('Levels reads settings alongside the page and preserves page ranks with bounded profile work', async () => {
    const { LevelsService } = require('../apps/backend/dist/levels/levels.service');
    const settingsGate = deferred();
    let pageStarted = false,
        active = 0,
        peak = 0;
    const rows = Array.from({ length: 12 }, (_, i) => ({ userId: `u${i}`, xp: 1000 - i, level: 0 }));
    const service = new LevelsService(
        {
            xpSetting: {
                findUnique: async () => {
                    await settingsGate.promise;
                    return null;
                },
            },
            level: {
                count: async () => 30,
                findMany: async () => {
                    pageStarted = true;
                    return rows;
                },
            },
            $transaction: (queries) => Promise.all(queries),
        },
        {
            ready: true,
            guild: () => null,
            displayName: async (id) => {
                peak = Math.max(peak, ++active);
                await new Promise(setImmediate);
                active--;
                return `Name ${id}`;
            },
        },
    );
    const pending = service.list('g', { page: 2, pageSize: 12 });
    assert.equal(pageStarted, true);
    settingsGate.resolve();
    const result = await pending;
    assert.equal(peak, 5);
    assert.equal(result.total, 30);
    assert.deepEqual(
        result.items.map((row) => row.rank),
        Array.from({ length: 12 }, (_, i) => 13 + i),
    );
    assert.equal(result.items[0].username, 'Name u0');
});
