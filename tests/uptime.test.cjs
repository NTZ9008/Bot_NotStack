const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const req = createRequire(require('node:path').resolve('apps/backend/package.json'));
req('reflect-metadata');
const { uptimeTargetInputSchema, updateUptimeTargetSchema, UPTIME_LIMITS } = req('@notstack/shared');

const { isForbiddenIp, assertSafeExternalUrl, probeExternalUrl, SsrfBlockedError } = require('../apps/backend/dist/common/utils/ssrf-guard');
const { UptimeService } = require('../apps/backend/dist/uptime/uptime.service');
const { UptimeMonitorTask } = require('../apps/backend/dist/uptime/tasks/uptime-monitor.task');

const GUILD_A = '11111111111111111';
const GUILD_B = '22222222222222222';
const CHANNEL_A = '33333333333333333';
const ROLE_A = '44444444444444444';

function createUptimePrisma() {
    let nextId = 1;
    let nextLogId = 1;
    const targets = [];
    const logs = [];

    return {
        targets,
        logs,
        $transaction: async (ops) => Promise.all(ops),
        uptimeTarget: {
            async findMany({ where, orderBy, take } = {}) {
                let items = targets.filter((t) => {
                    if (where?.guildId && t.guildId !== where.guildId) return false;
                    if (where?.enabled !== undefined && t.enabled !== where.enabled) return false;
                    if (where?.nextCheckAt?.lte && t.nextCheckAt.getTime() > where.nextCheckAt.lte.getTime()) return false;
                    return true;
                });
                if (orderBy) {
                    items = [...items].sort((a, b) => a.id - b.id);
                }
                if (take) items = items.slice(0, take);
                return items.map((t) => ({ ...t }));
            },
            async findFirst({ where }) {
                const found = targets.find((t) => (!where?.id || t.id === where.id) && (!where?.guildId || t.guildId === where.guildId));
                return found ? { ...found } : null;
            },
            async count({ where }) {
                return targets.filter((t) => (!where?.guildId || t.guildId === where.guildId)).length;
            },
            async create({ data }) {
                const now = new Date();
                const row = {
                    id: nextId++,
                    guildId: data.guildId,
                    name: data.name,
                    url: data.url,
                    intervalMinutes: data.intervalMinutes,
                    channelId: data.channelId,
                    mentionRoleId: data.mentionRoleId ?? null,
                    enabled: data.enabled ?? true,
                    lastStatus: data.lastStatus ?? 'UNKNOWN',
                    lastStatusCode: data.lastStatusCode ?? null,
                    lastLatencyMs: data.lastLatencyMs ?? null,
                    lastCheckedAt: data.lastCheckedAt ?? null,
                    nextCheckAt: data.nextCheckAt ?? now,
                    createdAt: now,
                    updatedAt: now,
                };
                targets.push(row);
                return { ...row };
            },
            async update({ where, data }) {
                const row = targets.find((t) => t.id === where.id);
                if (!row) throw new Error('Not found');
                Object.assign(row, data, { updatedAt: new Date() });
                return { ...row };
            },
            async delete({ where }) {
                const idx = targets.findIndex((t) => t.id === where.id);
                if (idx >= 0) targets.splice(idx, 1);
                for (let i = logs.length - 1; i >= 0; i--) {
                    if (logs[i].targetId === where.id) logs.splice(i, 1);
                }
                return {};
            },
        },
        uptimeCheckLog: {
            async create({ data }) {
                const row = {
                    id: nextLogId++,
                    targetId: data.targetId,
                    status: data.status,
                    statusCode: data.statusCode ?? null,
                    latencyMs: data.latencyMs ?? null,
                    error: data.error ?? null,
                    checkedAt: data.checkedAt ?? new Date(),
                };
                logs.push(row);
                return { ...row };
            },
            async findMany({ where } = {}) {
                return logs
                    .filter((l) => {
                        if (where?.targetId?.in && !where.targetId.in.includes(l.targetId)) return false;
                        if (typeof where?.targetId === 'number' && l.targetId !== where.targetId) return false;
                        if (where?.checkedAt?.gte && l.checkedAt.getTime() < where.checkedAt.gte.getTime()) return false;
                        return true;
                    })
                    .sort((a, b) => a.checkedAt.getTime() - b.checkedAt.getTime())
                    .map((l) => ({ ...l }));
            },
            async deleteMany({ where }) {
                const cutoff = where?.checkedAt?.lt?.getTime();
                let count = 0;
                for (let i = logs.length - 1; i >= 0; i--) {
                    if (cutoff === undefined || logs[i].checkedAt.getTime() < cutoff) {
                        logs.splice(i, 1);
                        count += 1;
                    }
                }
                return { count };
            },
        },
    };
}

