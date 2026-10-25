const { test } = require('node:test');
const assert = require('node:assert/strict');
const { LiveService } = require('../apps/backend/dist/live/live.service');
const { scatterPoint, localePoint, DEFAULT_HUB } = require('../apps/backend/dist/live/live-geo.util');
const { liveKindOf } = require('../packages/shared/dist/live');

const GUILD_A = '111111111111111111';
const GUILD_B = '222222222222222222';

// บอทปลอม: เซิร์ฟเวอร์ A ภาษาไทย, B ภาษาญี่ปุ่น — A ตั้งสถานที่รายงานอากาศไว้
function fixture() {
    const guilds = new Map([
        [GUILD_A, { id: GUILD_A, name: 'Secret Club', preferredLocale: 'th', iconURL: () => null }],
        [GUILD_B, { id: GUILD_B, name: 'Tokyo Devs', preferredLocale: 'ja', iconURL: () => null }],
    ]);
    const discord = { ready: { guilds: { cache: guilds } }, guild: (id) => guilds.get(id) ?? null };
    const prisma = { weatherSetting: { findMany: async () => [{ guildId: GUILD_A, options: { location: { name: 'ศาลายา', lat: 13.8015, lon: 100.3242 } } }] } };
    const live = new LiveService(prisma, discord);
    return { live };
}

function sink() {
    const messages = [];
    return { messages, send: (event, data) => messages.push({ event, data }), ping: () => messages.push({ event: 'ping' }) };
}

const message = (guildId, userId = '333333333333333333') => ({
    guildId,
    eventKey: 'messageSent',
    userId,
    userName: 'boat',
    channelName: 'general',
    summary: 'boat ส่งข้อความใน #general',
});

test("stream only sees the subscriber's guilds, with details", async () => {
    const { live } = fixture();
    await live.refreshHubs();
    const mine = sink();
    live.subscribe(new Set([GUILD_B]), mine);
    live.publish(message(GUILD_A));
    live.publish({ ...message(GUILD_B), userName: 'tanaka', eventKey: 'voiceJoin' });
    live.tick(Date.now() + 10_000);
    live.onApplicationShutdown();

    const [hello, batch] = mine.messages;
    assert.deepEqual(
        hello.data.hubs.map((h) => h.name),
        ['Tokyo Devs'],
    );
    assert.equal(batch.data.events.length, 1);
    const [event] = batch.data.events;
    assert.equal(event.guildId, GUILD_B);
    assert.equal(event.guildName, 'Tokyo Devs');
    assert.equal(event.userName, 'tanaka');
    assert.equal(event.kind, 'voice');
    // ไม่ได้ตั้งสถานที่ → ใช้ภาษาหลักของเซิร์ฟเวอร์ (โตเกียว)
    assert.ok(Math.abs(hello.data.hubs[0].lat - 35.68) < 0.01);
    assert.equal(batch.data.stats.total, 1);
    assert.equal(batch.data.stats.perMinute.voice, 1);
});

test('bot events are ignored and floods are capped per tick but still counted', () => {
    const { live } = fixture();
    const out = sink();
    live.subscribe(null, out);
    live.publish({ ...message(GUILD_A), isBot: true });
    for (let i = 0; i < 100; i++) live.publish(message(GUILD_A, String(400000000000000000n + BigInt(i))));
    live.tick(Date.now() + 10_000);
    live.onApplicationShutdown();
    const batch = out.messages[1].data;
    assert.equal(batch.events.length, 40);
    assert.equal(batch.dropped, 60);
    assert.equal(batch.stats.perMinute.message, 100);
});

test('late subscribers get recent events in hello; unsubscribing stops delivery', () => {
    const { live } = fixture();
    live.publish(message(GUILD_A));
    const out = sink();
    const unsubscribe = live.subscribe(null, out);
    assert.equal(out.messages[0].data.recent.length, 1);
    unsubscribe();
    assert.equal(live.subscriberCount, 0);
    live.publish(message(GUILD_A));
    live.tick(Date.now() + 10_000);
    assert.equal(out.messages.length, 1);
});

test('stats only count the last 60 seconds', () => {
    const { live } = fixture();
    live.publish(message(GUILD_A));
    assert.equal(live.stats(null).total, 1);
    assert.equal(live.stats(null, Date.now() + 61_000).total, 0);
    assert.equal(live.stats(new Set([GUILD_B])).total, 0);
});

test('geo helpers: locale fallback and stable scatter around the hub', () => {
    assert.deepEqual(localePoint('th'), DEFAULT_HUB);
    assert.ok(localePoint('es-419'));
    assert.equal(localePoint('xx'), null);
    const a = scatterPoint(DEFAULT_HUB, 'seed');
    assert.deepEqual(a, scatterPoint(DEFAULT_HUB, 'seed'));
    assert.notDeepEqual(a, scatterPoint(DEFAULT_HUB, 'other'));
    const distance = Math.hypot(a.lat - DEFAULT_HUB.lat, (a.lon - DEFAULT_HUB.lon) * Math.cos((DEFAULT_HUB.lat * Math.PI) / 180));
    assert.ok(distance > 0.5 && distance < 4.6, `distance ${distance}`);
    // ใกล้เส้นแบ่งวันยังอยู่ในช่วง -180..180
    const edge = scatterPoint({ lat: 0, lon: 179.9 }, 'x');
    assert.ok(edge.lon >= -180 && edge.lon <= 180);
});

test('event keys map to globe colours', () => {
    assert.equal(liveKindOf('messageSent'), 'message');
    assert.equal(liveKindOf('messageDelete'), 'message');
    assert.equal(liveKindOf('commandUsed'), 'command');
    assert.equal(liveKindOf('voiceSwitch'), 'voice');
    assert.equal(liveKindOf('memberBan'), 'moderation');
    assert.equal(liveKindOf('autoModAction'), 'moderation');
    assert.equal(liveKindOf('memberJoin'), 'member');
    assert.equal(liveKindOf('prMerged'), 'pr');
    assert.equal(liveKindOf('channelCreate'), 'other');
});
