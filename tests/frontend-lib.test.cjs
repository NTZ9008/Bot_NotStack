const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
require('./ts-loader.cjs');
const { escapeHtml, renderDiscordMarkdown } = require('../apps/frontend/src/lib/discord-markdown.ts');
const { formatBytes, formatMinutes, shortBucketLabel } = require('../apps/frontend/src/lib/format.ts');

test('Discord markdown preview escapes user HTML before adding its own tags', () => {
    assert.equal(escapeHtml(`<img src=x onerror="alert(1)">'`), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&#39;');
    const html = renderDiscordMarkdown('**bold** <script>alert(1)</script>');
    assert.equal(html, '<strong>bold</strong> &lt;script&gt;alert(1)&lt;/script&gt;');
});
test('Discord markdown preview only links http(s) URLs and cannot break out of href', () => {
    assert.doesNotMatch(renderDiscordMarkdown('[click](javascript:alert(1))'), /<a /);
    const html = renderDiscordMarkdown('[x](https://example.com/"onmouseover="alert(1))');
    assert.doesNotMatch(html, /href="[^"]*"onmouseover/);
    assert.match(renderDiscordMarkdown('see https://example.com'), /<a class="dc-link" href="https:\/\/example.com"/);
});
test('Discord markdown preview keeps code blocks untouched by other rules', () => {
    assert.equal(renderDiscordMarkdown('`**not bold**`'), '<code class="dc-code">**not bold**</code>');
    assert.equal(renderDiscordMarkdown('```js\n**x**\n```'), '<pre class="dc-codeblock">**x**</pre>');
});
test('Thai duration and size formatting', () => {
    assert.equal(formatMinutes(0), '0 นาที');
    assert.equal(formatMinutes(45), '45 นาที');
    assert.equal(formatMinutes(120), '2 ชม.');
    assert.equal(formatMinutes(125), '2 ชม. 5 นาที');
    assert.equal(formatBytes(10), '1 KB');
    assert.equal(formatBytes(3 * 1024 * 1024), '3.0 MB');
});
test('activity bucket labels are shortened for chart axes and highlights', () => {
    assert.equal(shortBucketLabel('2026-11-22 14:00', 'hour'), '22/11 14:00');
    assert.equal(shortBucketLabel('2026-11-22 00:00', 'day'), '22/11');
});

const { visibleNavGroups, findNavItem } = require('../apps/frontend/src/components/layout/nav-items.ts');
const navItems = (admin, access) => visibleNavGroups(admin, access ? { access } : null).flatMap((group) => group.items);

test('navigation keeps all existing features available to server managers and system admins', () => {
    const manager = navItems(false, 'manage');
    assert.deepEqual(
        manager
            .filter((item) => item.guild)
            .map((item) => item.to.split('/').pop())
            .sort(),
        [
            'ai',
            'audit-logs',
            'config',
            'custom-summary',
            'funds',
            'grafana-alerts',
            'jira',
            'levels',
            'log-manager',
            'news',
            'overview',
            'pr-bot',
            'relations',
            'room-access',
            'voice-guard',
            'voice-listen',
            'weather',
            'welcome',
        ],
    );
    assert.deepEqual(
        manager
            .filter((item) => !item.guild)
            .map((item) => item.to)
            .sort(),
        ['/account', '/servers'],
    );
    assert.deepEqual(
        navItems(true, 'manage')
            .filter((item) => item.adminOnly)
            .map((item) => item.to)
            .sort(),
        ['/audit-logs', '/logs', '/users'],
    );
});

test('navigation, search and feature shortcuts cannot expose management links to viewers', () => {
    for (const admin of [false, true]) {
        assert.deepEqual(
            navItems(admin, 'view')
                .filter((item) => item.guild)
                .map((item) => item.to),
            ['/servers/$guildId/levels'],
        );
        assert.equal(
            navItems(admin, null).some((item) => item.guild),
            false,
        );
    }
    assert.equal(
        navItems(false, 'view').some((item) => item.adminOnly),
        false,
    );
});

test('Thai labels retain English search terms and breadcrumb matching', () => {
    assert.match(findNavItem('/servers/$guildId/config/').keywords, /configuration/);
    assert.match(findNavItem('/servers/$guildId/voice-guard').keywords, /whitelist blacklist/);
    assert.equal(findNavItem('/servers/$guildId/config').label, 'ตั้งค่าบอท');
    assert.equal(findNavItem('/missing'), undefined);
});

const { PreloadQueue, canPreloadInBackground } = require('../apps/frontend/src/lib/background-preload.ts');
const flushPreloads = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

test('preloads share two slots and intent promotes a queued task without duplication', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const queue = new PreloadQueue(() => true);
    const signal = new AbortController().signal;
    const calls = [],
        releases = [];
    const task = (key) => ({
        key,
        run: () => {
            calls.push(key);
            return new Promise((resolve) => releases.push(resolve));
        },
    });
    for (const key of ['a', 'b', 'c', 'd']) queue.enqueue(task(key), signal);
    t.mock.timers.tick(50);
    assert.deepEqual(calls, ['a', 'b']);
    queue.enqueue(task('d'), signal, true);
    queue.enqueue(task('a'), signal, true);
    t.mock.timers.tick(1000);
    assert.deepEqual(calls, ['a', 'b']);
    releases[0]();
    await flushPreloads();
    t.mock.timers.tick(0);
    assert.deepEqual(calls, ['a', 'b', 'd']);
    releases[1]();
    await flushPreloads();
    t.mock.timers.tick(0);
    assert.deepEqual(calls, ['a', 'b', 'd', 'c']);
    releases[2]();
    releases[3]();
    await flushPreloads();
});