test('SSRF guard blocks localhost, loopback, link-local, private IPv4/IPv6, mapped IPv6, and rebinding DNS targets', async () => {
    const blockedIps = [
        '127.0.0.1',
        '127.0.1.1',
        '0.0.0.0',
        '10.0.0.1',
        '100.64.0.1',
        '169.254.169.254',
        '172.16.0.1',
        '172.31.255.254',
        '192.168.1.1',
        '224.0.0.1',
        '255.255.255.255',
        '::',
        '::1',
        'fe80::1',
        'fe80::1%eth0',
        'fc00::1',
        'fd12:3456::1',
        'ff02::1',
        '::ffff:127.0.0.1',
        '::ffff:169.254.169.254',
        '::ffff:10.0.0.5',
    ];
    for (const ip of blockedIps) {
        assert.equal(isForbiddenIp(ip), true, `Expected IP ${ip} to be forbidden`);
    }

    assert.equal(isForbiddenIp('8.8.8.8'), false);
    assert.equal(isForbiddenIp('1.1.1.1'), false);
    assert.equal(isForbiddenIp('2606:4700:4700::1111'), false);

    const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
    await assert.rejects(() => assertSafeExternalUrl('http://localhost:3000/health', publicLookup), SsrfBlockedError);
    await assert.rejects(() => assertSafeExternalUrl('http://api.localhost/health', publicLookup), SsrfBlockedError);
    await assert.rejects(() => assertSafeExternalUrl('http://127.0.0.1:8080', publicLookup), SsrfBlockedError);
    await assert.rejects(() => assertSafeExternalUrl('http://169.254.169.254/latest/meta-data/', publicLookup), SsrfBlockedError);
    await assert.rejects(() => assertSafeExternalUrl('http://[::1]/', publicLookup), SsrfBlockedError);
    await assert.rejects(() => assertSafeExternalUrl('file:///etc/passwd', publicLookup), SsrfBlockedError);
    await assert.rejects(() => assertSafeExternalUrl('https://user:pass@example.com/', publicLookup), SsrfBlockedError);

    // Domain whose DNS resolves to a private IP must be blocked without invoking fetch
    let fetchInvoked = false;
    const rebindResult = await probeExternalUrl('https://rebind.example.com/health', {
        lookupImpl: async () => [{ address: '10.0.0.42', family: 4 }],
        fetchImpl: async () => {
            fetchInvoked = true;
            return new Response('ok', { status: 200 });
        },
    });
    assert.equal(fetchInvoked, false);
    assert.equal(rebindResult.status, 'DOWN');
    assert.equal(rebindResult.statusCode, null);

    // Public target passes SSRF check and calls fetch with redirect: 'manual'
    let receivedInit;
    const okResult = await probeExternalUrl('https://example.com/health', {
        lookupImpl: publicLookup,
        fetchImpl: async (_url, init) => {
            receivedInit = init;
            return new Response(null, { status: 204 });
        },
    });
    assert.equal(receivedInit.redirect, 'manual');
    assert.equal(okResult.status, 'UP');
    assert.equal(okResult.statusCode, 204);
    assert.equal(okResult.error, null);
});

test('shared uptime Zod schemas validate intervals, URLs, channels, and mentionRoleId normalization', () => {
    const valid = uptimeTargetInputSchema.parse({
        name: ' Main API ',
        url: 'https://api.example.com/health',
        intervalMinutes: 5,
        channelId: CHANNEL_A,
        mentionRoleId: '',
    });
    assert.equal(valid.name, 'Main API');
    assert.equal(valid.mentionRoleId, null);

    assert.equal(uptimeTargetInputSchema.safeParse({ name: 'X', url: 'ftp://example.com', intervalMinutes: 5, channelId: CHANNEL_A }).success, false);
    assert.equal(uptimeTargetInputSchema.safeParse({ name: 'X', url: 'https://example.com', intervalMinutes: 3, channelId: CHANNEL_A }).success, false);
    assert.equal(updateUptimeTargetSchema.safeParse({}).success, false);
});

