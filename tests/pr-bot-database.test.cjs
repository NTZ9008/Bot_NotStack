const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { PrismaService } = require('../apps/backend/dist/prisma/prisma.service');
const { PrBotStatsService } = require('../apps/backend/dist/pr-bot/pr-bot-stats.service');
const { PrBotService } = require('../apps/backend/dist/pr-bot/pr-bot.service');
const url = process.env.XP_TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/notstack_xp_test') throw Error('Use the disposable test cluster: pnpm test:integration');
const prisma = new PrismaService({ get: () => url });
const service = new PrBotStatsService(prisma);
before(() => prisma.$connect());
beforeEach(() => Promise.all([prisma.prNotification.deleteMany(), prisma.prMessage.deleteMany()]));
after(() => prisma.$disconnect());

test('PR SQL groups at Thai midnight and excludes other guilds, old and future events', async () => {
    const events = [
        { guildId: 'a', messageId: '1', kind: 'sent', createdAt: new Date('2026-10-05T17:00:00Z') },
        { guildId: 'a', messageId: '2', kind: 'sent', createdAt: new Date('2026-10-11T16:59:59Z') },
        { guildId: 'a', messageId: '2', kind: 'merged', createdAt: new Date('2026-10-11T17:00:00Z') },
        { guildId: 'a', messageId: '3', kind: 'closed', createdAt: new Date('2026-10-12T05:00:00Z') },
        { guildId: 'a', messageId: 'old', kind: 'sent', createdAt: new Date('2026-10-05T16:59:59Z') },
        { guildId: 'a', messageId: 'future', kind: 'sent', createdAt: new Date('2026-10-12T05:00:01Z') },
        { guildId: 'b', messageId: '1', kind: 'sent', createdAt: new Date('2026-10-11T17:00:00Z') },
    ];
    // Explicit UTC offsets also exercise non-UTC database session time zones.
    for (const row of events) {
        await prisma.$executeRaw`
            INSERT INTO pr_notifications (guild_id, message_id, kind, created_at)
            VALUES (${row.guildId}, ${row.messageId}, ${row.kind}, ${row.createdAt.toISOString()}::timestamptz)
        `;
    }
    const result = await service.read('a', 7, new Date('2026-10-12T05:00:00Z'));
    assert.deepEqual(result.totals, { sent: 2, merged: 1, closed: 1 });
    assert.deepEqual(result.daily.at(-1), { label: '2026-10-12', sent: 0, merged: 1, closed: 1 });
    assert.deepEqual(result.hourly[0], { label: '00:00', sent: 1, merged: 1, closed: 0 });
    assert.equal(result.hourly[23].sent, 1);
    assert.deepEqual((await service.read('unknown', 7)).totals, { sent: 0, merged: 0, closed: 0 });
});

test('concurrent duplicate recordings count once and retain the original timestamp', async () => {
    await Promise.all(Array.from({ length: 8 }, () => service.record('a', 'message', 'closed')));
    const original = await prisma.prNotification.findFirstOrThrow();
    await service.record('a', 'message', 'closed');
    assert.equal(await prisma.prNotification.count(), 1);
    assert.equal((await prisma.prNotification.findFirstOrThrow()).createdAt.getTime(), original.createdAt.getTime());
    await service.record('b', 'message', 'closed');
    assert.equal(await prisma.prNotification.count(), 2);
});

test('concurrent PR webhooks lock the row so no check or review result is lost', async () => {
    const edits = [];
    const message = { id: 'message', edit: async (payload) => edits.push(payload) };
    const channel = { id: 'channel', isSendable: () => true, messages: { fetch: async () => message }, send: async () => message };
    const bot = new PrBotService(
        { getChannelIdForOrg: async () => 'channel', getMentionForRepo: async () => '' },
        { ready: true, fetchGuildChannel: async () => channel },
        prisma,
        { get: () => '' },
        service,
    );
    const repository = { full_name: 'owner/repo', html_url: 'https://github.com/owner/repo' };
    const pr = { number: 7, title: 'T', html_url: 'https://github.com/owner/repo/pull/7', state: 'open', head: { ref: 'b', sha: 'abc' } };
    // แถวเก่าก่อน migration นี้ (activity = {} ค่า default)
    await prisma.$executeRaw`INSERT INTO pr_messages (guild_id, repo_full_name, pr_number, channel_id, message_id) VALUES ('a', 'owner/repo', 7, 'channel', 'message')`;
    await bot.handle('a', 'pull_request', { action: 'synchronize', repository, pull_request: pr });
    await Promise.all([
        ...Array.from({ length: 20 }, (_, i) =>
            bot.handle('a', 'check_run', {
                action: 'completed',
                repository,
                check_run: {
                    name: `job-${i}`,
                    head_sha: 'abc',
                    status: 'completed',
                    conclusion: 'success',
                    started_at: '2026-10-16T01:00:00Z',
                    completed_at: '2026-10-16T01:01:00Z',
                },
            }),
        ),
        ...['alice', 'bob', 'carol'].map((login, i) =>
            bot.handle('a', 'pull_request_review', {
                action: 'submitted',
                repository,
                pull_request: pr,
                review: { id: i, user: { login }, state: 'approved', submitted_at: '2026-10-16T01:00:00Z' },
            }),
        ),
        bot.handle('a', 'status', { repository, sha: 'abc', context: 'deploy', state: 'failure', updated_at: '2026-10-16T01:00:00Z' }),
    ]);
    const row = await prisma.prMessage.findUniqueOrThrow({
        where: { guildId_repoFullName_prNumber: { guildId: 'a', repoFullName: 'owner/repo', prNumber: 7 } },
    });
    assert.equal(row.headSha, 'abc');
    assert.equal(Object.keys(row.activity.checks).length, 21);
    assert.deepEqual(Object.keys(row.activity.reviews).sort(), ['alice', 'bob', 'carol']);
    const fields = edits.at(-1).embeds[0].fields;
    assert.equal(fields.find((f) => f.name.includes('Checks')).name, '🧪 Checks · 20/21 passed');
    assert.ok(edits.length < 25, `edits should be coalesced, got ${edits.length}`);
    assert.deepEqual(await prisma.prMessage.findMany({ where: { guildId: 'a', repoFullName: 'owner/repo', headSha: 'abc' }, select: { prNumber: true } }), [
        { prNumber: 7 },
    ]);
});
