const { test } = require('node:test');
const assert = require('node:assert/strict');
const { defaultLeaveDesign, normalizeDesign, welcomeCardInputSchema, welcomeCreateSchema } = require('../packages/shared/dist');
const { MemberAnnounceListener } = require('../apps/backend/dist/welcome/listeners/member-announce.listener');
const { WelcomeService } = require('../apps/backend/dist/welcome/welcome.service');
const { WelcomeStore } = require('../apps/backend/dist/welcome/welcome.store');
const { WelcomeController } = require('../apps/backend/dist/welcome/welcome.controller');

const member = { user: { bot: false, tag: 'a#1' }, guild: { id: 'g1', name: 'G' } };
const card = { name: 'การ์ดอำลา', channelId: 'c1' };

// WelcomeService ที่ store / ห้อง / payload เป็นของปลอม — เก็บ event ที่ขอไว้ใน calls และข้อความที่ส่งไว้ใน sent
function fakeService({ cards = [card], error, throwOnSend } = {}) {
    const calls = [];
    const sent = [];
    const store = {
        listEnabledCards: async (guildId, event) => {
            calls.push([guildId, event]);
            return cards;
        },
    };
    const service = new WelcomeService(store, null, null);
    service.resolveTargetChannel = async () =>
        error
            ? { error }
            : {
                  channel: {
                      send: async (payload) => {
                          if (throwOnSend) throw new Error('boom');
                          sent.push(payload);
                      },
                  },
              };
    service.buildPayload = async () => ({ content: 'x' });
    return { service, calls, sent };
}

test('welcomeCreateSchema accepts join/leave only and leaves event undefined by default', () => {
    assert.equal(welcomeCreateSchema.safeParse({ event: 'join' }).success, true);
    assert.equal(welcomeCreateSchema.safeParse({ event: 'leave' }).success, true);
    assert.equal(welcomeCreateSchema.safeParse({ event: 'bye' }).success, false);
    assert.equal(welcomeCreateSchema.parse({}).event, undefined);
});

test('welcomeCardInputSchema strips event so updates cannot change it', () => {
    assert.equal('event' in welcomeCardInputSchema.parse({ event: 'leave' }), false);
});

test('defaultLeaveDesign is already normalized and starts with GOODBYE', () => {
    const design = defaultLeaveDesign();
    assert.deepEqual(normalizeDesign(design), design);
    assert.equal(design.texts[0].text, 'GOODBYE');
    assert.equal(design.background.color, '#374151');
});

test('announce posts every enabled card of that event for humans', async () => {
    const { service, calls, sent } = fakeService();
    await service.announce(member, 'leave');
    assert.deepEqual(calls, [['g1', 'leave']]);
    assert.deepEqual(sent, [{ content: 'x' }]);
});

test('announce ignores bots', async () => {
    const { service, calls } = fakeService();
    await service.announce({ ...member, user: { bot: true, tag: 'b#1' } }, 'join');
    assert.equal(calls.length, 0);
});

test('announce skips cards whose channel cannot be resolved', async () => {
    const { service, sent } = fakeService({ error: 'x' });
    await assert.doesNotReject(service.announce(member, 'leave'));
    assert.equal(sent.length, 0);
});

test('announce keeps going when one card fails to send', async () => {
    const { service } = fakeService({ cards: [card, card], throwOnSend: true });
    await assert.doesNotReject(service.announce(member, 'leave'));
});

test('MemberAnnounceListener maps join/leave to the right event', async () => {
    const events = [];
    const listener = new MemberAnnounceListener({ announce: async (_member, event) => void events.push(event) });
    await listener.onMemberJoin(member);
    await listener.onMemberLeave(member);
    assert.deepEqual(events, ['join', 'leave']);
});

test('WelcomeStore filters enabled cards by event and maps unknown events to join', async () => {
    const now = new Date();
    const row = (id, event) => ({
        id,
        name: 'n',
        enabled: true,
        event,
        channelId: 'c',
        content: '',
        design: {},
        backgroundId: null,
        createdAt: now,
        updatedAt: now,
    });
    let where;
    const prisma = {
        welcomeCard: {
            findMany: async (query) => {
                where = query.where;
                return [row(1, 'leave'), row(2, 'weird')];
            },
        },
    };
    const cards = await new WelcomeStore(prisma).listEnabledCards('g1', 'leave');
    assert.equal(where.event, 'leave');
    assert.equal(where.guildId, 'g1');
    assert.deepEqual(
        cards.map((c) => c.event),
        ['leave', 'join'],
    );
});

// controller ที่ store เป็นของปลอม — createCard คืนข้อมูลที่ถูกส่งไปบันทึก
function fakeController(source = null) {
    const store = {
        getCard: async () => source,
        getAssetInfo: async () => null,
        createCard: async (_guildId, data) => ({ id: 7, ...data }),
    };
    return new WelcomeController(store, null, null, null);
}

test('createCard gives leave cards the goodbye defaults', async () => {
    const audit = {};
    const { card: created } = await fakeController().createCard('g1', { event: 'leave' }, audit);
    assert.equal(created.event, 'leave');
    assert.equal(created.enabled, false);
    assert.equal(created.name, 'การ์ดอำลาใหม่');
    assert.match(created.content, /ออกจาก/);
    assert.equal(created.design.texts[0].text, 'GOODBYE');
    assert.deepEqual(audit, { targetId: 7, extra: { event: 'leave' } });
});

test('createCard defaults to join and copies keep the source event', async () => {
    const { card: join } = await fakeController().createCard('g1', {}, {});
    assert.equal(join.event, 'join');
    assert.equal(join.design.texts[0].text, 'WELCOME');

    const source = { id: 3, name: 'บาย', event: 'leave', channelId: 'c9', content: 'bye', design: defaultLeaveDesign(), backgroundId: null };
    const { card: copy } = await fakeController(source).createCard('g1', { duplicateOf: 3, event: 'join' }, {});
    assert.equal(copy.event, 'leave');
    assert.equal(copy.name, 'บาย (สำเนา)');
    assert.equal(copy.channelId, 'c9');
});
