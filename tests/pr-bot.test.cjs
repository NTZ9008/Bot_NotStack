const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PrBotStatsService } = require('../apps/backend/dist/pr-bot/pr-bot-stats.service');
const { PrBotService } = require('../apps/backend/dist/pr-bot/pr-bot.service');
const { prBotStatsQuerySchema } = require('../packages/shared/dist');

test('PR statistics only accept the supported bounded ranges', () => {
    assert.equal(prBotStatsQuerySchema.parse({}).days, 7);
    for (const days of ['7', '30', '90']) assert.equal(prBotStatsQuerySchema.parse({ days }).days, Number(days));
    for (const days of ['0', '-1', '365', '7.5', '', ['7'], '7 OR 1=1']) assert.equal(prBotStatsQuerySchema.safeParse({ days }).success, false);
});

test('calendar days switch at Thai midnight and include zero buckets across year boundaries', async () => {
    const calls = [];
    const stats = new PrBotStatsService({
        $queryRaw: async (sql, ...values) => {
            calls.push({ sql: sql.join('?'), values });
            return [];
        },
    });
    const now = new Date('2026-12-31T17:00:00.000Z');
    const result = await stats.read('guild-A', 7, now);
    assert.equal(result.range.from, '2026-12-25T17:00:00.000Z');
    assert.equal(result.daily[0].label, '2026-12-26');
    assert.equal(result.daily.at(-1).label, '2027-01-01');
    assert.equal(result.daily.length, 7);
    assert.equal(result.hourly.length, 24);
    assert.deepEqual(result.totals, { sent: 0, merged: 0, closed: 0 });
    assert.equal(result.hourly.at(-1).label, '23:00');
    assert.deepEqual(calls[0].values, ['guild-A', result.range.from, now.toISOString()]);
    assert.match(calls[0].sql, /WHERE guild_id = \? AND created_at >= \?::timestamptz AND created_at <= \?::timestamptz/);
    const before = await stats.read('guild-B', 30, new Date(now.getTime() - 1));
    assert.equal(before.daily.at(-1).label, '2026-12-31');
    assert.equal(before.daily.length, 30);
    assert.equal((await stats.read('guild-B', 90, now)).daily.length, 90);
});

test('daily and hour-of-day distributions agree with totals and preserve empty periods', async () => {
    const stats = new PrBotStatsService({
        $queryRaw: async () => [
            { day: '2026-10-11', hour: 23, kind: 'sent', total: 2n },
            { day: '2026-10-12', hour: 0, kind: 'sent', total: 3n },
            { day: '2026-10-12', hour: 0, kind: 'merged', total: 1n },
            { day: '2026-10-12', hour: 23, kind: 'closed', total: 4n },
        ],
    });
    const result = await stats.read('guild-A', 7, new Date('2026-10-12T16:59:59Z'));
    assert.deepEqual(result.totals, { sent: 5, merged: 1, closed: 4 });
    assert.deepEqual(result.daily.at(-1), { label: '2026-10-12', sent: 3, merged: 1, closed: 4 });
    assert.deepEqual(result.hourly[23], { label: '23:00', sent: 2, merged: 0, closed: 4 });
    for (const kind of ['sent', 'merged', 'closed']) {
        assert.equal(
            result.daily.reduce((sum, row) => sum + row[kind], 0),
            result.totals[kind],
        );
        assert.equal(
            result.hourly.reduce((sum, row) => sum + row[kind], 0),
            result.totals[kind],
        );
    }
    assert.equal(result.daily[0].sent, 0);
});

test('repeated close recordings preserve original timestamp and are isolated by guild', async () => {
    const rows = new Map();
    const stats = new PrBotStatsService({
        prNotification: {
            createMany: async ({ data, skipDuplicates }) => {
                assert.equal(skipDuplicates, true);
                const key = JSON.stringify(data[0]);
                if (!rows.has(key)) rows.set(key, data[0]);
            },
        },
    });
    await stats.record('a', 'message', 'closed');
    await stats.record('a', 'message', 'closed');
    await stats.record('b', 'message', 'closed');
    assert.equal(rows.size, 2);
});

