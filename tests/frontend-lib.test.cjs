const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../apps/backend/node_modules/typescript');
// Only dependency-free helpers from the dashboard are loaded as TS for this Node test.
require.extensions['.ts'] = (module, filename) => {
    module._compile(
        ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
            .outputText,
        filename,
    );
};
const { escapeHtml, renderDiscordMarkdown } = require('../apps/frontend/src/lib/discord-markdown.ts');
const { formatBytes, formatMinutes } = require('../apps/frontend/src/lib/format.ts');

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

const { visibleNavGroups, findNavItem } = require('../apps/frontend/src/components/layout/nav-items.ts');
const navItems = (admin, access) => visibleNavGroups(admin, access ? { access } : null).flatMap((group) => group.items);

test('navigation keeps all existing features available to server managers and system admins', () => {
    const manager = navItems(false, 'manage');
    assert.deepEqual(
        manager
            .filter((item) => item.guild)
            .map((item) => item.to.split('/').pop())
            .sort(),
        ['audit-logs', 'config', 'funds', 'jira', 'levels', 'log-manager', 'news', 'overview', 'pr-bot', 'room-access', 'voice-guard', 'weather', 'welcome'],
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

const { schedulePreloads, canPreloadInBackground } = require('../apps/frontend/src/lib/background-preload.ts');

// Flush the promise continuation after each simulated timer tick.
const flushPreloads = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

test('background preload waits between pages and never overlaps pending work', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const calls = [];
    let finish;
    schedulePreloads(
        [
            () => {
                calls.push('first');
                return new Promise((resolve) => {
                    finish = resolve;
                });
            },
            async () => {
                calls.push('second');
            },
        ],
        new AbortController().signal,
    );
    assert.deepEqual(calls, []);
    t.mock.timers.tick(300);
    assert.deepEqual(calls, ['first']);
    t.mock.timers.tick(3000);
    assert.deepEqual(calls, ['first']);
    finish();
    await flushPreloads();
    t.mock.timers.tick(299);
    assert.deepEqual(calls, ['first']);
    t.mock.timers.tick(1);
    await flushPreloads();
    assert.deepEqual(calls, ['first', 'second']);
});

test('background preload pauses during navigation and resumes without dropping a page', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let ready = false;
    let calls = 0;
    schedulePreloads(
        [
            async () => {
                calls++;
            },
        ],
        new AbortController().signal,
        () => ready,
    );
    t.mock.timers.tick(300);
    assert.equal(calls, 0);
    ready = true;
    t.mock.timers.tick(300);
    await flushPreloads();
    assert.equal(calls, 1);
});

test('a failed speculative load does not prevent the next page from warming', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let calls = 0;
    schedulePreloads(
        [
            async () => {
                throw new Error('offline');
            },
            async () => {
                calls++;
            },
        ],
        new AbortController().signal,
    );
    t.mock.timers.tick(300);
    await flushPreloads();
    t.mock.timers.tick(300);
    await flushPreloads();
    assert.equal(calls, 1);
});

for (const cancel of ['session change', 'unmount']) {
    test(`background preload stops queued work on ${cancel}, even after an in-flight load resolves`, async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        const controller = new AbortController();
        let finish;
        let calls = 0;
        const stop = schedulePreloads(
            [
                () =>
                    new Promise((resolve) => {
                        finish = resolve;
                    }),
                async () => {
                    calls++;
                },
            ],
            controller.signal,
        );
        t.mock.timers.tick(300);
        if (cancel === 'session change') controller.abort();
        else stop();
        finish();
        await flushPreloads();
        t.mock.timers.tick(3000);
        assert.equal(calls, 0);
    });
}

test('an already expired session never starts a preload', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let calls = 0;
    schedulePreloads(
        [
            async () => {
                calls++;
            },
        ],
        AbortSignal.abort(),
    );
    t.mock.timers.tick(3000);
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
