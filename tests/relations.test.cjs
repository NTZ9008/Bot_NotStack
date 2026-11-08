const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../apps/backend/node_modules/typescript');
require.extensions['.ts'] = (module, filename) => {
    module._compile(
        ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
        filename,
    );
};
const { buildVoiceSessions, createLink, departureFromEvents, forEachVoiceOverlap, groupChatExchanges, resolveStatus } = require('../apps/backend/dist/relations/relations.util');
const { relationKind, relationScore, relationTier } = require('../packages/shared/dist/index.js');
const { CARD_HEIGHT, CARD_WIDTH, computeLayout, fitView, stringPath, zoomAt } = require('../apps/frontend/src/features/relations/layout.ts');

const MIN = 60_000;
const voice = (eventKey, userId, minute, channelId = 'v1') => ({ eventKey, userId, channelId, channelName: channelId, at: minute * MIN });
const overlapsOf = (sessions) => {
    const found = [];
    forEachVoiceOverlap(sessions, (overlap) => found.push(overlap));
    return found;
};

test('voice overlap counts only time two people shared the same room', () => {
    const sessions = buildVoiceSessions(
        [voice('voiceJoin', 'a', 0), voice('voiceJoin', 'b', 10), voice('voiceLeave', 'b', 40), voice('voiceSwitch', 'a', 30, 'v2'), voice('voiceLeave', 'a', 50, 'v2')],
        100 * MIN,
    );
    assert.deepEqual(
        overlapsOf(sessions).map(({ a, b, start, end }) => [[a, b].sort().join(), (end - start) / MIN, start / MIN]),
        [['a,b', 20, 10]],
    );
});

test('voice sessions ignore a leave with no join, close at range end and cap missing leaves', () => {
    const range = 2000 * MIN;
    const sessions = buildVoiceSessions([voice('voiceLeave', 'x', 5), voice('voiceJoin', 'a', 10), voice('voiceJoin', 'b', 1990)], range);
    assert.deepEqual(
        sessions.map((s) => [s.userId, (s.end - s.start) / MIN]),
        [
            ['a', 720],
            ['b', 10],
        ],
    );
});

test('a visit shorter than a minute is not a shared voice session', () => {
    const sessions = buildVoiceSessions([voice('voiceJoin', 'a', 0), voice('voiceJoin', 'b', 10), voice('voiceLeave', 'b', 10.5), voice('voiceLeave', 'a', 20)], 30 * MIN);
    assert.deepEqual(overlapsOf(sessions), []);
});

test('strength tiers and dominant kind follow the combined score', () => {
    assert.equal(relationScore({ voiceMinutes: 10, chatExchanges: 5, modActions: 2 }), 50);
    assert.deepEqual([29, 30, 119, 120, 479, 480].map(relationTier), [1, 2, 2, 3, 3, 4]);
    assert.equal(relationKind({ voiceMinutes: 10, chatExchanges: 50, modActions: 1 }), 'chat');
    assert.equal(relationKind({ voiceMinutes: 0, chatExchanges: 1, modActions: 1 }), 'mod');
    const link = createLink('9', '1', { voiceMinutes: 500, chatExchanges: 0, modActions: 0 });
    assert.deepEqual([link.id, link.a, link.b, link.tier, link.kind], ['1:9', '1', '9', 4, 'voice']);
});

test('departure keeps the harshest reason since the latest join and clears on rejoin or unban', () => {
    const at = (minute) => new Date(minute * MIN);
    assert.equal(departureFromEvents([{ eventKey: 'memberBan', at: at(1) }, { eventKey: 'memberLeave', at: at(2) }]).status, 'banned');
    assert.equal(departureFromEvents([{ eventKey: 'memberLeave', at: at(1) }, { eventKey: 'memberKick', at: at(2) }]).status, 'kicked');
    assert.equal(departureFromEvents([{ eventKey: 'memberLeave', at: at(1) }, { eventKey: 'memberJoin', at: at(2) }]), null);
    assert.equal(departureFromEvents([{ eventKey: 'memberBan', at: at(1) }, { eventKey: 'memberUnban', at: at(2) }]), null);
});

test('only a confirmed absence or a logged departure crosses someone out', () => {
    const left = [{ eventKey: 'memberLeave', at: new Date(MIN) }];
    assert.deepEqual(resolveStatus(true, left), { status: 'member', leftAt: null });
    assert.deepEqual(resolveStatus(false, []), { status: 'left', leftAt: null });
    assert.deepEqual(resolveStatus(null, []), { status: 'member', leftAt: null });
    assert.equal(resolveStatus(null, left).status, 'left');
});

test('chat timeline groups exchanges by Thai day and room', () => {
    const rows = [
        { at: new Date('2026-11-01T16:59:00Z'), channelId: 'c1', channelName: 'general' },
        { at: new Date('2026-11-01T17:01:00Z'), channelId: 'c1', channelName: 'general' }, // วันถัดไปตามเวลาไทย
        { at: new Date('2026-11-01T17:02:00Z'), channelId: 'c1', channelName: 'general' },
        { at: new Date('2026-11-01T17:03:00Z'), channelId: 'c2', channelName: 'dev' },
    ];
    assert.deepEqual(
        groupChatExchanges(rows).map((group) => [group.channelName, group.exchanges]),
        [
            ['general', 1],
            ['general', 2],
            ['dev', 1],
        ],
    );
});

test('board layout is deterministic and leaves every card visible', () => {
    const ids = Array.from({ length: 60 }, (_, i) => `user${i}`);
    const edges = ids.slice(1).map((id, i) => ({ a: ids[i % 7], b: id, tier: (i % 4) + 1 }));
    const first = computeLayout(ids, edges);
    assert.deepEqual([...first], [...computeLayout(ids, edges)]);
    const points = [...first.values()];
    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            assert.ok(Math.abs(points[i].x - points[j].x) >= CARD_WIDTH || Math.abs(points[i].y - points[j].y) >= CARD_HEIGHT, `cards ${i} and ${j} overlap`);
        }
    }
});

test('zoom keeps the point under the cursor and fit shows the whole board', () => {
    const view = { x: 40, y: -20, k: 1 };
    const next = zoomAt(view, 2, 300, 200);
    assert.equal((300 - next.x) / next.k, 300 - view.x);
    assert.equal((200 - next.y) / next.k, 200 - view.y);
    assert.equal(zoomAt(view, 99, 0, 0).k, 2.5);

    const fit = fitView([{ x: -1000, y: -1000 }, { x: 1000, y: 1000 }], 800, 600);
    assert.ok(fit.k < 1);
    assert.ok(fit.x + -1062 * fit.k >= 0 && fit.x + 1062 * fit.k <= 800);
    assert.match(stringPath({ x: 0, y: 0 }, { x: 100, y: 0 }), /^M0 0Q50 10 100 0$/);
});