test('statistics storage failure does not fail an already delivered notification', async () => {
    const stats = new PrBotStatsService({
        prNotification: {
            createMany: async () => {
                throw new Error('unavailable');
            },
        },
    });
    const errors = [];
    stats.logger = { error: (...args) => errors.push(args) };
    await assert.doesNotReject(stats.record('a', 'message', 'sent'));
    assert.equal(errors.length, 1);
});

// in-memory pr_messages — รองรับเฉพาะ query ที่ PrBotService ใช้
function fakePrisma(initial = []) {
    const rows = new Map(initial.map((row) => [`${row.guildId}|${row.repoFullName}|${row.prNumber}`, { activity: {}, headSha: null, ...row }]));
    const keyOf = ({ guildId_repoFullName_prNumber: k }) => `${k.guildId}|${k.repoFullName}|${k.prNumber}`;
    const pick = (row, select) => (row ? Object.fromEntries(Object.keys(select).map((field) => [field, structuredClone(row[field])])) : null);
    const prisma = {
        rows,
        prMessage: {
            findUnique: async ({ where, select }) => pick(rows.get(keyOf(where)), select),
            findMany: async ({ where, select }) =>
                [...rows.values()].filter((row) => Object.entries(where).every(([field, value]) => row[field] === value)).map((row) => pick(row, select)),
            upsert: async ({ where, create, update }) => {
                const key = keyOf(where);
                rows.set(key, rows.has(key) ? { ...rows.get(key), ...structuredClone(update) } : { activity: {}, headSha: null, ...structuredClone(create) });
            },
            update: async ({ where, data }) => {
                const key = keyOf(where);
                rows.set(key, { ...rows.get(key), ...structuredClone(data) });
            },
        },
        // จำลองล็อกแถวของ SELECT ... FOR UPDATE — transaction ทำทีละอัน
        lock: Promise.resolve(),
        $transaction: (fn) => {
            const run = prisma.lock.then(() => fn(prisma));
            prisma.lock = run.catch(() => {});
            return run;
        },
        $queryRaw: async (sql, guildId, repoFullName, prNumber) => {
            assert.match(sql.join('?'), /FOR UPDATE/);
            const row = rows.get(`${guildId}|${repoFullName}|${prNumber}`);
            return row ? [{ activity: structuredClone(row.activity) }] : [];
        },
    };
    return prisma;
}

function botFixture({ failSend = false, failEdit = false, channelAvailable = true, rows } = {}) {
    const records = [];
    const sent = [];
    const edits = [];
    const message = {
        id: 'message',
        edit: async (payload) => {
            if (failEdit) throw new Error('edit failed');
            edits.push(payload);
        },
    };
    const channel = {
        id: 'channel',
        isSendable: () => true,
        messages: { fetch: async () => message },
        send: async (payload) => {
            if (failSend) throw new Error('send failed');
            sent.push(payload);
            return message;
        },
    };
    const prisma = fakePrisma(rows);
    const bot = new PrBotService(
        { getChannelIdForOrg: async () => 'channel', getMentionForRepo: async () => '' },
        { ready: true, fetchGuildChannel: async () => (channelAvailable ? channel : null) },
        prisma,
        { get: () => '' },
        { record: async (...args) => records.push(args) },
    );
    bot.logger = { error: () => {} };
    const lastEmbeds = () => (edits.at(-1) ?? sent.at(-1)).embeds;
    const lastEmbed = () => lastEmbeds()[0];
    const field = (name) => lastEmbed().fields.find((f) => f.name.includes(name))?.value;
    const fieldName = (name) => lastEmbed().fields.find((f) => f.name.includes(name))?.name;
    const comments = () => lastEmbeds()[1];
    return { bot, records, sent, edits, prisma, lastEmbed, lastEmbeds, field, fieldName, comments };
}
const repository = { full_name: 'owner/repo', html_url: 'https://github.com/owner/repo' };
const payload = {
    repository,
    pull_request: {
        number: 1,
        title: 'Example',
        html_url: 'https://github.com/owner/repo/pull/1',
        state: 'open',
        user: { login: 'author', avatar_url: 'https://avatars.example/author.png' },
        head: { ref: 'feat/x', sha: 'abc' },
        requested_reviewers: [{ login: 'alice' }, { login: 'bob' }],
    },
};
const legacyRow = { guildId: 'guild', repoFullName: 'owner/repo', prNumber: 1, channelId: 'channel', messageId: 'message' };

