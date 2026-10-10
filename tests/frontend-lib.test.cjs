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
