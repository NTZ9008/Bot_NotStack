const { test } = require('node:test');
const assert = require('node:assert/strict');
const { defaultLeaveDesign, normalizeDesign, welcomeCardInputSchema, welcomeCreateSchema } = require('../packages/shared/dist');
const { MemberJoinListener } = require('../apps/backend/dist/welcome/listeners/member-join.listener');
const { MemberLeaveListener } = require('../apps/backend/dist/welcome/listeners/member-leave.listener');

const member = { user: { bot: false, tag: 'a#1' }, guild: { id: 'g1', name: 'G' } };

// welcome ปลอม — เก็บข้อความที่ส่งลง sent, จำลองกรณีหาห้องไม่ได้ (error) และส่งไม่สำเร็จ (throwOnSend)
function fakeWelcome(sent, { error, throwOnSend } = {}) {
    return {
        resolveTargetChannel: async () =>
            error
                ? { error }
                : {
                      channel: {
                          send: async (payload) => {
                              if (throwOnSend) throw new Error('boom');
                              sent.push(payload);
                          },
                      },
                  },
        buildPayload: async () => ({ content: 'x' }),
    };
}

test('welcomeCreateSchema accepts join/leave only and leaves event undefined by default', () => {
    assert.equal(welcomeCreateSchema.safeParse({ event: 'join' }).success, true);
    assert.equal(welcomeCreateSchema.safeParse({ event: 'leave' }).success, true);
    assert.equal(welcomeCreateSchema.safeParse({ event: 'bye' }).success, false);
    assert.equal(welcomeCreateSchema.parse({}).event, undefined);
});

test('welcomeCardInputSchema strips event so updates cannot change it', () => {
    const parsed = welcomeCardInputSchema.parse({ event: 'leave' });
    assert.equal('event' in parsed, false);
});

test('defaultLeaveDesign is already normalized and starts with GOODBYE', () => {
    const design = defaultLeaveDesign();
    assert.deepEqual(normalizeDesign(design), design);
    assert.equal(design.texts[0].text, 'GOODBYE');
    assert.equal(design.background.color, '#374151');
});

test('MemberLeaveListener posts enabled leave cards for humans', async () => {
    const calls = [];
    const sent = [];
    const card = { name: 'การ์ดอำลา', channelId: 'c1' };
    const store = {
        listEnabledCards: async (guildId, event) => {
            calls.push([guildId, event]);
            return [card];
        },
    };

    await new MemberLeaveListener(store, fakeWelcome(sent)).onMemberLeave(member);

    assert.deepEqual(calls, [['g1', 'leave']]);
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0], { content: 'x' });
});

test('MemberLeaveListener ignores bots', async () => {
    const calls = [];
    const store = {
        listEnabledCards: async (_guildId, event) => {
            calls.push(event);
            return [];
        },
    };

    await new MemberLeaveListener(store, fakeWelcome([])).onMemberLeave({ ...member, user: { bot: true, tag: 'b#1' } });

    assert.equal(calls.length, 0);
});

test('MemberLeaveListener skips cards whose channel cannot be resolved', async () => {
    const sent = [];
    const store = { listEnabledCards: async () => [{ name: 'การ์ดอำลา', channelId: 'c1' }] };

    await assert.doesNotReject(new MemberLeaveListener(store, fakeWelcome(sent, { error: 'x' })).onMemberLeave(member));

    assert.equal(sent.length, 0);
});

test('MemberLeaveListener logs and continues when sending fails', async () => {
    const store = { listEnabledCards: async () => [{ name: 'การ์ดอำลา', channelId: 'c1' }] };

    await assert.doesNotReject(new MemberLeaveListener(store, fakeWelcome([], { throwOnSend: true })).onMemberLeave(member));
});

test('MemberJoinListener asks for join cards', async () => {
    const calls = [];
    const store = {
        listEnabledCards: async (_guildId, event) => {
            calls.push(event);
            return [];
        },
    };

    await new MemberJoinListener(store, fakeWelcome([])).onMemberJoin(member);

    assert.deepEqual(calls, ['join']);
});