test('successful opened, reopened, ready, merged and closed deliveries record the correct kinds', async () => {
    const { bot, records } = botFixture();
    for (const action of ['opened', 'reopened', 'ready_for_review']) await bot.handle('guild', 'pull_request', { ...payload, action });
    await bot.handle('guild', 'pull_request', { ...payload, action: 'closed' });
    await bot.handle('guild', 'pull_request', { ...payload, action: 'closed', pull_request: { ...payload.pull_request, merged: true } });
    assert.deepEqual(
        records.map((row) => row[2]),
        ['sent', 'sent', 'sent', 'closed', 'merged'],
    );
    assert.ok(records.every(([guildId, messageId]) => guildId === 'guild' && messageId === 'message'));
});

// ห้องที่แต่ละข้อความได้ id ไม่ซ้ำกัน — ใช้ดูว่าข้อความไหนถูกส่ง / แก้ / ลบ
function multiMessageFixture({ failDelete = false } = {}) {
    const messages = new Map();
    const deleted = [];
    let next = 0;
    const channel = {
        id: 'channel',
        isSendable: () => true,
        messages: { fetch: async (id) => messages.get(id) ?? Promise.reject(new Error('Unknown Message')) },
        send: async (payload) => {
            const message = {
                id: `message-${++next}`,
                payload,
                edit: async (edited) => void (message.payload = edited),
                delete: async () => {
                    if (failDelete) throw new Error('Missing Permissions');
                    messages.delete(message.id);
                    deleted.push(message.id);
                },
            };
            messages.set(message.id, message);
            return message;
        },
    };
    const prisma = fakePrisma();
    const records = [];
    const errors = [];
    const bot = new PrBotService(
        { getChannelIdForOrg: async () => 'channel', getMentionForRepo: async () => '' },
        { ready: true, fetchGuildChannel: async () => channel },
        prisma,
        { get: () => '' },
        { record: async (...args) => records.push(args) },
    );
    bot.logger = { error: (...args) => errors.push(args) };
    return { bot, messages, deleted, prisma, records, errors };
}
const draft = { ...payload.pull_request, draft: true };

test('draft PR marked ready for review replaces the draft message instead of leaving a duplicate', async () => {
    const { bot, messages, deleted, prisma, records } = multiMessageFixture();
    await bot.handle('guild', 'pull_request', { ...payload, action: 'opened', pull_request: draft });
    assert.match(messages.get('message-1').payload.embeds[0].description, /Draft pull request/);

    await bot.handle('guild', 'pull_request', { ...payload, action: 'ready_for_review' });
    assert.deepEqual(deleted, ['message-1']);
    assert.deepEqual([...messages.keys()], ['message-2']);
    assert.match(messages.get('message-2').payload.embeds[0].description, /New pull request/);
    assert.equal(prisma.rows.get('guild|owner/repo|1').messageId, 'message-2');

    // event หลังจากนี้ต้องแก้ข้อความใหม่ ไม่ใช่ข้อความ draft ที่ลบไปแล้ว
    await bot.handle('guild', 'pull_request', { ...payload, action: 'closed', pull_request: { ...payload.pull_request, merged: true } });
    assert.match(messages.get('message-2').payload.embeds[0].description, /🟣 Merged/);
    assert.deepEqual(records, [
        ['guild', 'message-1', 'sent'],
        ['guild', 'message-2', 'sent'],
        ['guild', 'message-2', 'merged'],
    ]);
});