test('UptimeService enforces SSRF on create/update, sends Discord alerts only on status transitions, and prunes old logs', async () => {
    const prisma = createUptimePrisma();
    const sentMessages = [];
    const fakeChannel = {
        guildId: GUILD_A,
        isSendable: () => true,
        async send(payload) {
            sentMessages.push(payload);
        },
    };
    const discord = {
        ready: {},
        async fetchGuildChannel(guildId, channelId) {
            return guildId === GUILD_A && channelId === CHANNEL_A ? fakeChannel : null;
        },
    };

    const service = new UptimeService(prisma, discord);
    service.lookupImpl = async () => [{ address: '93.184.216.34', family: 4 }];

    await assert.rejects(
        () =>
            service.create(GUILD_A, {
                name: 'Internal DB',
                url: 'http://192.168.1.10/status',
                intervalMinutes: 1,
                channelId: CHANNEL_A,
                mentionRoleId: null,
            }),
        (err) => err.getStatus?.() === 400,
    );

    const target = await service.create(GUILD_A, {
        name: 'Public API',
        url: 'https://api.example.com/health',
        intervalMinutes: 5,
        channelId: CHANNEL_A,
        mentionRoleId: ROLE_A,
    });
    assert.equal(target.lastStatus, 'UNKNOWN');

    // Mock probe outcomes in sequence: UP -> UP -> DOWN -> DOWN -> UP
    const responses = [200, 200, 503, 500, 200];
    let idx = 0;
    service.fetchImpl = async () => new Response('body', { status: responses[idx++] });

    // UNKNOWN -> UP (initial): must NOT alert
    await service.executeCheck(prisma.targets[0]);
    assert.equal(sentMessages.length, 0);

    // UP -> UP: must NOT alert
    await service.executeCheck(prisma.targets[0]);
    assert.equal(sentMessages.length, 0);

    // UP -> DOWN: MUST alert with role mention
    await service.executeCheck(prisma.targets[0]);
    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0].content, `<@&${ROLE_A}>`);
    assert.deepEqual(sentMessages[0].allowedMentions, { roles: [ROLE_A] });

    // DOWN -> DOWN: must NOT spam repeat alert
    await service.executeCheck(prisma.targets[0]);
    assert.equal(sentMessages.length, 1);

    // DOWN -> UP (recovery): MUST alert
    await service.executeCheck(prisma.targets[0]);
    assert.equal(sentMessages.length, 2);

    const overview = await service.list(GUILD_A);
    assert.equal(overview.summary.upCount, 1);
    assert.equal(overview.targets[0].checks24hCount, 5);
    assert.equal(overview.targets[0].up24hCount, 3);
    assert.equal(overview.targets[0].uptime24hPercent, 60);

    const detail = await service.detail(GUILD_A, target.id);
    assert.equal(detail.series24h.length, 5);

    // Old logs beyond retention window are deleted by pruneOldLogs
    prisma.logs[0].checkedAt = new Date(Date.now() - (UPTIME_LIMITS.retentionHours + 2) * 3600_000);
    const pruned = await service.pruneOldLogs();
    assert.equal(pruned, 1);
    assert.equal(prisma.logs.length, 4);
});

test('UptimeMonitorTask checks due targets concurrently only for guilds with uptime-monitor plugin installed', async () => {
    const prisma = createUptimePrisma();
    const past = new Date(Date.now() - 1000);
    await prisma.uptimeTarget.create({
        data: { guildId: GUILD_A, name: 'Enabled & Installed', url: 'https://a.example.com', intervalMinutes: 1, channelId: CHANNEL_A, nextCheckAt: past },
    });
    await prisma.uptimeTarget.create({
        data: { guildId: GUILD_B, name: 'Plugin Uninstalled', url: 'https://b.example.com', intervalMinutes: 1, channelId: CHANNEL_A, nextCheckAt: past },
    });
    await prisma.uptimeTarget.create({
        data: { guildId: GUILD_A, name: 'Future Target', url: 'https://c.example.com', intervalMinutes: 5, channelId: CHANNEL_A, nextCheckAt: new Date(Date.now() + 300_000) },
    });

    const checkedIds = [];
    const uptimeStub = {
        async executeCheck(target) {
            checkedIds.push(target.id);
        },
        async pruneOldLogs() {
            return 0;
        },
    };
    const pluginsStub = {
        async isInstalled(guildId, pluginId) {
            return guildId === GUILD_A && pluginId === 'uptime-monitor';
        },
    };

    const task = new UptimeMonitorTask(prisma, uptimeStub, pluginsStub);
    await task.tick();

    assert.deepEqual(checkedIds, [1]);
});