test('paused preloads resume without dropping queued intent', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let ready = false,
        calls = 0;
    const queue = new PreloadQueue(() => ready);
    queue.enqueue(
        {
            key: 'page',
            run: async () => {
                calls++;
            },
        },
        new AbortController().signal,
        true,
    );
    t.mock.timers.tick(0);
    assert.equal(calls, 0);
    ready = true;
    t.mock.timers.tick(300);
    await flushPreloads();
    assert.equal(calls, 1);
});

test('failure releases a preload slot and can be retried', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const queue = new PreloadQueue(() => true, 1),
        signal = new AbortController().signal;
    let calls = 0;
    queue.enqueue(
        {
            key: 'bad',
            run: async () => {
                throw new Error('offline');
            },
        },
        signal,
    );
    queue.enqueue(
        {
            key: 'next',
            run: async () => {
                calls++;
            },
        },
        signal,
    );
    t.mock.timers.tick(50);
    await flushPreloads();
    t.mock.timers.tick(0);
    await flushPreloads();
    queue.enqueue(
        {
            key: 'bad',
            run: async () => {
                calls++;
            },
        },
        signal,
    );
    t.mock.timers.tick(50);
    await flushPreloads();
    assert.equal(calls, 2);
});

test('scope cancellation preserves work owned by another mounted scope', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const queue = new PreloadQueue(() => true),
        first = new AbortController(),
        second = new AbortController();
    const calls = [];
    const task = (key) => ({
        key,
        run: async () => {
            calls.push(key);
        },
    });
    queue.enqueue(task('shared'), first.signal);
    queue.enqueue(task('shared'), second.signal);
    queue.enqueue(task('old-guild'), first.signal);
    first.abort();
    queue.cancel(first.signal);
    t.mock.timers.tick(50);
    await flushPreloads();
    assert.deepEqual(calls, ['shared']);
});

test('expired sessions and cancellation while a load runs cannot start queued work', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const queue = new PreloadQueue(() => true, 1),
        controller = new AbortController();
    let finish,
        calls = 0;
    queue.enqueue(
        {
            key: 'expired',
            run: async () => {
                calls++;
            },
        },
        AbortSignal.abort(),
    );
    queue.enqueue(
        {
            key: 'running',
            run: () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        },
        controller.signal,
    );
    queue.enqueue(
        {
            key: 'queued',
            run: async () => {
                calls++;
            },
        },
        controller.signal,
    );
    t.mock.timers.tick(50);
    controller.abort();
    queue.cancel(controller.signal);
    finish();
    await flushPreloads();
    t.mock.timers.tick(1000);
    assert.equal(calls, 0);
});