test('reopened PR replaces the closed message and keeps accumulated activity', async () => {
    const { bot, messages, deleted, prisma } = multiMessageFixture();
    await bot.handle('guild', 'pull_request', { ...payload, action: 'opened' });
    await bot.handle('guild', 'pull_request_review', review('alice', 'approved', '2026-10-16T01:00:00Z', ['bob']));
    await bot.handle('guild', 'pull_request', { ...payload, action: 'closed', pull_request: { ...payload.pull_request, state: 'closed' } });
    await bot.handle('guild', 'pull_request', { ...payload, action: 'reopened' });
    assert.deepEqual(deleted, ['message-1']);
    assert.deepEqual([...messages.keys()], ['message-2']);
    assert.equal(prisma.rows.get('guild|owner/repo|1').messageId, 'message-2');
    assert.match(messages.get('message-2').payload.embeds[0].fields.find((f) => f.name.includes('Reviews')).value, /alice/);
});

test('failing to delete the old PR message does not fail the webhook or lose the new message', async () => {
    const { bot, messages, prisma, errors } = multiMessageFixture({ failDelete: true });
    await bot.handle('guild', 'pull_request', { ...payload, action: 'opened', pull_request: draft });
    await assert.doesNotReject(bot.handle('guild', 'pull_request', { ...payload, action: 'ready_for_review' }));
    assert.equal(prisma.rows.get('guild|owner/repo|1').messageId, 'message-2');
    assert.equal(messages.size, 2);
    assert.equal(errors.length, 1);

    // ข้อความเดิมถูกลบไปก่อนแล้ว (เช่น แอดมินลบเอง) → ข้ามไปเงียบๆ
    const fresh = multiMessageFixture();
    await fresh.bot.handle('guild', 'pull_request', { ...payload, action: 'opened', pull_request: draft });
    fresh.messages.delete('message-1');
    await fresh.bot.handle('guild', 'pull_request', { ...payload, action: 'ready_for_review' });
    assert.deepEqual([...fresh.messages.keys()], ['message-2']);
    assert.deepEqual(fresh.errors, []);
});

test('failed sends, failed edits and ignored webhook actions do not add statistics', async () => {
    for (const [options, action] of [
        [{ failSend: true }, 'opened'],
        [{ failEdit: true, rows: [legacyRow] }, 'closed'],
    ]) {
        const { bot, records } = botFixture(options);
        await assert.rejects(bot.handle('guild', 'pull_request', { ...payload, action }));
        assert.deepEqual(records, []);
    }
    const { bot, records } = botFixture({ channelAvailable: false, rows: [legacyRow] });
    await bot.handle('guild', 'pull_request', { ...payload, action: 'opened' });
    await bot.handle('guild', 'pull_request', { ...payload, action: 'synchronize' });
    await bot.handle('guild', 'pull_request', { ...payload, action: 'closed' });
    await bot.handle('guild', 'ping', payload);
    assert.deepEqual(records, []);
});

test('opened PR shows who is still requested and stores the head commit for check lookups', async () => {
    const { bot, prisma, lastEmbed, lastEmbeds, field, fieldName } = botFixture();
    await bot.handle('guild', 'pull_request', { ...payload, action: 'opened', pull_request: { ...payload.pull_request, base: { ref: 'main' } } });
    const embed = lastEmbed();
    assert.equal(embed.title, '#1 Example');
    assert.equal(embed.author.name, 'author');
    assert.equal(embed.author.url, 'https://github.com/author');
    assert.equal(embed.thumbnail.url, 'https://avatars.example/author.png');
    assert.equal(embed.description.split('\n')[1], '`feat/x` → `main`');
    assert.match(embed.description, /Waiting for review\*\* from \*\*alice\*\*, \*\*bob\*\*/);
    assert.equal(fieldName('Reviews'), '👀 Reviews · 0/2 approved');
    assert.equal(field('Reviews'), '⏳ alice\n⏳ bob');
    assert.equal(field('Checks'), undefined);
    assert.equal(lastEmbeds().length, 1); // ยังไม่มี comment → ไม่มี embed comment
    assert.equal(prisma.rows.get('guild|owner/repo|1').headSha, 'abc');
});

