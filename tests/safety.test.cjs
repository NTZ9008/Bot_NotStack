const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SpamWindow } = require('../apps/backend/dist/chat/spam-window');
const { RoomAccessExpiryTask } = require('../apps/backend/dist/room-access/tasks/room-access-expiry.task');
const { DiscordService } = require('../apps/backend/dist/discord/discord.service');

test('sliding spam window allows messages every 4 seconds indefinitely', () => {
    const window = new SpamWindow(6, 5000);
    for (let i = 0; i < 100; i++) assert.equal(window.check('guild:user', i * 4000).blocked, false);
});
test('burst blocks seventh message, warns once, isolates users/guilds and recovers', () => {
    const window = new SpamWindow(6, 5000);
    for (let i = 0; i < 6; i++) assert.equal(window.check('g:u', i * 100).blocked, false);
    assert.deepEqual(window.check('g:u', 600), { blocked: true, warn: true });
    assert.deepEqual(window.check('g:u', 700), { blocked: true, warn: false });
    assert.equal(window.check('other:u', 700).blocked, false);
    assert.equal(window.check('g:other', 700).blocked, false);
    assert.equal(window.check('g:u', 5600).blocked, false);
});
function ticketFixture(fetchChannel) {
    const state = { deleted: false, messages: [], errors: [] };
    const record = { id: 1, guildId: 'g', roomId: 'r', userId: 'u', expireAt: new Date(0) };
    const task = new RoomAccessExpiryTask(
        {
            roomAccess: {
                findMany: async () => (state.deleted ? [] : [record]),
                deleteMany: async () => {
                    state.deleted = true;
                },
            },
        },
        { ready: true, fetchGuildChannelStrict: fetchChannel, fetchUser: async () => ({ send: async (message) => state.messages.push(message) }) },
    );
    task.logger = { error: (message) => state.errors.push(message) };
    return { task, state };
}
test('failed revocation retains ticket and retries successfully before notifying', async () => {
    let fail = true,
        attempts = 0;
    const { task, state } = ticketFixture(async () => ({
        name: 'room',
        permissionOverwrites: {
            delete: async () => {
                attempts++;
                if (fail) throw Error('Missing Permissions');
            },
        },
    }));
    await task.checkExpiry();
    assert.equal(state.deleted, false);
    assert.equal(state.messages.length, 0);
    assert.equal(state.errors.length, 1);
    fail = false;
    await task.checkExpiry();
    assert.equal(state.deleted, true);
    assert.equal(state.messages.length, 1);
    assert.equal(attempts, 2);
});
test('transient channel lookup failure retains ticket; confirmed deleted channel removes it', async () => {
    const failed = ticketFixture(async () => {
        throw Error('Discord unavailable');
    });
    await failed.task.checkExpiry();
    assert.equal(failed.state.deleted, false);
    const deleted = ticketFixture(async () => null);
    await deleted.task.checkExpiry();
    assert.equal(deleted.state.deleted, true);
});
test('strict channel fetch only treats Unknown Channel as deleted', async () => {
    const method = DiscordService.prototype.fetchGuildChannelStrict;
    const ctx = (fetch) => ({ client: { channels: { fetch } } });
    assert.equal(
        await method.call(
            ctx(async () => {
                throw { code: 10003 };
            }),
            'g',
            'r',
        ),
        null,
    );
    await assert.rejects(
        method.call(
            ctx(async () => {
                throw Error('403');
            }),
            'g',
            'r',
        ),
    );
    await assert.rejects(
        method.call(
            ctx(async () => ({ guildId: 'other' })),
            'g',
            'r',
        ),
    );
});