test('background loading respects hidden pages, offline status and data-saving connections', (t) => {
    const document = { visibilityState: 'visible' };
    const navigator = { onLine: true, connection: { saveData: false, effectiveType: '4g' } };
    for (const [name, value] of Object.entries({ document, navigator })) {
        const original = Object.getOwnPropertyDescriptor(globalThis, name);
        Object.defineProperty(globalThis, name, { configurable: true, value });
        t.after(() => {
            if (original) Object.defineProperty(globalThis, name, original);
            else delete globalThis[name];
        });
    }
    assert.equal(canPreloadInBackground(), true);
    document.visibilityState = 'hidden';
    assert.equal(canPreloadInBackground(), false);
    document.visibilityState = 'visible';
    navigator.onLine = false;
    assert.equal(canPreloadInBackground(), false);
    navigator.onLine = true;
    navigator.connection.saveData = true;
    assert.equal(canPreloadInBackground(), false);
    navigator.connection.saveData = false;
    navigator.connection.effectiveType = '2g';
    assert.equal(canPreloadInBackground(), false);
    delete navigator.connection;
    assert.equal(canPreloadInBackground(), true);
});

test('URL parsers preserve optional strings and reject invalid search values without form schemas', () => {
    const { stringSearch, positiveSearchId } = require('../apps/frontend/src/lib/search-params.ts');
    assert.deepEqual(stringSearch({ error: 'denied', extra: 'ignored' }, ['error', 'redirect']), { error: 'denied' });
    assert.deepEqual(stringSearch({ redirect: '' }, ['error', 'redirect']), { redirect: '' });
    for (const bad of [true, 12, null, [], {}]) assert.throws(() => stringSearch({ error: bad }, ['error']), /Invalid search/);
    for (const bad of [undefined, null, '', 'bad', -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1, '100000000000000000000', Infinity, Symbol('id')])
        assert.equal(positiveSearchId(bad), undefined);
    assert.equal(positiveSearchId('12'), 12);
});

test('preview decoder accepts binary responses and old JSON APIs during rolling deployments', async () => {
    const { decodePreviewResponse } = require('../apps/frontend/src/lib/preview-response.ts');
    const vars = { user: 'สมาชิก' };
    const binary = await decodePreviewResponse(
        new Response('webp', { headers: { 'Content-Type': 'image/webp', 'X-Preview-Vars': encodeURIComponent(JSON.stringify(vars)) } }),
    );
    assert.equal(await binary.image.text(), 'webp');
    assert.deepEqual(binary.vars, vars);
    const legacy = await decodePreviewResponse(
        new Response(JSON.stringify({ image: 'data:image/png;base64,cG5n', vars }), { headers: { 'Content-Type': 'application/json' } }),
    );
    assert.equal(legacy.image.type, 'image/png');
    assert.equal(await legacy.image.text(), 'png');
    assert.deepEqual(legacy.vars, vars);
    await assert.rejects(decodePreviewResponse(new Response('<html>error</html>')));
});

const { parseCommand, cleanTarget, previewXp, describeXpCommand, matchScore, commandGuide } = require('../apps/frontend/src/lib/command-parser.ts');
const { createSseParser } = require('../apps/frontend/src/lib/sse-parser.ts');

