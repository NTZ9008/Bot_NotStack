const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { PrismaService } = require('../apps/backend/dist/prisma/prisma.service');
const { JiraService } = require('../apps/backend/dist/jira/jira.service');
const { JiraClient } = require('../apps/backend/dist/jira/clients/jira.client');
const { normalizeJiraOptions } = require('../packages/shared/dist');
const url = process.env.XP_TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/notstack_xp_test') throw Error('Use the disposable test cluster: pnpm test:integration');
const prisma = new PrismaService({ get: () => url });
const config = { get: (key) => (key === 'JWT_SECRET' ? 's'.repeat(40) : undefined) };

// ห้องใน Discord ปลอม: id ที่อยู่ใน live คือห้องที่ยังมีอยู่
function fakeDiscord(live = new Set()) {
    const deleted = [];
    return {
        deleted,
        ready: null,
        guild: () => null,
        requireReady: () => ({}),
        fetchGuildChannel: async (_guildId, channelId) =>
            live.has(channelId)
                ? {
                      id: channelId,
                      guild: {},
                      delete: async () => {
                          deleted.push(channelId);
                          live.delete(channelId);
                      },
                  }
                : null,
    };
}

before(() => prisma.$connect());
beforeEach(() => Promise.all([prisma.jiraTicket.deleteMany(), prisma.jiraSetting.deleteMany()]));
after(() => prisma.$disconnect());

test('settings upsert per guild and partial saves keep other fields', async () => {
    const service = new JiraService(prisma, fakeDiscord(), new JiraClient(), config);
    assert.equal((await service.getSettings('a')).updatedAt, null);
    await service.updateSettings('a', { siteUrl: 'https://acme.atlassian.net', email: 'x@acme.io', apiToken: 'tok', projectKey: 'PROJ' });
    await service.updateSettings('a', {
        panelChannelId: '1234567890',
        options: normalizeJiraOptions({ issueTypes: [{ id: '10001', name: 'Bug', emoji: '🐞' }], staffRoleIds: ['5555555'] }),
    });
    const { settings } = await service.updateSettings('a', { enabled: true });
    assert.equal(settings.enabled, true);
    assert.equal(settings.projectKey, 'PROJ');
    assert.deepEqual(settings.options.issueTypes, [{ id: '10001', name: 'Bug', emoji: '🐞' }]);
    assert.equal(service.credentials(settings).apiToken, 'tok');
    const raw = await prisma.jiraSetting.findUnique({ where: { guildId: 'a' } });
    assert.notEqual(raw.apiToken, 'tok');
    assert.equal(await prisma.jiraSetting.count({ where: { guildId: 'b' } }), 0);
});

test('ticket listing filters by status, counts per guild and pages newest first', async () => {
    const service = new JiraService(prisma, fakeDiscord(), new JiraClient(), config);
    const now = new Date();
    await prisma.jiraTicket.createMany({
        data: [
            ...Array.from({ length: 22 }, (_, i) => ({
                guildId: 'a',
                userId: `u${i}`,
                userName: `user${i}`,
                channelId: `c${i}`,
                closedAt: now,
                issueKey: `P-${i}`,
            })),
            { guildId: 'a', userId: 'open', userName: 'open', channelId: 'co' },
            { guildId: 'a', userId: 'made', userName: 'made', channelId: 'cm', issueKey: 'P-99', issueUrl: 'https://acme.atlassian.net/browse/P-99' },
            { guildId: 'b', userId: 'other', userName: 'other', channelId: 'cb' },
        ],
    });
    const all = await service.listTickets('a', 1, 'all');
    assert.equal(all.total, 24);
    assert.equal(all.items.length, 20);
    assert.equal(all.items[0].userId, 'made');
    assert.equal(all.openCount, 2);
    assert.equal(all.createdCount, 23);
    assert.equal((await service.listTickets('a', 2, 'all')).items.length, 4);
    assert.deepEqual(
        (await service.listTickets('a', 1, 'open')).items.map((t) => [t.userId, t.status]),
        [['open', 'open']],
    );
    assert.deepEqual(
        (await service.listTickets('a', 1, 'created')).items.map((t) => [t.userId, t.status]),
        [['made', 'created']],
    );
    assert.equal((await service.listTickets('a', 1, 'closed')).total, 22);
    assert.equal((await service.listTickets('b', 1, 'all')).total, 1);
});

test('a user gets their live room back, rooms deleted outside the bot are closed', async () => {
    const discord = fakeDiscord(new Set(['live']));
    const service = new JiraService(prisma, discord, new JiraClient(), config);
    const gone = await prisma.jiraTicket.create({ data: { guildId: 'a', userId: 'u', userName: 'u', channelId: 'gone' } });
    const live = await prisma.jiraTicket.create({ data: { guildId: 'a', userId: 'u', userName: 'u', channelId: 'live' } });
    const found = await service.findOpenTicket('a', 'u');
    assert.equal(found.ticket.id, live.id);
    assert.ok((await prisma.jiraTicket.findUnique({ where: { id: gone.id } })).closedAt);
    assert.equal(await service.findOpenTicket('a', 'nobody'), null);

    await service.markChannelDeleted('live');
    assert.equal(await service.findOpenTicket('a', 'u'), null);
});

test('closing from the dashboard deletes the room once and keeps the card record', async () => {
    const discord = fakeDiscord(new Set(['room']));
    const service = new JiraService(prisma, discord, new JiraClient(), config);
    const ticket = await prisma.jiraTicket.create({ data: { guildId: 'a', userId: 'u', userName: 'u', channelId: 'room', issueKey: 'P-1' } });
    const closed = await service.closeTicket('a', ticket.id, 'test');
    assert.ok(closed.closedAt);
    assert.equal(closed.issueKey, 'P-1');
    assert.deepEqual(discord.deleted, ['room']);
    await service.closeTicket('a', ticket.id, 'again');
    assert.deepEqual(discord.deleted, ['room']);
    await assert.rejects(service.closeTicket('b', ticket.id, 'other guild'), /ไม่พบห้องนี้/);
});
