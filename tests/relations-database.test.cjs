const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { PrismaService } = require('../apps/backend/dist/prisma/prisma.service');
const { ActivityService } = require('../apps/backend/dist/log-manager/services/activity.service');
const { RelationsService } = require('../apps/backend/dist/relations/relations.service');
const url = process.env.XP_TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/notstack_xp_test') throw Error('Use the disposable test cluster: pnpm test:integration');
const prisma = new PrismaService({ get: () => `${url}${url.includes('?') ? '&' : '?'}options=${encodeURIComponent('-c TimeZone=UTC')}` });

const profile = (id, name, bot = false) => ({
    id,
    username: name,
    globalName: name,
    bot,
    displayAvatarURL: () => `https://cdn.discordapp.com/avatars/${id}/x.png`,
});
const member = (id, name, bot) => {
    const user = profile(id, name, bot);
    return { user, displayName: name, displayAvatarURL: user.displayAvatarURL };
};
const fetched = [];
const guild = {
    members: {
        cache: new Map([
            ['10001', member('10001', 'Boat')],
            ['10002', member('10002', 'Mint')],
            ['10009', member('10009', 'HelperBot', true)],
        ]),
        fetch: async ({ user }) => {
            fetched.push(user);
            return new Map();
        },
    },
};
const discord = {
    guild: (id) => (id === 'g1' ? guild : null),
    fetchUser: async (id) => (id === '10003' ? profile(id, 'Former') : null),
    client: { users: { cache: new Map() } },
};
const activity = new ActivityService(prisma, discord, { publish() {} }, { get: () => 90 });
const relations = new RelationsService(prisma, discord, activity);

const ago = (minutes) => new Date(Date.now() - minutes * 60_000);
const row = (eventKey, userId, minutesAgo, extra = {}) => ({ guildId: 'g1', eventKey, userId, userName: `name-${userId}`, createdAt: ago(minutesAgo), ...extra });
const chat = (userId, minutesAgo, channelId = '20001') => row('messageSent', userId, minutesAgo, { channelId, channelName: 'general' });
const vc = (eventKey, userId, minutesAgo) => row(eventKey, userId, minutesAgo, { channelId: '30001', channelName: 'Lobby' });

before(() => prisma.$connect());
beforeEach(async () => {
    fetched.length = 0;
    await prisma.activityEvent.deleteMany();
});
after(() => prisma.$disconnect());

test('board combines voice, chat and moderation and keeps people who left', async () => {
    await prisma.activityEvent.createMany({
        data: [
            vc('voiceJoin', '10001', 200),
            vc('voiceJoin', '10002', 190),
            vc('voiceLeave', '10002', 130),
            vc('voiceLeave', '10001', 120),
            chat('10001', 100),
            chat('10002', 99), // 1
            chat('10001', 98), // 2
            chat('10001', 97), // ส่งต่อตัวเอง ไม่นับ
            chat('10002', 80), // ห่างเกิน 3 นาที ไม่นับ
            chat('10003', 79, '20002'), // คนละห้อง ไม่นับเป็นคู่กับ 10002
            row('memberKick', '10003', 50, { executorId: '10001', executorName: 'Boat' }),
            row('memberLeave', '10003', 49),
            row('roleGiven', '10002', 40, { executorId: '10009', executorName: 'HelperBot' }),
            row('messageSent', '10001', 30, { guildId: 'other', channelId: '20001' }),
        ],
    });

    const board = await relations.board('g1', 30, false);
    assert.deepEqual(board.people.map((person) => person.userId).sort(), ['10001', '10002', '10003']);
    const former = board.people.find((person) => person.userId === '10003');
    assert.equal(former.status, 'kicked');
    assert.equal(former.name, 'Former');
    assert.ok(former.leftAt);
    assert.deepEqual(fetched, [['10003']]);

    const friends = board.links.find((link) => link.id === '10001:10002');
    assert.deepEqual([friends.voiceMinutes, friends.chatExchanges, friends.modActions, friends.kind, friends.tier], [60, 2, 0, 'voice', 2]);
    const kicked = board.links.find((link) => link.id === '10001:10003');
    assert.deepEqual([kicked.modActions, kicked.kind], [1, 'mod']);
    assert.ok(!board.links.some((link) => link.a === '10009' || link.b === '10009'), 'bot links stay hidden unless requested');

    const withBots = await relations.board('g1', 30, true);
    assert.ok(withBots.people.some((person) => person.userId === '10009' && person.isBot));
    assert.ok(withBots.links.some((link) => link.id === '10002:10009'));
});

test('someone with no membership event is still crossed out when Discord cannot find them', async () => {
    await prisma.activityEvent.createMany({ data: [chat('10003', 10)] });
    const board = await relations.board('g1', 30, false);
    assert.deepEqual([board.people[0].status, board.people[0].leftAt], ['left', null]);
});

test('a failed Discord lookup never crosses out a person without evidence', async () => {
    await prisma.activityEvent.createMany({ data: [chat('10003', 10)] });
    const original = guild.members.fetch;
    guild.members.fetch = async () => {
        throw new Error('gateway timeout');
    };
    try {
        assert.equal((await relations.board('g1', 30, false)).people[0].status, 'member');
    } finally {
        guild.members.fetch = original;
    }
});

test('link detail matches the board totals and explains the connection', async () => {
    await prisma.activityEvent.createMany({
        data: [
            vc('voiceJoin', '10001', 200),
            vc('voiceJoin', '10002', 190),
            vc('voiceLeave', '10002', 130),
            chat('10001', 100),
            chat('10002', 99),
            row('memberTimeout', '10002', 50, { executorId: '10001', executorName: 'Boat', summary: 'ถูก timeout' }),
        ],
    });
    const detail = await relations.linkDetail('g1', '10002', '10001', 30);
    assert.deepEqual([detail.a, detail.b, detail.voiceMinutes, detail.chatExchanges, detail.modActions], ['10001', '10002', 60, 1, 1]);
    assert.deepEqual(
        detail.timeline.map((item) => item.type),
        ['mod', 'chat', 'voice'],
    );
    assert.equal(detail.timeline[0].actorName, 'Boat');
    assert.equal(detail.timeline[2].minutes, 60);
});

test('person history includes what they did to others and pages by cursor', async () => {
    await prisma.activityEvent.createMany({
        data: [chat('10001', 30), row('memberKick', '10003', 20, { executorId: '10001', executorName: 'Boat' }), chat('10002', 10), ...Array.from({ length: 45 }, (_, i) => chat('10001', 5 - i / 100))],
    });
    const first = await relations.history('g1', '10001');
    assert.equal(first.items.length, 40);
    assert.ok(first.nextCursor);
    const second = await relations.history('g1', '10001', first.nextCursor);
    const items = [...first.items, ...second.items];
    assert.equal(items.length, 47);
    assert.ok(items.some((item) => item.eventKey === 'memberKick' && item.userId === '10003'));
    assert.ok(!items.some((item) => item.userId === '10002'));
});