test('command palette understands Thai and English XP commands', () => {
    const xp = (action, target, amount, reason) => ({ type: 'xp', action, target, amount, ...(reason ? { reason } : {}) });
    assert.deepEqual(parseCommand('ให้ XP @boat 500'), xp('add', 'boat', 500));
    assert.deepEqual(parseCommand('ให้ @boat 500 xp'), xp('add', 'boat', 500));
    assert.deepEqual(parseCommand('give 500 xp to boat'), xp('add', 'boat', 500));
    assert.deepEqual(parseCommand('เพิ่ม xp boat ngin 1.5k เพราะช่วยตอบคำถาม'), xp('add', 'boat ngin', 1500, 'ช่วยตอบคำถาม'));
    assert.deepEqual(parseCommand('หัก xp boat 1,200'), xp('subtract', 'boat', 1200));
    assert.deepEqual(parseCommand('xp boat -200'), xp('subtract', 'boat', 200));
    assert.deepEqual(parseCommand('xp +50 @boat'), xp('add', 'boat', 50));
    assert.deepEqual(parseCommand('give boat 300xp'), xp('add', 'boat', 300));
    assert.deepEqual(parseCommand('ตั้ง xp boat 0'), xp('set', 'boat', 0));
    assert.deepEqual(parseCommand('รีเซ็ต xp @boat because spam'), xp('reset', 'boat', 0, 'spam'));
    assert.deepEqual(parseCommand('ให้ xp <@!123456789012345678> 2หมื่น'), xp('add', '123456789012345678', 20000));
    // ใส่ User ID ตรงๆ ไม่ถูกตีความเป็นจำนวน XP
    assert.deepEqual(parseCommand('ให้ xp 123456789012345678 500'), xp('add', '123456789012345678', 500));
});

test('command palette ignores text that is not a command', () => {
    for (const text of ['', 'levels', 'ให้', 'ให้ boat 500', 'xp', 'ให้ xp boat', 'ให้ xp 500', 'xp boat 500', 'ให้ xp boat 0', 'ให้ xp boat 9999999999']) {
        assert.equal(parseCommand(text), null, text);
    }
});

test('command palette activity search and helpers', () => {
    assert.deepEqual(parseCommand('log boat'), { type: 'activity', query: 'boat' });
    assert.deepEqual(parseCommand('ค้นหา log เข้าห้องเสียง'), { type: 'activity', query: 'เข้าห้องเสียง' });
    assert.equal(cleanTarget(' @@boat '), 'boat');
    assert.equal(cleanTarget('<@123456789012345678>'), '123456789012345678');
    assert.equal(previewXp('add', 100, 50), 150);
    assert.equal(previewXp('subtract', 100, 500), 0);
    assert.equal(previewXp('set', 100, 7), 7);
    assert.equal(previewXp('reset', 100, 7), 0);
    assert.equal(describeXpCommand('add', 1500), 'ให้ 1,500 XP');
    assert.equal(describeXpCommand('reset', 0), 'รีเซ็ต XP');
    assert.equal(matchScore('ห้องเสียง voice guard', 'voice'), matchScore('ห้องเสียง voice guard', 'voice'));
    assert.ok(matchScore('Voice Guard ห้องเสียง', 'voice') > matchScore('ตั้งค่า voice', 'voice'));
    assert.equal(matchScore('news ข่าว', 'voice'), 0);
    assert.ok(matchScore('levels xp อันดับ', 'xp อันดับ') > 0);
});

test('SSE parser handles split chunks, CRLF, comments and multi-line data', () => {
    const messages = [];
    const parse = createSseParser((message) => messages.push(message));
    parse('retry: 5000\n\n: ping\n\nevent: hel');
    parse('lo\r');
    parse('\ndata: {"a":1}\r\n\r\nevent: batch\ndata: line1\ndata: line2\n');
    assert.equal(messages.length, 1);
    parse('\ndata: no-event\n\n');
    assert.deepEqual(messages, [
        { event: 'hello', data: '{"a":1}' },
        { event: 'batch', data: 'line1\nline2' },
        { event: 'message', data: 'no-event' },
    ]);
});

