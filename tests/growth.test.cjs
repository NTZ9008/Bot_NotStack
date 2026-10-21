const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildGrowth } = require('../apps/backend/dist/growth/growth.service');

const NOW = Date.parse('2026-03-25T12:00:00Z'); // วันพุธ

test('growth is cumulative per Bangkok week and keeps empty weeks', () => {
    const stats = buildGrowth(
        [
            { date: '2026-03-01T10:00:00Z', author: 'A' }, // อาทิตย์ → สัปดาห์ 23 ก.พ.
            { date: '2026-03-01T18:00:00Z', author: 'a' }, // จันทร์ 01:00 เวลาไทย → สัปดาห์ 2 มี.ค.
            { date: '2026-03-20T00:00:00Z', author: 'B' },
        ],
        [
            { createdAt: '2026-03-03T00:00:00Z', mergedAt: '2026-03-04T00:00:00Z' },
            { createdAt: '2026-03-21T00:00:00Z', mergedAt: null },
        ],
        NOW,
    );
    assert.deepEqual(
        stats.points.map((p) => [p.week, p.commits, p.prs, p.merged, p.contributors]),
        [
            ['2026-02-23', 1, 0, 0, 1],
            ['2026-03-02', 2, 1, 1, 1],
            ['2026-03-09', 2, 1, 1, 1],
            ['2026-03-16', 3, 2, 1, 2],
            ['2026-03-23', 3, 2, 1, 2],
        ],
    );
    assert.deepEqual(stats.totals, { commits: 3, prs: 2, merged: 1, contributors: 2 });
    assert.deepEqual(stats.recent, { commits: 3, prs: 2 });
});

test('growth ignores future or invalid dates and handles empty history', () => {
    assert.deepEqual(buildGrowth([], [], NOW).points, []);
    const stats = buildGrowth(
        [
            { date: 'not a date', author: 'x' },
            { date: '2027-01-01T00:00:00Z', author: 'y' },
        ],
        [],
        NOW,
    );
    assert.equal(stats.totals.commits, 0);
});
