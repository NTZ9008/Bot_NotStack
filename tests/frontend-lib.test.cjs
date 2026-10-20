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