// payload จริงของ GitHub ไม่มีคนที่ review แล้วใน requested_reviewers
const review = (login, state, submitted_at, requested = [], extra = {}) => ({
    action: 'submitted',
    repository,
    pull_request: { ...payload.pull_request, requested_reviewers: requested.map((name) => ({ login: name })) },
    review: { id: Math.floor(Math.random() * 1e9), user: { login }, state, submitted_at, ...extra },
});

test('reviews edit the original message: approval, change requests and later comments', async () => {
    const { bot, edits, lastEmbed, field, fieldName } = botFixture();
    await bot.handle('guild', 'pull_request', { ...payload, action: 'opened' });
    await bot.handle('guild', 'pull_request_review', review('alice', 'approved', '2026-10-16T01:00:00Z', ['bob']));
    assert.match(lastEmbed().description, /✅ \*\*Approved\*\* by \*\*alice\*\*/);
    assert.equal(lastEmbed().color, 0x57f287);
    assert.equal(field('Reviews'), '✅ alice\n⏳ bob');
    assert.equal(fieldName('Reviews'), '👀 Reviews · 1/2 approved');

    // comment ทีหลังไม่ลบผล approve (เหมือน GitHub)
    await bot.handle('guild', 'pull_request_review', review('alice', 'commented', '2026-10-16T02:00:00Z'));
    await bot.handle('guild', 'pull_request_review', review('bob', 'changes_requested', '2026-10-16T03:00:00Z'));
    assert.match(lastEmbed().description, /Changes requested\*\* by \*\*bob\*\*/);
    assert.equal(lastEmbed().color, 0xe67e22);
    assert.equal(field('Reviews'), '✅ alice\n🔴 bob');

    // review เก่าที่มาช้าไม่ทับ review ใหม่
    await bot.handle('guild', 'pull_request_review', review('bob', 'approved', '2026-10-16T02:30:00Z'));
    assert.match(field('Reviews'), /🔴 bob/);
    await bot.handle('guild', 'pull_request_review', review('bob', 'approved', '2026-10-16T04:00:00Z'));
    assert.equal(field('Reviews'), '✅ alice\n✅ bob');

    // dismiss → ไม่นับ approve นั้นอีก
    await bot.handle('guild', 'pull_request_review', { ...review('alice', 'dismissed', '2026-10-16T01:00:00Z'), action: 'dismissed' });
    assert.equal(field('Reviews'), '✅ bob');
    assert.ok(edits.length >= 5);
});

test('comments show a count and the latest human comments, ignore bots and follow deletes', async () => {
    const { bot, comments } = botFixture();
    await bot.handle('guild', 'pull_request', { ...payload, action: 'opened' });
    const comment = (id, login, body, created_at, extra = {}) => ({
        action: 'created',
        repository,
        issue: { number: 1, pull_request: {} },
        comment: { id, user: { login }, body, created_at, html_url: `https://github.com/owner/repo/pull/1#c${id}` },
        ...extra,
    });
    await bot.handle('guild', 'issue_comment', comment(1, 'alice', 'first', '2026-10-16T01:00:00Z'));
    await bot.handle('guild', 'issue_comment', comment(1, 'alice', 'first', '2026-10-16T01:00:00Z')); // redelivery
    await bot.handle('guild', 'issue_comment', comment(2, 'bob', 'needs **tests**\n\n```js\nx()\n```', '2026-10-16T02:00:00Z'));
    await bot.handle('guild', 'issue_comment', {
        ...comment(3, 'vercel[bot]', 'Preview ready', '2026-10-16T03:00:00Z'),
        comment: { id: 3, user: { login: 'vercel[bot]', type: 'Bot' }, body: 'x' },
    });
    await bot.handle('guild', 'pull_request_review_comment', {
        action: 'created',
        repository,
        pull_request: payload.pull_request,
        comment: { id: 4, user: { login: 'carol' }, body: 'nit', created_at: '2026-10-16T04:00:00Z', html_url: 'https://github.com/owner/repo/pull/1#r4' },
    });
    await bot.handle('guild', 'issue_comment', comment(5, 'dave', 'issue only', '2026-10-16T05:00:00Z', { issue: { number: 1 } }));
    assert.equal(comments().title, '💬 Comments (3)');
    // เก่า → ใหม่ และคง markdown ของ GitHub ไว้ (ตัวหนา, code block)
    assert.equal(
        comments().description,
        [
            `**[alice](https://github.com/owner/repo/pull/1#c1)** · <t:${Date.parse('2026-10-16T01:00:00Z') / 1000}:R>\nfirst`,
            `**[bob](https://github.com/owner/repo/pull/1#c2)** · <t:${Date.parse('2026-10-16T02:00:00Z') / 1000}:R>\nneeds **tests**\n\n\`\`\`js\nx()\n\`\`\``,
            `**[carol](https://github.com/owner/repo/pull/1#r4)** · <t:${Date.parse('2026-10-16T04:00:00Z') / 1000}:R>\nnit`,
        ].join('\n\n'),
    );
    assert.equal(comments().url, undefined); // url ซ้ำกับ embed หลักจะทำให้ Discord รวม embed เข้าด้วยกัน
    await bot.handle('guild', 'issue_comment', { ...comment(4, 'x', '', ''), action: 'deleted' }); // id เดียวกันแต่คนละชนิด → ไม่กระทบ
    await bot.handle('guild', 'issue_comment', { ...comment(2, 'bob', '', ''), action: 'deleted' });
    assert.equal(comments().title, '💬 Comments (2)');
    assert.doesNotMatch(comments().description, /bob/);
});