test('command palette guide walks through a partial XP command step by step', () => {
    const filled = (guide) => guide.steps.filter((step) => step.value).map((step) => step.label);
    let guide = commandGuide('ให้ xp @');
    assert.equal(guide.title, 'ให้ XP สมาชิก');
    assert.deepEqual(filled(guide), ['ทำอะไร']);
    assert.match(guide.next, /ชื่อสมาชิก/);
    guide = commandGuide('ให้ xp @boat');
    assert.deepEqual(filled(guide), ['ทำอะไร', 'สมาชิก']);
    assert.match(guide.next, /จำนวน XP/);
    guide = commandGuide('ให้ xp @boat 500');
    assert.match(guide.next, /เหตุผล/);
    guide = commandGuide('ให้ xp @boat 500 เพราะช่วยงาน');
    assert.deepEqual(filled(guide), ['ทำอะไร', 'สมาชิก', 'จำนวน XP', 'เหตุผล']);
    assert.equal(guide.next, null);
    // รีเซ็ตไม่มีขั้นจำนวน XP
    assert.deepEqual(
        commandGuide('รีเซ็ต xp @boat').steps.map((step) => step.label),
        ['ทำอะไร', 'สมาชิก', 'เหตุผล'],
    );
    assert.match(commandGuide('xp').next, /ให้ \/ หัก/);
    assert.match(commandGuide('log').next, /คำที่จะค้น/);
    assert.match(commandGuide('@').next, /ชื่อ/);
    // ค้นหาหน้าธรรมดาไม่ขึ้นคำแนะนำ
    for (const text of ['', 'ตั้งค่า', 'ให้', 'voice', 'log boat']) assert.equal(commandGuide(text), null, text);
});

const { parseDateTimeValue, buildDateTimeValue } = require('../apps/frontend/src/lib/date-time-value.ts');

test('date/time picker keeps the same string format as native inputs', () => {
    const { date, time } = parseDateTimeValue('2026-11-22T16:53', 'datetime');
    assert.equal(time, '16:53');
    assert.deepEqual([date.getFullYear(), date.getMonth(), date.getDate()], [2026, 10, 22]);
    assert.equal(buildDateTimeValue('datetime', date, time), '2026-11-22T16:53');
    assert.equal(buildDateTimeValue('date', parseDateTimeValue('2026-01-05', 'date').date, undefined), '2026-01-05');
    assert.equal(buildDateTimeValue('time', undefined, parseDateTimeValue('07:05', 'time').time), '07:05');
    // ค่าว่าง/ผิดรูปแบบ = ไม่มีวัน; datetime ที่ยังไม่มีเวลาใช้ 00:00
    assert.equal(parseDateTimeValue('', 'date').date, undefined);
    assert.equal(parseDateTimeValue('22/11/2026', 'date').date, undefined);
    assert.equal(buildDateTimeValue('datetime', new Date(2026, 0, 1), undefined), '2026-01-01T00:00');
    assert.equal(buildDateTimeValue('date', undefined, undefined), '');
});

const { translate, translateText, loadLang } = require('../apps/frontend/src/lib/i18n.ts');

test('i18n translates by key from locales/*.json, falls back to Thai, fills {params}', async () => {
    await loadLang('th'); // ภาษาไทยอยู่ใน bundle แล้ว ไม่ต้องโหลดอะไร
    assert.equal(translate('en', 'common.botSettings'), 'ตั้งค่าบอท'); // en.json ยังไม่โหลด → ภาษาไทย
    await loadLang('en');
    await loadLang('en'); // โหลดแล้วไม่โหลดซ้ำ
    assert.equal(translate('th', 'common.botSettings'), 'ตั้งค่าบอท');
    assert.equal(translate('en', 'common.botSettings'), 'Bot settings');
    assert.equal(translate('en', 'layout.countServers', { count: 3 }), '3 servers');
    assert.equal(translate('th', 'layout.countServers', { count: 3 }), '3 เซิร์ฟเวอร์');
    // ข้อความไทยตอนรันไทม์ (API / @notstack/shared) แปลผ่านพจนานุกรมเดียวกัน ไม่พบก็คืนข้อความเดิม
    assert.equal(translateText('en', 'ตั้งค่าบอท'), 'Bot settings');
    assert.equal(translateText('en', 'ข้อความที่ยังไม่แปล'), 'ข้อความที่ยังไม่แปล');
});

