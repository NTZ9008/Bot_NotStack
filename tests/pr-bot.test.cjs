const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PrBotStatsService } = require('../apps/backend/dist/pr-bot/pr-bot-stats.service');
const { PrBotService } = require('../apps/backend/dist/pr-bot/pr-bot.service');
const { prBotStatsQuerySchema } = require('../packages/shared/dist');

test('PR statistics only accept the supported bounded ranges', () => {
    assert.equal(prBotStatsQuerySchema.parse({}).days, 7);
    for (const days of ['7', '30', '90']) assert.equal(prBotStatsQuerySchema.parse({ days }).days, Number(days));
    for (const days of ['0', '-1', '365', '7.5', '', ['7'], '7 OR 1=1']) assert.equal(prBotStatsQuerySchema.safeParse({ days }).success, false);
});

test('calendar days switch at Thai midnight and include zero buckets across year boundaries', async () => {
    const calls = [];
    const stats = new PrBotStatsService({
        $queryRaw: async (sql, ...values) => {
            calls.push({ sql: sql.join('?'), values });
            return [];
        },
    });
    const now = new Date('2026-12-31T17:00:00.000Z');
    const result = await stats.read('guild-A', 7, now);
    assert.equal(result.range.from, '2026-12-25T17:00:00.000Z');
    assert.equal(result.daily[0].label, '2026-12-26');
    assert.equal(result.daily.at(-1).label, '2027-01-01');
    assert.equal(result.daily.length, 7);
    assert.equal(result.hourly.length, 24);
    assert.deepEqual(result.totals, { sent: 0, merged: 0, closed: 0 });
    assert.equal(result.hourly.at(-1).label, '23:00');
    assert.deepEqual(calls[0].values, ['guild-A', result.range.from, now.toISOString()]);
    assert.match(calls[0].sql, /WHERE guild_id = \? AND created_at >= \?::timestamptz AND created_at <= \?::timestamptz/);
    const before = await stats.read('guild-B', 30, new Date(now.getTime() - 1));
    assert.equal(before.daily.at(-1).label, '2026-12-31');
    assert.equal(before.daily.length, 30);
    assert.equal((await stats.read('guild-B', 90, now)).daily.length, 90);
});

test('daily and hour-of-day distributions agree with totals and preserve empty periods', async () => {
    const stats = new PrBotStatsService({
        $queryRaw: async () => [
            { day: '2026-10-11', hour: 23, kind: 'sent', total: 2n },
            { day: '2026-10-12', hour: 0, kind: 'sent', total: 3n },
            { day: '2026-10-12', hour: 0, kind: 'merged', total: 1n },
            { day: '2026-10-12', hour: 23, kind: 'closed', total: 4n },
        ],
    });
    const result = await stats.read('guild-A', 7, new Date('2026-10-12T16:59:59Z'));
    assert.deepEqual(result.totals, { sent: 5, merged: 1, closed: 4 });
    assert.deepEqual(result.daily.at(-1), { label: '2026-10-12', sent: 3, merged: 1, closed: 4 });
    assert.deepEqual(result.hourly[23], { label: '23:00', sent: 2, merged: 0, closed: 4 });
    for (const kind of ['sent', 'merged', 'closed']) {
        assert.equal(
            result.daily.reduce((sum, row) => sum + row[kind], 0),
            result.totals[kind],
        );
        assert.equal(
            result.hourly.reduce((sum, row) => sum + row[kind], 0),
            result.totals[kind],
        );
    }
    assert.equal(result.daily[0].sent, 0);
});

test('repeated close recordings preserve original timestamp and are isolated by guild', async () => {
    const rows = new Map();
    const stats = new PrBotStatsService({
        prNotification: {
            createMany: async ({ data, skipDuplicates }) => {
                assert.equal(skipDuplicates, true);
                const key = JSON.stringify(data[0]);
                if (!rows.has(key)) rows.set(key, data[0]);
            },
        },
    });
    await stats.record('a', 'message', 'closed');
    await stats.record('a', 'message', 'closed');
    await stats.record('b', 'message', 'closed');
    assert.equal(rows.size, 2);
});

test('statistics storage failure does not fail an already delivered notification', async () => {
    const stats = new PrBotStatsService({
        prNotification: {
            createMany: async () => {
                throw new Error('unavailable');
            },
        },
    });
    const errors = [];
    stats.logger = { error: (...args) => errors.push(args) };
    await assert.doesNotReject(stats.record('a', 'message', 'sent'));
    assert.equal(errors.length, 1);
});

function botFixture({ failSend = false, failEdit = false, channelAvailable = true } = {}) {
    const records = [];
    const message = {
        id: 'message',
        edit: async () => {
            if (failEdit) throw new Error('edit failed');
        },
    };
    const channel = {
        id: 'channel',
        isSendable: () => true,
        messages: { fetch: async () => message },
        send: async () => {
            if (failSend) throw new Error('send failed');
            return message;
        },
    };
    const bot = new PrBotService(
        { getChannelIdForOrg: async () => 'channel', getMentionForRepo: async () => '' },
        { ready: true, fetchGuildChannel: async () => (channelAvailable ? channel : null) },
        { prMessage: { upsert: async () => {}, findUnique: async () => ({ channelId: 'channel', messageId: 'message' }) } },
        { get: () => '' },
        { record: async (...args) => records.push(args) },
    );
    bot.logger = { error: () => {} };
    return { bot, records };
}
const payload = {
    repository: { full_name: 'owner/repo', html_url: 'https://github.com/owner/repo' },
    pull_request: {
        number: 1,
        title: 'Example',
        html_url: 'https://github.com/owner/repo/pull/1',
        head: { sha: 'abc' },
    },
};

test('successful opened, reopened, ready, merged and closed deliveries record the correct kinds', async () => {
    const { bot, records } = botFixture();
    for (const action of ['opened', 'reopened', 'ready_for_review']) await bot.handle('guild', 'pull_request', { ...payload, action });
    await bot.handle('guild', 'pull_request', { ...payload, action: 'closed' });
    await bot.handle('guild', 'pull_request', { ...payload, action: 'closed', pull_request: { ...payload.pull_request, merged: true } });
    assert.deepEqual(
        records.map((row) => row[2]),
        ['sent', 'sent', 'sent', 'closed', 'merged'],
    );
    assert.ok(records.every(([guildId, messageId]) => guildId === 'guild' && messageId === 'message'));
});

test('failed sends, failed edits and ignored webhook actions do not add statistics', async () => {
    for (const [options, action] of [
        [{ failSend: true }, 'opened'],
        [{ failEdit: true }, 'closed'],
    ]) {
        const { bot, records } = botFixture(options);
        await assert.rejects(bot.handle('guild', 'pull_request', { ...payload, action }));
        assert.deepEqual(records, []);
    }
    const { bot, records } = botFixture({ channelAvailable: false });
    await bot.handle('guild', 'pull_request', { ...payload, action: 'opened' });
    await bot.handle('guild', 'pull_request', { ...payload, action: 'synchronize' });
    await bot.handle('guild', 'ping', payload);
    assert.deepEqual(records, []);
});
