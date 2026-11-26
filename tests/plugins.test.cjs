const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const req = createRequire(require('node:path').resolve('apps/backend/package.json'));
req('reflect-metadata');
const { HttpStatus } = req('@nestjs/common');
const { Reflector } = req('@nestjs/core');
const { MessageFlags } = req('discord.js');
const {
    PLUGIN_BOT_DISABLED_MESSAGE,
    PLUGIN_IDS,
    PLUGIN_NOT_INSTALLED_CODE,
    PLUGIN_REGISTRY,
    isPluginId,
} = req('@notstack/shared');

const { PluginsService } = require('../apps/backend/dist/plugins/plugins.service');
const { PluginGuard } = require('../apps/backend/dist/plugins/guards/plugin.guard');
const { RequirePlugin } = require('../apps/backend/dist/plugins/decorators/require-plugin.decorator');
const { GithubWebhookController } = require('../apps/backend/dist/pr-bot/controllers/github-webhook.controller');
const { GrafanaWebhookController } = require('../apps/backend/dist/grafana/grafana-webhook.controller');
const { InteractionListener } = require('../apps/backend/dist/commands/listeners/interaction.listener');
const { GrafanaCommand } = require('../apps/backend/dist/commands/slash/grafana.command');
const { HelpCommand } = require('../apps/backend/dist/commands/slash/help.command');
const { JiraInteractionListener } = require('../apps/backend/dist/jira/listeners/jira-interaction.listener');
const { JIRA_IDS } = require('../apps/backend/dist/jira/utils/jira.messages');

const GUILD_A = '11111111111111111';
const HOME_GUILD = '99999999999999999';

function createGuildPluginPrisma(initialRows = []) {
    // Store composite key guildId:pluginId -> { guildId, pluginId, enabled, installedAt, installedBy }
    const rows = new Map(
        initialRows.map((row) => [
            `${row.guildId}:${row.pluginId}`,
            {
                installedAt: row.installedAt ?? new Date('2026-01-01T00:00:00.000Z'),
                installedBy: row.installedBy ?? 'admin',
                ...row,
            },
        ]),
    );
    let findManyCalls = 0;

    return {
        rows,
        get findManyCalls() {
            return findManyCalls;
        },
        guildPlugin: {
            async findMany({ where } = {}) {
                findManyCalls += 1;
                const result = [];
                for (const row of rows.values()) {
                    if (where?.guildId && row.guildId !== where.guildId) continue;
                    if (where?.enabled !== undefined && row.enabled !== where.enabled) continue;
                    result.push({ ...row });
                }
                return result;
            },
            async upsert({ where, create, update }) {
                const { guildId, pluginId } = where.guildId_pluginId;
                const key = `${guildId}:${pluginId}`;
                const existing = rows.get(key);
                const next = existing
                    ? { ...existing, ...update }
                    : { installedAt: new Date(), installedBy: null, ...create };
                rows.set(key, next);
                return next;
            },
            async createMany({ data, skipDuplicates }) {
                let count = 0;
                for (const item of data) {
                    const key = `${item.guildId}:${item.pluginId}`;
                    if (skipDuplicates && rows.has(key)) continue;
                    rows.set(key, { installedAt: new Date(), ...item });
                    count += 1;
                }
                return { count };
            },
        },
        config: { findMany: async () => [] },
        prMessage: { findMany: async () => [] },
        prNotification: { findMany: async () => [] },
        jiraSetting: { findMany: async () => [] },
        jiraTicket: { findMany: async () => [] },
        fundTopic: { findMany: async () => [] },
    };
}

function createPluginsService(prisma, homeGuildId = HOME_GUILD, envMap = {}) {
    const config = { get: (key) => envMap[key] };
    return new PluginsService(prisma, { homeGuildId }, config);
}

function createMockResponse() {
    return {
        statusCode: 200,
        body: undefined,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
        sendStatus(code) {
            this.statusCode = code;
            return this;
        },
    };
}

