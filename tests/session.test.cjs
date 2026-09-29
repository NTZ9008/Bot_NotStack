const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../apps/backend/node_modules/typescript');
// Only these dependency-free session helpers are loaded as TS for this Node test.
require.extensions['.ts'] = (module, filename) => {
    module._compile(
        ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
            .outputText,
        filename,
    );
};
const { QueryClient } = require('../apps/frontend/node_modules/@tanstack/react-query');
const { replaceSession } = require('../apps/frontend/src/lib/session.ts');
const { sessionRequests } = require('../apps/frontend/src/lib/session-state.ts');

test('session switch clears all private queries and aborts pending requests', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const oldSignal = sessionRequests.capture();
    client.setQueryData(['guild', 'old', 'detail'], { access: 'manage' });
    client.setQueryData(['admin', 'users'], [{ id: 1 }]);
    let complete;
    const pending = client
        .fetchQuery({
            queryKey: ['guild', 'old', 'secret'],
            queryFn: () =>
                new Promise((resolve) => {
                    complete = resolve;
                }),
        })
        .catch(() => null);
    replaceSession(client, { user: { id: 2 } });
    assert.equal(oldSignal.aborted, true);
    assert.equal(sessionRequests.capture().aborted, false);
    complete({ secret: 'old-account' });
    await pending;
    assert.equal(client.getQueryData(['guild', 'old', 'detail']), undefined);
    assert.equal(client.getQueryData(['admin', 'users']), undefined);
    assert.equal(client.getQueryData(['guild', 'old', 'secret']), undefined);
    assert.equal(client.getQueryData(['auth', 'me']).user.id, 2);
    client.clear();
});
test('session expiry clears mutation cache and auth state too', () => {
    const client = new QueryClient();
    client.setQueryData(['auth', 'me'], { user: { id: 1 } });
    client.getMutationCache().build(client, { mutationKey: ['old-user-edit'] });
    replaceSession(client, null);
    assert.equal(client.getMutationCache().getAll().length, 0);
    assert.equal(client.getQueryData(['auth', 'me']), null);
    client.clear();
});