const checkRun = (name, status, conclusion, started_at, completed_at, head_sha = 'abc') => ({
    action: status === 'completed' ? 'completed' : 'created',
    repository,
    check_run: { name, head_sha, status, conclusion, started_at, completed_at },
});

test('checks only say passed / failed / running per check, for the latest commit only', async () => {
    const { bot, field, fieldName, prisma } = botFixture();
    await bot.handle('guild', 'pull_request', { ...payload, action: 'opened' });
    await bot.handle('guild', 'check_run', checkRun('build', 'completed', 'success', '2026-10-16T01:00:00Z', '2026-10-16T01:05:00Z'));
    await bot.handle('guild', 'check_run', checkRun('test', 'queued', null, '2026-10-16T01:00:00Z', null));
    await bot.handle('guild', 'check_run', checkRun('test', 'completed', 'failure', '2026-10-16T01:00:00Z', '2026-10-16T01:06:00Z'));
    // event "created" ที่มาช้ากว่า "completed" ไม่ทำให้ผลถอยกลับ
    await bot.handle('guild', 'check_run', checkRun('test', 'in_progress', null, '2026-10-16T01:00:00Z', null));
    await bot.handle('guild', 'check_run', checkRun('lint', 'in_progress', null, '2026-10-16T01:00:00Z', null));
    await bot.handle('guild', 'check_run', checkRun('docs', 'completed', 'skipped', '2026-10-16T01:00:00Z', '2026-10-16T01:00:00Z'));
    await bot.handle('guild', 'status', { repository, sha: 'abc', context: 'vercel', state: 'success', updated_at: '2026-10-16T01:03:00Z' });
    await bot.handle('guild', 'check_run', checkRun('other-pr', 'completed', 'failure', '2026-10-16T01:00:00Z', '2026-10-16T01:01:00Z', 'zzz'));
    assert.equal(fieldName('Checks'), '🧪 Checks · 2/5 passed');
    assert.equal(field('Checks'), ['🟩🟩⬜🟨🟥', '', '❌ test', '🟡 lint', '✅ build', '✅ vercel', '⚪ docs'].join('\n'));

    // re-run ที่เริ่มทีหลังทับผลเดิม
    await bot.handle('guild', 'check_run', checkRun('test', 'completed', 'success', '2026-10-16T02:00:00Z', '2026-10-16T02:05:00Z'));
    assert.equal(fieldName('Checks'), '🧪 Checks · 3/5 passed');

    // push commit ใหม่ → ผลเก่าหายไป และ check ของ commit เก่าที่มาช้าถูกข้าม
    await bot.handle('guild', 'pull_request', {
        ...payload,
        action: 'synchronize',
        pull_request: { ...payload.pull_request, head: { ref: 'feat/x', sha: 'def' } },
    });
    assert.equal(prisma.rows.get('guild|owner/repo|1').headSha, 'def');
    assert.equal(field('Checks'), undefined);
    await bot.handle('guild', 'check_run', checkRun('build', 'completed', 'failure', '2026-10-16T03:00:00Z', '2026-10-16T03:01:00Z', 'abc'));
    assert.equal(field('Checks'), undefined);
    await bot.handle('guild', 'check_run', checkRun('build', 'queued', null, '2026-10-16T03:00:00Z', null, 'def'));
    assert.equal(fieldName('Checks'), '🧪 Checks · 0/1 passed');
    assert.equal(field('Checks'), '🟨\n\n⏳ build');
});

