const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { PrismaService } = require('../apps/backend/dist/prisma/prisma.service');
const { ActivityStatsService } = require('../apps/backend/dist/log-manager/services/activity-stats.service');
const url = process.env.XP_TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/notstack_xp_test') throw Error('Use the disposable test cluster: pnpm test:integration');
// Prisma pg adapter ส่ง/อ่าน Date เป็นเวลาไม่มีโซน (ตีความตาม TimeZone ของ session) — ทดสอบบน session UTC แบบเซิร์ฟเวอร์ทั่วไป
const utcUrl = `${url}${url.includes('?') ? '&' : '?'}options=${encodeURIComponent('-c TimeZone=UTC')}`;
const prisma = new PrismaService({ get: () => utcUrl });
const stats = new ActivityStatsService(prisma);
before(() => prisma.$connect());
beforeEach(() => prisma.activityEvent.deleteMany());
after(() => prisma.$disconnect());

test('Overview stats group events by Thai day and pair voice sessions', async () => {
    const row = (eventKey, createdAt, extra = {}) => ({ guildId: 'g1', eventKey, createdAt: new Date(createdAt), userId: 'u1', userName: 'Boat', ...extra });
    await prisma.activityEvent.createMany({
        data: [
            row('memberJoin', '2026-10-19T18:00:00Z'), // 01:00 วันที่ 20 เวลาไทย
            row('messageSent', '2026-10-20T03:00:00Z'),
            row('voiceJoin', '2026-10-20T04:00:00Z', { channelId: 'v1', channelName: 'Lobby' }),
            row('voiceLeave', '2026-10-20T04:30:00Z', { channelId: 'v1', channelName: 'Lobby' }),
            row('memberBan', '2026-10-20T18:00:00Z', { userId: 'u2', userName: 'Spam' }), // วันที่ 21
            row('messageSent', '2026-10-20T05:00:00Z', { userId: 'bot', isBot: true }),
            row('memberJoin', '2026-10-20T05:00:00Z', { guildId: 'other' }),
        ],
    });

    const result = await stats.stats({
        guildId: 'g1',
        from: new Date('2026-10-19T17:00:00Z'),
        to: new Date('2026-10-21T16:59:59Z'),
        interval: 'day',
        includeBots: false,
        timeZone: 'Asia/Bangkok',
        limit: 10,
    });
    assert.deepEqual(result.labels, ['2026-10-20 00:00', '2026-10-21 00:00']);
    assert.deepEqual(result.datasets, { serverJoin: [1, 0], serverLeave: [0, 1], voiceJoin: [1, 0], voiceLeave: [1, 0], total: [4, 1] });
    assert.deepEqual(result.summary, {
        totalEvents: 5,
        serverJoin: 1,
        serverLeave: 1,
        voiceJoin: 1,
        voiceLeave: 1,
        messages: 1,
        activeUsers: 2,
        voiceMinutes: 30,
    });
    assert.deepEqual(result.topVoiceUsers, [{ userId: 'u1', userName: 'Boat', minutes: 30, sessions: 1 }]);
    assert.deepEqual(result.voiceChannelMinutes, [{ channelId: 'v1', channelName: 'Lobby', minutes: 30 }]);
    assert.deepEqual(result.topVoiceChannels, [{ channelId: 'v1', channelName: 'Lobby', joins: 1, members: 1 }]);
    assert.equal(result.topUsers[0].userId, 'u1');
    assert.equal(result.breakdown.find((b) => b.eventKey === 'memberJoin').label.length > 0, true);

    const withBots = await stats.stats({
        ...result.range,
        guildId: 'g1',
        from: new Date(result.range.from),
        to: new Date(result.range.to),
        includeBots: true,
        limit: 10,
    });
    assert.equal(withBots.summary.messages, 2);
});