test('shared plugin registry exposes all 7 plugins, metadata, and Thai bot disable message', () => {
    assert.deepEqual([...PLUGIN_IDS], ['github-pr', 'grafana-alert', 'jira-card', 'savings-goal', 'uptime-monitor', 'scheduled-reminders', 'reaction-roles']);
    assert.equal(PLUGIN_REGISTRY.length, 7);
    for (const def of PLUGIN_REGISTRY) {
        assert.equal(isPluginId(def.id), true);
        assert.ok(def.name.length > 0);
        assert.ok(def.description.length > 0);
        assert.ok(def.icon.length > 0);
        assert.ok(def.category.length > 0);
        assert.ok(def.version.length > 0);
        assert.ok(def.routePath.startsWith('/servers/$guildId/'));
    }
    assert.equal(isPluginId('unknown-plugin'), false);
    assert.equal(isPluginId(null), false);
    assert.equal(PLUGIN_NOT_INSTALLED_CODE, 'PLUGIN_NOT_INSTALLED');
    assert.equal(PLUGIN_BOT_DISABLED_MESSAGE, 'ฟีเจอร์นี้ยังไม่ถูกเปิดใช้งาน กรุณาติดตั้งปลั๊กอินผ่าน Dashboard ก่อน');
});

test('PluginsService manages install/uninstall, caches active ids, and enforces 403/404 errors', async () => {
    const prisma = createGuildPluginPrisma();
    const service = createPluginsService(prisma);

    const initial = await service.list(GUILD_A);
    assert.equal(initial.guildId, GUILD_A);
    assert.deepEqual(initial.installedIds, []);
    assert.equal(initial.plugins.every((p) => p.installed === false && p.enabled === false), true);

    await assert.rejects(
        () => service.assertInstalled(GUILD_A, 'github-pr'),
        (err) => err.getStatus?.() === HttpStatus.FORBIDDEN && err.getResponse?.().code === PLUGIN_NOT_INSTALLED_CODE,
    );

    // Warm cache check: repeat queries reuse 60s TTL cache without hitting Prisma again
    const callsAfterFirstCheck = prisma.findManyCalls;
    assert.equal(await service.isInstalled(GUILD_A, 'github-pr'), false);
    assert.equal(prisma.findManyCalls, callsAfterFirstCheck);

    // Unknown plugin IDs must return 404 NotFound
    await assert.rejects(() => service.install(GUILD_A, 'does-not-exist', 'admin'), (err) => err.getStatus?.() === HttpStatus.NOT_FOUND);
    await assert.rejects(() => service.uninstall(GUILD_A, 'does-not-exist'), (err) => err.getStatus?.() === HttpStatus.NOT_FOUND);

    // Install must persist row, invalidate cache, and return installed status
    const installed = await service.install(GUILD_A, 'github-pr', 'boat');
    assert.deepEqual(installed.installedIds, ['github-pr']);
    const ghState = installed.plugins.find((p) => p.id === 'github-pr');
    assert.equal(ghState.installed, true);
    assert.equal(ghState.installedBy, 'boat');
    assert.equal(await service.isInstalled(GUILD_A, 'github-pr'), true);
    await service.assertInstalled(GUILD_A, 'github-pr');

    // Uninstall keeps row (enabled: false), invalidates cache, and blocks access again
    const afterUninstall = await service.uninstall(GUILD_A, 'github-pr');
    assert.deepEqual(afterUninstall.installedIds, []);
    assert.equal(prisma.rows.get(`${GUILD_A}:github-pr`).enabled, false);
    assert.equal(await service.isInstalled(GUILD_A, 'github-pr'), false);
});

test('PluginsService ensureLegacyInstallations backfills configured guilds without overwriting explicit uninstalls', async () => {
    const guildPr = '22222222222222222';
    const guildGrafana = '33333333333333333';
    const guildJira = '44444444444444444';
    const guildFunds = '55555555555555555';

    // Simulate grafana-alert previously uninstalled explicitly in guildGrafana (enabled: false)
    const prisma = createGuildPluginPrisma([{ guildId: guildGrafana, pluginId: 'grafana-alert', enabled: false, installedBy: null }]);
    prisma.config.findMany = async () => [
        { guildId: guildPr, key: 'PR_DEFAULT_CHANNEL_ID', value: '88888888888888888' },
        { guildId: '66666666666666666', key: 'PR_ORG_CHANNEL_MAP', value: '{}' }, // empty JSON must be ignored
        { guildId: guildGrafana, key: 'GRAFANA_CHANNEL_ID', value: '77777777777777777' },
    ];
    prisma.prMessage.findMany = async () => [{ guildId: guildPr }];
    prisma.prNotification.findMany = async () => [
        { guildId: guildPr, kind: 'merged' },
        { guildId: guildGrafana, kind: 'grafana_firing' },
    ];
    prisma.jiraSetting.findMany = async () => [{ guildId: guildJira }];
    prisma.jiraTicket.findMany = async () => [{ guildId: guildJira }];
    prisma.fundTopic.findMany = async () => [{ guildId: guildFunds }];

    const service = createPluginsService(prisma, HOME_GUILD, { GITHUB_WEBHOOK_SECRET: 'home-secret' });
    const insertedCount = await service.ensureLegacyInstallations();

    assert.equal(insertedCount, 4); // guildPr:github-pr, guildJira:jira-card, guildFunds:savings-goal, HOME_GUILD:github-pr
    assert.equal(await service.isInstalled(guildPr, 'github-pr'), true);
    assert.equal(await service.isInstalled(guildJira, 'jira-card'), true);
    assert.equal(await service.isInstalled(guildFunds, 'savings-goal'), true);
    assert.equal(await service.isInstalled(HOME_GUILD, 'github-pr'), true);
    assert.equal(await service.isInstalled('66666666666666666', 'github-pr'), false);
    // Explicit uninstall row must NOT be re-enabled
    assert.equal(await service.isInstalled(guildGrafana, 'grafana-alert'), false);
    assert.equal(prisma.rows.get(`${guildGrafana}:grafana-alert`).enabled, false);
});

