const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PcmMixer } = require('../apps/backend/dist/voice-listen/pcm-mixer');
const { VoiceListenService } = require('../apps/backend/dist/voice-listen/voice-listen.service');

const FRAME = 960; // 480 samples × 2 ไบต์

const frameOf = (value, count = 1) => {
    const buf = Buffer.alloc(FRAME * count);
    for (let i = 0; i < buf.length; i += 2) buf.writeInt16LE(value, i);
    return buf;
};

test('mixer waits for 60ms of audio before playing a speaker', () => {
    const mixer = new PcmMixer();
    mixer.push('a', frameOf(100, 2));
    assert.equal(mixer.next(), null);
    mixer.push('a', frameOf(100));
    const frame = mixer.next();
    assert.equal(frame.length, FRAME);
    assert.equal(frame.readInt16LE(0), 100);
    // เริ่มเล่นแล้ว เฟรมที่เหลือออกทีละเฟรมโดยไม่ต้องรอสะสม
    assert.equal(mixer.next().readInt16LE(FRAME - 2), 100);
    assert.equal(mixer.next().readInt16LE(0), 100);
    assert.equal(mixer.next(), null);
});

test('mixer sums speakers and clamps to 16-bit', () => {
    const mixer = new PcmMixer();
    mixer.push('a', frameOf(30000, 3));
    mixer.push('b', frameOf(10000, 3));
    mixer.push('c', frameOf(-500, 3));
    assert.equal(mixer.next().readInt16LE(0), 32767);
    mixer.remove('a');
    assert.equal(mixer.next().readInt16LE(0), 9500);
});

test('mixer drops old audio beyond half a second', () => {
    const mixer = new PcmMixer();
    mixer.push('a', frameOf(1, 25));
    mixer.push('a', frameOf(2, 5));
    let frames = 0;
    let first;
    for (let frame; (frame = mixer.next()); frames++) first ??= frame.readInt16LE(0);
    assert.equal(frames, 25);
    assert.equal(first, 1);
});

test('service clock sends mixed frames and a keepalive to listeners', () => {
    const service = new VoiceListenService({});
    const mixer = new PcmMixer();
    const got = [];
    let closed = false;
    const session = {
        guildId: '1',
        connection: { state: { status: 'ready' } },
        mixer,
        streams: new Map(),
        sinks: new Set(),
        lastSentAt: Date.now(),
        emptySince: null,
    };
    service.sessions.set('1', session);
    service.subscribe('1', { write: (f) => got.push(f), close: () => (closed = true) });
    mixer.push('a', frameOf(7, 3));

    service.nextAt = 0;
    service.tick(60); // ส่งได้สูงสุด 5 เฟรมต่อรอบ แต่มีเสียงแค่ 3
    assert.equal(got.length, 3);
    assert.equal(got[0].readInt16LE(0), 7);

    session.lastSentAt = Date.now() - 20_000;
    service.tick(service.nextAt);
    assert.equal(got.length, 4);
    assert.equal(got[3].readInt16LE(0), 0);

    service.detach(session);
    assert.equal(closed, true);
    assert.throws(() => service.subscribe('1', { write() {}, close() {} }));
});
