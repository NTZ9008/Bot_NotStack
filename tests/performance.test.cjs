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