test('merged PR keeps the review and check summary, and later events never reopen it', async () => {
    const { bot, lastEmbed, field, records, comments } = botFixture();
    await bot.handle('guild', 'pull_request', { ...payload, action: 'opened' });
    await bot.handle('guild', 'pull_request_review', review('alice', 'approved', '2026-10-16T01:00:00Z'));
    await bot.handle('guild', 'pull_request', { ...payload, action: 'closed', pull_request: { ...payload.pull_request, state: 'closed', merged: true } });
    assert.match(lastEmbed().description, /^🟣 Merged/);
    assert.equal(lastEmbed().footer.text, 'Merged');
    await bot.handle('guild', 'pull_request', { ...payload, action: 'edited' });
    await bot.handle('guild', 'issue_comment', {
        action: 'created',
        repository,
        issue: { number: 1, pull_request: {} },
        comment: { id: 9, user: { login: 'bob' }, body: 'thanks' },
    });
    assert.match(lastEmbed().description, /^🟣 Merged/);
    assert.equal(lastEmbed().color, 0x8957e5);
    assert.match(field('Reviews'), /✅ alice/);
    assert.match(comments().description, /thanks/);
    assert.equal(comments().color, 0x8957e5);
    assert.deepEqual(
        records.map((r) => r[2]),
        ['sent', 'merged'],
    );
});

test('rows created before this feature render once a review payload supplies PR details', async () => {
    const { bot, edits, field, comments } = botFixture({ rows: [legacyRow] });
    await bot.handle('guild', 'check_run', checkRun('build', 'completed', 'success', '2026-10-16T01:00:00Z', '2026-10-16T01:05:00Z'));
    await bot.handle('guild', 'issue_comment', {
        action: 'created',
        repository,
        issue: { number: 1, pull_request: {} },
        comment: { id: 1, user: { login: 'x' }, body: 'hi' },
    });
    assert.equal(edits.length, 0); // ยังไม่มีข้อมูล PR ให้วาด
    await bot.handle('guild', 'pull_request_review', review('alice', 'approved', '2026-10-16T01:00:00Z'));
    assert.equal(edits.length, 1);
    assert.match(field('Reviews'), /✅ alice/);
    assert.equal(comments().title, '💬 Comments (1)');
    assert.match(comments().description, /\nhi$/);
});

test('concurrent webhook bursts coalesce Discord edits and the final edit has every result', async () => {
    const { bot, edits, fieldName } = botFixture();
    await bot.handle('guild', 'pull_request', { ...payload, action: 'opened' });
    const names = Array.from({ length: 12 }, (_, i) => `job-${String(i).padStart(2, '0')}`);
    await Promise.all(
        names.map((name) => bot.handle('guild', 'check_run', checkRun(name, 'completed', 'success', '2026-10-16T01:00:00Z', '2026-10-16T01:01:00Z'))),
    );
    assert.ok(edits.length < names.length, `expected coalesced edits, got ${edits.length}`);
    assert.equal(fieldName('Checks'), '🧪 Checks · 12/12 passed');
});