test('i18n splitRichText turns <b>/<code>/{slot} into tokens', () => {
    const { splitRichText } = require('../apps/frontend/src/lib/i18n.ts');
    assert.deepEqual(splitRichText('<b>ชื่อ:</b> ใช้ <code>guildId</code> และ {tos}.'), [
        { tag: 'b', text: 'ชื่อ:' },
        { tag: 'text', text: ' ใช้ ' },
        { tag: 'code', text: 'guildId' },
        { tag: 'text', text: ' และ ' },
        { tag: 'slot', name: 'tos' },
        { tag: 'text', text: '.' },
    ]);
    assert.deepEqual(splitRichText('ข้อความธรรมดา'), [{ tag: 'text', text: 'ข้อความธรรมดา' }]);
});

test('i18n keyByText prefers data.* keys, then the first key, for runtime Thai text', () => {
    const { keyByText } = require('../apps/frontend/src/lib/i18n.ts');
    const map = keyByText({ 'a.first': 'ซ้ำ', 'b.second': 'ซ้ำ', 'c.x': 'อื่น', 'data.y': 'อื่น' });
    assert.equal(map.get('ซ้ำ'), 'a.first');
    assert.equal(map.get('อื่น'), 'data.y');
});

test('i18n en.json only uses keys from th.json with the same {params}', () => {
    const th = require('../apps/frontend/src/locales/th.json');
    const en = require('../apps/frontend/src/locales/en.json');
    const params = (text) =>
        [...text.matchAll(/\{(\w+)\}/g)]
            .map((m) => m[1])
            .sort()
            .join();
    for (const [key, text] of Object.entries(en)) {
        assert.ok(key in th, `en.json has unknown key ${key}`);
        assert.equal(params(text), params(th[key]), `params differ for ${key}`);
    }
});

// document/localStorage จำลองแค่ส่วนที่ i18n.ts / use-theme.ts ใช้ (Node ไม่มี DOM)
function fakeBrowser(t, { storageThrows = false } = {}) {
    const classes = new Set();
    const stored = {};
    globalThis.document = {
        documentElement: { lang: 'th', classList: { contains: (c) => classes.has(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } },
    };
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            setItem: (k, v) => {
                if (storageThrows) throw new Error('storage disabled');
                stored[k] = v;
            },
        },
    });
    t.after(() => {
        delete globalThis.document;
        delete globalThis.localStorage;
    });
    return { classes, stored };
}
const React = require('../apps/frontend/node_modules/react');
const { renderToString } = require('../apps/frontend/node_modules/react-dom/server');
const renderHook = (hook) => renderToString(React.createElement(() => String(hook())));

test('i18n setLang switches the page language, remembers it and notifies listeners', async (t) => {
    const { setLang, tr, trText, dateLocale, byLang } = require('../apps/frontend/src/lib/i18n.ts');
    const { stored } = fakeBrowser(t);
    const label = byLang(() => ({ text: tr('common.botSettings') }));
    assert.equal(label().text, 'ตั้งค่าบอท');
    assert.equal(dateLocale(), 'th-TH');
    await setLang('en');
    assert.equal(globalThis.document.documentElement.lang, 'en');
    assert.equal(stored.lang, 'en');
    assert.equal(tr('common.botSettings'), 'Bot settings');
    assert.equal(trText('ตั้งค่าบอท'), 'Bot settings');
    assert.equal(label().text, 'Bot settings');
    assert.equal(label(), label()); // cache ต่อภาษา
    assert.equal(dateLocale(), 'en-GB');
});

test('i18n setLang still works when localStorage is blocked', async (t) => {
    const { setLang } = require('../apps/frontend/src/lib/i18n.ts');
    fakeBrowser(t, { storageThrows: true });
    await setLang('en');
    assert.equal(globalThis.document.documentElement.lang, 'en');
});