test('PluginGuard enforces @RequirePlugin metadata, validates guildId snowflake, and falls back to homeGuildId', async () => {
    const prisma = createGuildPluginPrisma([{ guildId: HOME_GUILD, pluginId: 'grafana-alert', enabled: true }]);
    const plugins = createPluginsService(prisma);
    const guard = new PluginGuard(new Reflector(), plugins, { homeGuildId: HOME_GUILD });

    class ControllerStub {
        open() {}
        guarded() {}
    }
    RequirePlugin('github-pr')(ControllerStub.prototype, 'guarded', Object.getOwnPropertyDescriptor(ControllerStub.prototype, 'guarded'));

    const mkCtx = (method, params) => ({
        getClass: () => ControllerStub,
        getHandler: () => ControllerStub.prototype[method],
        switchToHttp: () => ({ getRequest: () => ({ params }) }),
    });

    assert.equal(await guard.canActivate(mkCtx('open', { guildId: GUILD_A })), true);

    await assert.rejects(
        () => guard.canActivate(mkCtx('guarded', { guildId: 'not-a-snowflake' })),
        (err) => err.getStatus?.() === HttpStatus.NOT_FOUND,
    );

    await assert.rejects(
        () => guard.canActivate(mkCtx('guarded', { guildId: GUILD_A })),
        (err) => err.getStatus?.() === HttpStatus.FORBIDDEN && err.getResponse?.().code === PLUGIN_NOT_INSTALLED_CODE,
    );

    await plugins.install(GUILD_A, 'github-pr', 'admin');
    assert.equal(await guard.canActivate(mkCtx('guarded', { guildId: GUILD_A })), true);

    // Route without :guildId falls back to homeGuildId
    RequirePlugin('grafana-alert')(ControllerStub.prototype, 'guarded', Object.getOwnPropertyDescriptor(ControllerStub.prototype, 'guarded'));
    assert.equal(await guard.canActivate(mkCtx('guarded', {})), true);
});

test('Webhook controllers reject requests with 403 and stop processing when plugin is not installed', async () => {
    const prisma = createGuildPluginPrisma();
    const plugins = createPluginsService(prisma);

    let githubVerifyCalled = false;
    let queueCalled = false;
    const githubCtrl = new GithubWebhookController(
        {
            homeGuildId: HOME_GUILD,
            async verifySignature() {
                githubVerifyCalled = true;
                return true;
            },
        },
        {
            enqueue() {
                queueCalled = true;
            },
        },
        plugins,
    );

    const ghRes = createMockResponse();
    await githubCtrl.guild(GUILD_A, Buffer.from('{}'), 'sha256=abc', 'pull_request', 'del-1', ghRes);
    assert.equal(ghRes.statusCode, HttpStatus.FORBIDDEN);
    assert.equal(ghRes.body.code, PLUGIN_NOT_INSTALLED_CODE);
    assert.equal(ghRes.body.pluginId, 'github-pr');
    assert.equal(githubVerifyCalled, false);
    assert.equal(queueCalled, false);

    let grafanaHandleCalled = false;
    const grafanaCtrl = new GrafanaWebhookController(
        {
            homeGuildId: HOME_GUILD,
            async handleWebhook() {
                grafanaHandleCalled = true;
                return { status: 200, body: { ok: true } };
            },
        },
        plugins,
    );

    const gfRes = createMockResponse();
    await grafanaCtrl.guild(GUILD_A, { alerts: [] }, 'Bearer token', gfRes);
    assert.equal(gfRes.statusCode, HttpStatus.FORBIDDEN);
    assert.equal(gfRes.body.code, PLUGIN_NOT_INSTALLED_CODE);
    assert.equal(gfRes.body.pluginId, 'grafana-alert');
    assert.equal(grafanaHandleCalled, false);
});