test('long check lists and comment bodies stay within Discord embed limits', async () => {
    const { bot, lastEmbed, lastEmbeds, comments } = botFixture();
    await bot.handle('guild', 'pull_request', { ...payload, action: 'opened' });
    for (let i = 0; i < 40; i++) {
        await bot.handle(
            'guild',
            'check_run',
            checkRun(`${'very-long-check-name-'.repeat(4)}${i}`, 'completed', 'success', '2026-10-16T01:00:00Z', '2026-10-16T01:01:00Z'),
        );
    }
    for (let i = 0; i < 5; i++) {
        await bot.handle('guild', 'issue_comment', {
            action: 'created',
            repository,
            issue: { number: 1, pull_request: {} },
            comment: { id: i, user: { login: 'x' }, body: `\`\`\`\n${'line of code\n'.repeat(500)}\`\`\``, created_at: `2026-10-16T0${i}:00:00Z` },
        });
    }
    for (const f of lastEmbed().fields) assert.ok(f.value.length <= 1024, `${f.name} is ${f.value.length} chars`);
    assert.match(lastEmbed().fields.find((f) => f.name.includes('Checks')).value, /…and \d+ more$/);
    assert.equal(comments().title, '💬 Comments (5)');
    assert.match(comments().description, /\[View all 5 comments on GitHub\]/);
    // code block ที่ถูกตัดต้องปิดให้ครบ ไม่งั้นข้อความที่เหลือกลายเป็น code ทั้งหมด
    assert.equal((comments().description.match(/```/g) ?? []).length % 2, 0);
    const total = lastEmbeds().reduce(
        (sum, e) =>
            sum +
            (e.title?.length ?? 0) +
            (e.description?.length ?? 0) +
            (e.author?.name.length ?? 0) +
            (e.footer?.text.length ?? 0) +
            (e.fields ?? []).reduce((n, f) => n + f.name.length + f.value.length, 0),
        0,
    );
    assert.ok(total <= 6000, `embeds total ${total} chars`);
});

const { githubMarkdownToDiscord } = require('../apps/backend/dist/pr-bot/utils/github-markdown');

test('GitHub comment markdown is converted to what Discord can render', () => {
    const md = (text, limit = 1000) => githubMarkdownToDiscord(text, limit);
    assert.equal(md('## Summary\n### Details ###'), '**Summary**\n**Details**');
    assert.equal(md('- [x] done\n  - [ ] todo\n* plain'), '- ☑ done\n  - ☐ todo\n* plain');
    assert.equal(md('**bold** _it_ ~~gone~~ `code` [link](https://a.b)'), '**bold** _it_ ~~gone~~ `code` [link](https://a.b)');
    assert.equal(md('![screenshot](https://img/x.png "t") ![](https://img/y.png)'), '[🖼️ screenshot](https://img/x.png) [🖼️ image](https://img/y.png)');
    assert.equal(md('<img width="300" src="https://img/z.png">'), '[🖼️ image](https://img/z.png)');
    assert.equal(md('<details><summary>Logs</summary>\n\nhidden</details>'), '**▸ Logs**\n\nhidden');
    assert.equal(md('a<br>b <b>x</b> <a href="https://u">u</a> <!-- hidden -->'), 'a\nb **x** [u](https://u)');
    assert.equal(md('> quoted<br>still quoted\n\n---\nafter'), '> quoted\n> still quoted\n\n───\nafter');
    // ข้างใน code ไม่แปลงอะไร
    assert.equal(md('`<b>raw</b>` and\n```html\n<b>## raw</b>\n- [ ] raw\n```'), '`<b>raw</b>` and\n```html\n<b>## raw</b>\n- [ ] raw\n```');
    assert.equal(md('~~~\ntilde\n~~~'), '```\ntilde\n```');
    assert.equal(md('```suggestion\nconst a = 1;\n```'), '**Suggested change:**\n```\nconst a = 1;\n```');
    assert.equal(md('```js\nunclosed'), '```js\nunclosed\n```');
    assert.equal(md('a\r\n\r\n\r\n\r\nb'), 'a\n\nb');
    const cut = md(`text\n\`\`\`\n${'x\n'.repeat(100)}\`\`\``, 60);
    assert.ok(cut.length <= 60);
    assert.ok(cut.endsWith('…\n```'));
    assert.equal(md('word '.repeat(50), 30).length <= 30, true);
});