test('i18n translateFields only translates label fields of API data, and only in English', (t) => {
    const { translateFields } = require('../apps/frontend/src/lib/i18n.ts');
    fakeBrowser(t);
    const data = { label: 'ตั้งค่าบอท', name: 'ตั้งค่าบอท', items: [{ description: 'ตั้งค่าบอท' }, null], blob: new Blob(['x']), count: 2 };
    assert.equal(translateFields(data), data); // ภาษาไทย: คืนค่าเดิม
    globalThis.document.documentElement.lang = 'en';
    const out = translateFields(data);
    assert.deepEqual(
        { ...out, blob: undefined },
        { label: 'Bot settings', name: 'ตั้งค่าบอท', items: [{ description: 'Bot settings' }, null], blob: undefined, count: 2 },
    );
    assert.equal(out.blob, data.blob);
});

test('i18n useLang/useT render Thai on the server (no document yet)', () => {
    const { useLang, useT } = require('../apps/frontend/src/lib/i18n.ts');
    assert.equal(
        renderHook(() => useLang()[0]),
        'th',
    );
    assert.equal(
        renderHook(() => useT()('common.botSettings')),
        'ตั้งค่าบอท',
    );
});

test('theme: setTheme toggles dark/classic classes and remembers the choice', (t) => {
    const { setTheme, useTheme } = require('../apps/frontend/src/hooks/use-theme.ts');
    const { classes, stored } = fakeBrowser(t);
    setTheme('classic');
    assert.deepEqual([...classes].sort(), ['classic', 'dark']);
    setTheme('dark');
    assert.deepEqual([...classes], ['dark']);
    setTheme('light');
    assert.deepEqual([...classes], []);
    assert.equal(stored.theme, 'light');
    assert.equal(
        renderHook(() => useTheme()[0]),
        'light',
    );
});

test('theme: setTheme still applies when localStorage is blocked', (t) => {
    const { setTheme } = require('../apps/frontend/src/hooks/use-theme.ts');
    const { classes } = fakeBrowser(t, { storageThrows: true });
    setTheme('dark');
    assert.deepEqual([...classes], ['dark']);
});