test('Discord Bot guards slash commands, HelpCommand listing, and Jira component interactions per guild', async () => {
    assert.equal(GrafanaCommand.pluginId, 'grafana-alert');

    const prisma = createGuildPluginPrisma();
    const plugins = createPluginsService(prisma);

    let grafanaExecuted = 0;
    let pingExecuted = 0;
    const commands = new Map([
        [
            'grafana',
            {
                name: 'grafana',
                homeGuildOnly: false,
                pluginId: 'grafana-alert',
                data: { toJSON: () => ({ name: 'grafana', description: 'Check Grafana alerts' }) },
                handler: { execute: async () => (grafanaExecuted += 1) },
            },
        ],
        [
            'ping',
            {
                name: 'ping',
                homeGuildOnly: false,
                pluginId: undefined,
                data: { toJSON: () => ({ name: 'ping', description: 'Check latency' }) },
                handler: { execute: async () => (pingExecuted += 1) },
            },
        ],
    ]);
    const explorer = { commands, buttons: new Map(), selectMenus: new Map(), modals: new Map() };
    const discord = { isHome: (guildId) => guildId === HOME_GUILD };
    const logs = { recordActivity: async () => {} };
    const levels = { award: async () => {} };

    const listener = new InteractionListener(explorer, discord, logs, levels, plugins);
    const replies = [];
    const mkSlashInteraction = (commandName) => ({
        commandName,
        guildId: GUILD_A,
        channelId: '999',
        user: { id: 'u1', username: 'boat', bot: false },
        inCachedGuild: () => false,
        isChatInputCommand: () => true,
        isRepliable: () => true,
        isButton: () => false,
        isStringSelectMenu: () => false,
        isModalSubmit: () => false,
        reply: async (payload) => {
            replies.push(payload);
        },
    });

    // 1) Plugin slash command blocked ephemerally when uninstalled
    await listener.onInteraction(mkSlashInteraction('grafana'));
    assert.equal(grafanaExecuted, 0);
    assert.deepEqual(replies[0], {
        content: PLUGIN_BOT_DISABLED_MESSAGE,
        flags: MessageFlags.Ephemeral,
    });

    // 2) Core command executes even with 0 plugins installed
    await listener.onInteraction(mkSlashInteraction('ping'));
    assert.equal(pingExecuted, 1);

    // 3) HelpCommand hides uninstalled plugin commands, then shows them after install
    const helpCmd = new HelpCommand(explorer, discord, plugins);
    const helpReplies = [];
    const mkHelpInteraction = () => ({
        guildId: GUILD_A,
        user: { username: 'boat' },
        reply: async (payload) => {
            helpReplies.push(payload);
        },
    });

    await helpCmd.execute(mkHelpInteraction());
    const embedBefore = helpReplies[0].embeds[0].toJSON();
    assert.deepEqual(embedBefore.fields.map((f) => f.name), ['/ping']);

    await plugins.install(GUILD_A, 'grafana-alert', 'boat');
    await listener.onInteraction(mkSlashInteraction('grafana'));
    assert.equal(grafanaExecuted, 1);

    await helpCmd.execute(mkHelpInteraction());
    const embedAfter = helpReplies[1].embeds[0].toJSON();
    assert.deepEqual(embedAfter.fields.map((f) => f.name), ['/grafana', '/ping']);

    // 4) Jira component interactions reply ephemerally with PLUGIN_BOT_DISABLED_MESSAGE when uninstalled
    let jiraSettingsLookedUp = false;
    const jiraListener = new JiraInteractionListener(
        {
            async getSettings() {
                jiraSettingsLookedUp = true;
                return { enabled: true };
            },
        },
        {},
        prisma,
        plugins,
    );
    const jiraReplies = [];
    await jiraListener.onInteraction({
        customId: JIRA_IDS.open,
        guildId: GUILD_A,
        isButton: () => true,
        isModalSubmit: () => false,
        inCachedGuild: () => true,
        isRepliable: () => true,
        reply: async (payload) => {
            jiraReplies.push(payload);
        },
    });
    assert.equal(jiraSettingsLookedUp, false);
    assert.deepEqual(jiraReplies[0], {
        content: PLUGIN_BOT_DISABLED_MESSAGE,
        flags: MessageFlags.Ephemeral,
    });
});
