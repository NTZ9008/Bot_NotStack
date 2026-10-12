const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { PrismaService } = require('../apps/backend/dist/prisma/prisma.service');
const { PrBotStatsService } = require('../apps/backend/dist/pr-bot/pr-bot-stats.service');
const url = process.env.XP_TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/notstack_xp_test') throw Error('Use the disposable test cluster: pnpm test:integration');
const prisma = new PrismaService({ get: () => url });
const service = new PrBotStatsService(prisma);
before(() => prisma.$connect());
beforeEach(() => prisma.prNotification.deleteMany());
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