test('sliding indicator follows the active item and cleans up its observers', (t) => {
    const { trackActiveItem, useSlidingIndicator } = require('../apps/frontend/src/hooks/use-sliding-indicator.ts');
    const observers = [];
    class FakeObserver {
        constructor(cb) {
            this.cb = cb;
            this.targets = [];
            observers.push(this);
        }
        observe(target) {
            this.targets.push(target);
        }
        disconnect() {
            this.disconnected = true;
        }
    }
    let frame;
    Object.assign(globalThis, {
        MutationObserver: FakeObserver,
        ResizeObserver: FakeObserver,
        requestAnimationFrame: (cb) => ((frame = cb), 7),
        cancelAnimationFrame: (id) => (frame = id === 7 ? null : frame),
    });
    t.after(() => ['MutationObserver', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame'].forEach((k) => delete globalThis[k]));

    const tab = (left, width) => ({ offsetLeft: left, offsetTop: 4, offsetWidth: width, offsetHeight: 28 });
    const items = [tab(4, 99), tab(103, 144)];
    let active = items[0];
    const list = { children: items, querySelector: (sel) => (assert.equal(sel, ':scope > [data-state="active"]'), active) };
    const pill = { style: {}, dataset: {} };

    const cleanup = trackActiveItem(list, pill, '[data-state="active"]');
    assert.deepEqual(pill.style, { opacity: '1', width: '99px', height: '28px', transform: 'translate(4px, 4px)' });
    assert.equal(pill.dataset.ready, undefined); // ตำแหน่งแรกไม่ animate
    frame();
    assert.equal(pill.dataset.ready, '');
    assert.deepEqual(observers[1].targets, [list, ...items]);

    active = items[1];
    observers[0].cb(); // data-state เปลี่ยน
    assert.equal(pill.style.transform, 'translate(103px, 4px)');
    assert.equal(pill.style.width, '144px');

    active = null;
    observers[1].cb();
    assert.equal(pill.style.opacity, '0');

    cleanup();
    assert.ok(observers.every((o) => o.disconnected));

    // render ฝั่ง server: ไม่มี DOM → คืน ref ว่าง ไม่ error
    assert.equal(
        renderHook(() => useSlidingIndicator('[data-state="on"]').listRef.current),
        'null',
    );
});

test('SEO prerender gives each public page its own head and crawlable body', () => {
    const { renderPageHtml } = require('../apps/frontend/src/lib/seo-prerender.ts');
    const html = fs.readFileSync(require.resolve('../apps/frontend/index.html'), 'utf8');
    const privacy = renderPageHtml(html, '/privacy');
    assert.match(privacy, /<link rel="canonical" href="https:\/\/bntdash\.arlifzs\.com\/privacy"/);
    assert.match(privacy, /<meta property="og:url" content="https:\/\/bntdash\.arlifzs\.com\/privacy"/);
    assert.match(privacy, /<title>นโยบายความเป็นส่วนตัว[^<]*<\/title>/);
    assert.match(privacy, /<div id="root"><main class="seo-prerender"><h1>นโยบายความเป็นส่วนตัว<\/h1>/);
    const home = renderPageHtml(html, '/');
    assert.match(home, /<h2>กันคนป่วน — /);
    assert.equal((home.match(/<h1>/g) ?? []).length, 1);
});

test('SEO build plugin rewrites index.html and emits one HTML file per public page', () => {
    const { seoPagesPlugin } = require('../apps/frontend/src/lib/seo-prerender.ts');
    const plugin = seoPagesPlugin();
    assert.equal(plugin.enforce, 'post');
    const html = fs.readFileSync(require.resolve('../apps/frontend/index.html'), 'utf8');
    const index = { type: 'asset', source: html };
    const emitted = {};
    plugin.generateBundle.call({ emitFile: (file) => (emitted[file.fileName] = file.source) }, {}, { 'index.html': index });
    assert.deepEqual(Object.keys(emitted).sort(), ['login.html', 'privacy.html', 'terms.html']);
    assert.match(index.source, /<link rel="canonical" href="https:\/\/bntdash\.arlifzs\.com\/"/);
    assert.match(emitted['terms.html'], /<link rel="canonical" href="https:\/\/bntdash\.arlifzs\.com\/terms"/);
    assert.match(emitted['login.html'], /<h1>เข้าสู่ระบบ Dashboard<\/h1>/);
    // no index.html in the bundle (e.g. library build) → nothing to do
    const none = {};
    plugin.generateBundle.call({ emitFile: () => assert.fail('should not emit') }, {}, none);
});

test('SEO prerender escapes HTML in page text', () => {
    const { renderPageHtml } = require('../apps/frontend/src/lib/seo-prerender.ts');
    const { PAGES } = require('../apps/frontend/src/lib/seo.ts');
    const original = PAGES['/terms'].title;
    PAGES['/terms'].title = 'A & <B> "C"';
    try {
        const out = renderPageHtml('<title>x</title><meta name="twitter:title" content="x" />', '/terms');
        assert.match(out, /<title>A &#38; &#60;B&#62; &#34;C&#34;<\/title>/);
        assert.match(out, /content="A &#38; &#60;B&#62; &#34;C&#34;"/);
    } finally {
        PAGES['/terms'].title = original;
    }
});

test('usePageMeta writes title, canonical and social tags for client-side navigation', () => {
    const { applyPageMeta } = require('../apps/frontend/src/hooks/use-page-meta.ts');
    const els = {
        'meta[name="description"]': {},
        'meta[property="og:title"]': {},
        'meta[property="og:url"]': {},
        'link[rel="canonical"]': {},
    };
    const doc = { title: '', querySelector: (selector) => els[selector] ?? null };
    applyPageMeta(doc, '/privacy');
    assert.match(doc.title, /^นโยบายความเป็นส่วนตัว/);
    assert.equal(els['meta[property="og:title"]'].content, doc.title);
    assert.match(els['meta[name="description"]'].content, /Bot_NotStack/);
    assert.equal(els['meta[property="og:url"]'].content, 'https://bntdash.arlifzs.com/privacy');
    assert.equal(els['link[rel="canonical"]'].href, 'https://bntdash.arlifzs.com/privacy');
    // a page without the optional tags must not throw
    applyPageMeta({ title: '', querySelector: () => null }, '/');
});
