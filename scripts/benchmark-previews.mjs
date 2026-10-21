// Build backend/shared first. Synthetic fixtures only: no DB, Discord, credentials or network.
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
require('../apps/backend/node_modules/reflect-metadata');
const shared = require('../packages/shared/dist');
const { RankCardRenderer } = require('../apps/backend/dist/rank/rank-card.renderer');
const { WelcomeRenderer } = require('../apps/backend/dist/welcome/welcome.renderer');
const { ResultCache } = require('../apps/backend/dist/common/utils/result-cache');
const rank = new RankCardRenderer();
const welcome = new WelcomeRenderer({});
const style = shared.defaultRankStyle();
const data = {
    displayName: 'สมาชิกทดสอบ',
    username: 'demo',
    avatar: null,
    rank: 1,
    level: 12,
    xp: 15500,
    levelStartXp: 14400,
    nextLevelXp: 16900,
    serverName: 'Demo server',
};
const rows = Array.from({ length: 10 }, (_, i) => ({ ...data, displayName: `สมาชิก ${i + 1}`, rank: i + 1 }));
const fixtures = {
    rank: (compact) => rank.renderRank(style, data, {}, compact),
    leaderboard: (compact) => rank.renderLeaderboard(style, { serverName: 'เซิร์ฟเวอร์ทดสอบ', serverIcon: null, page: 1, totalPages: 1, rows }, {}, compact),
    levelup: (compact) => rank.renderLevelUp(style, { ...data, previousLevel: 11, rewardNames: ['สมาชิกประจำ'] }, {}, compact),
    welcome: (compact) =>
        welcome.render(
            { design: shared.defaultDesign(), vars: { user: 'สมาชิกทดสอบ', username: 'demo', id: '1', server: 'Demo server', memberCount: '100' } },
            compact,
        ),
};
const report = [];
for (const [kind, render] of Object.entries(fixtures)) {
    const row = { kind };
    for (const compact of [false, true]) {
        await render(compact); // Warm fonts/native code, then median of five renders.
        const times = [];
        let image;
        for (let i = 0; i < 5; i++) {
            const start = performance.now();
            image = await render(compact);
            times.push(performance.now() - start);
        }
        const wireBytes = compact ? image.length : gzipSync(JSON.stringify({ image: `data:image/png;base64,${image.toString('base64')}` })).length;
        row[compact ? 'webp' : 'pngJson'] = { bytes: wireBytes, renderMedianMs: +times.sort((a, b) => a - b)[2].toFixed(2) };
        if (process.argv[2]) {
            mkdirSync(process.argv[2], { recursive: true });
            writeFileSync(`${process.argv[2]}/${kind}.${compact ? 'webp' : 'png'}`, image);
        }
    }
    const cache = new ResultCache(15_000);
    await cache.get(kind, () => render(true));
    const start = performance.now();
    await cache.get(kind, () => render(true));
    row.warmCacheMs = +(performance.now() - start).toFixed(3);
    report.push(row);
}
console.log(JSON.stringify({ fixture: 'synthetic; no Discord or database latency', report }, null, 2));
