const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const req = createRequire(require('node:path').resolve('apps/backend/package.json'));
req('reflect-metadata');
const { MessageFlags, PermissionFlagsBits } = req('discord.js');
const {
    PLUGIN_BOT_DISABLED_MESSAGE,
    isValidDiscordEmoji,
    reactionRoleItemInputSchema,
    reactionRolePanelInputSchema,
    updateReactionRoleItemSchema,
    updateReactionRolePanelSchema,
} = req('@notstack/shared');

const {
    buildReactionRolePanelPayload,
    parseReactionRoleCustomId,
    RR_IDS,
} = require('../apps/backend/dist/reaction-roles/utils/reaction-roles.messages');
const { ReactionRolesService } = require('../apps/backend/dist/reaction-roles/reaction-roles.service');
const { ReactionRoleInteractionListener } = require('../apps/backend/dist/reaction-roles/listeners/reaction-role-interaction.listener');

const GUILD_A = '11111111111111111';
const CHANNEL_A = '22222222222222222';
const CHANNEL_B = '33333333333333333';
const ROLE_1 = '44444444444444441';
const ROLE_2 = '44444444444444442';
const ROLE_HIGH = '44444444444444449';

function createReactionRolesPrisma() {
    let nextPanelId = 1;
    let nextItemId = 1;
    const panels = [];
    const items = [];

    const withItems = (panel) => ({
        ...panel,
        items: items
            .filter((i) => i.panelId === panel.id)
            .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
            .map((i) => ({ ...i })),
    });

    const client = {
        panels,
        items,
        $transaction: async (fnOrOps) => (typeof fnOrOps === 'function' ? fnOrOps(client) : Promise.all(fnOrOps)),
        reactionRolePanel: {
            async findMany({ where, orderBy } = {}) {
                let res = panels.filter((p) => !where?.guildId || p.guildId === where.guildId);
                if (orderBy) res = [...res].sort((a, b) => a.id - b.id);
                return res.map(withItems);
            },
            async findFirst({ where }) {
                const found = panels.find((p) => (!where?.id || p.id === where.id) && (!where?.guildId || p.guildId === where.guildId));
                return found ? withItems(found) : null;
            },
            async count({ where }) {
                return panels.filter((p) => !where?.guildId || p.guildId === where.guildId).length;
            },
            async create({ data }) {
                const now = new Date();
                const panel = {
                    id: nextPanelId++,
                    guildId: data.guildId,
                    channelId: data.channelId,
                    messageId: data.messageId ?? null,
                    title: data.title,
                    description: data.description ?? '',
                    embedColor: data.embedColor ?? '#5865f2',
                    mode: data.mode ?? 'BUTTON',
                    allowMultiple: data.allowMultiple ?? true,
                    createdAt: now,
                    updatedAt: now,
                };
                panels.push(panel);
                for (const itemData of data.items?.create ?? []) {
                    items.push({
                        id: nextItemId++,
                        panelId: panel.id,
                        roleId: itemData.roleId,
                        label: itemData.label,
                        emoji: itemData.emoji ?? null,
                        buttonStyle: itemData.buttonStyle ?? 'PRIMARY',
                        sortOrder: itemData.sortOrder ?? 0,
                    });
                }
                return withItems(panel);
            },
            async update({ where, data }) {
                const panel = panels.find((p) => p.id === where.id);
                if (!panel) throw new Error('Panel not found');
                Object.assign(panel, data, { updatedAt: new Date() });
                return withItems(panel);
            },
            async delete({ where }) {
                const idx = panels.findIndex((p) => p.id === where.id);
                if (idx >= 0) panels.splice(idx, 1);
                for (let i = items.length - 1; i >= 0; i--) {
                    if (items[i].panelId === where.id) items.splice(i, 1);
                }
                return {};
            },
        },
        reactionRoleItem: {
            async create({ data }) {
                const item = {
                    id: nextItemId++,
                    panelId: data.panelId,
                    roleId: data.roleId,
                    label: data.label,
                    emoji: data.emoji ?? null,
                    buttonStyle: data.buttonStyle ?? 'PRIMARY',
                    sortOrder: data.sortOrder ?? 0,
                };
                items.push(item);
                return { ...item };
            },
            async update({ where, data }) {
                const item = items.find((i) => i.id === where.id);
                if (!item) throw new Error('Item not found');
                Object.assign(item, data);
                return { ...item };
            },
            async delete({ where }) {
                const idx = items.findIndex((i) => i.id === where.id);
                if (idx >= 0) items.splice(idx, 1);
                return {};
            },
            async deleteMany({ where }) {
                const ids = where?.id?.in ?? [];
                let count = 0;
                for (let i = items.length - 1; i >= 0; i--) {
                    if (ids.includes(items[i].id)) {
                        items.splice(i, 1);
                        count++;
                    }
                }
                return { count };
            },
        },
    };
    return client;
}

test('shared reaction-roles Zod schemas and emoji validator validate panel/item inputs', () => {
    assert.equal(isValidDiscordEmoji('🎮'), true);
    assert.equal(isValidDiscordEmoji('<:dev:12345678901234567>'), true);
    assert.equal(isValidDiscordEmoji('<a:party:12345678901234567>'), true);
    assert.equal(isValidDiscordEmoji('plain text'), false);
    assert.equal(isValidDiscordEmoji('123'), false);

    const parsed = reactionRolePanelInputSchema.parse({
        title: ' เลือกยศสายงาน ',
        channelId: CHANNEL_A,
        embedColor: '#8B5CF6',
        items: [
            { roleId: ROLE_1, label: 'Backend', emoji: '⚙️', buttonStyle: 'SUCCESS' },
            { roleId: ROLE_2, label: 'Frontend', emoji: '' },
        ],
    });
    assert.equal(parsed.title, 'เลือกยศสายงาน');
    assert.equal(parsed.embedColor, '#8b5cf6');
    assert.equal(parsed.items[1].emoji, null);
    assert.equal(parsed.items[1].buttonStyle, 'PRIMARY');

    // Duplicate roleIds in the same panel must fail
    assert.equal(
        reactionRolePanelInputSchema.safeParse({
            title: 'Dupes',
            channelId: CHANNEL_A,
            items: [
                { roleId: ROLE_1, label: 'One' },
                { roleId: ROLE_1, label: 'Two' },
            ],
        }).success,
        false,
    );

    assert.equal(updateReactionRolePanelSchema.safeParse({}).success, false);
    assert.deepEqual(updateReactionRolePanelSchema.parse({ allowMultiple: false }), { allowMultiple: false });
    assert.equal(updateReactionRoleItemSchema.safeParse({}).success, false);
    assert.equal(reactionRoleItemInputSchema.safeParse({ roleId: 'bad', label: 'X' }).success, false);
});

test('customId helpers and payload builder format BUTTON (chunked by 5) and SELECT modes cleanly', () => {
    assert.deepEqual(parseReactionRoleCustomId(RR_IDS.button(12, 34)), { kind: 'button', panelId: 12, itemId: 34 });
    assert.deepEqual(parseReactionRoleCustomId(RR_IDS.select(99)), { kind: 'select', panelId: 99 });
    assert.equal(parseReactionRoleCustomId('jira:open'), null);
    assert.equal(parseReactionRoleCustomId('rr:btn:0:1'), null);

    const manyItems = Array.from({ length: 7 }, (_, i) => ({
        id: i + 1,
        roleId: `4444444444444444${i}`,
        label: `Role ${i + 1}`,
        emoji: i === 0 ? '🔥' : null,
        buttonStyle: i % 2 === 0 ? 'PRIMARY' : 'SUCCESS',
    }));
    const btnPayload = buildReactionRolePanelPayload(
        { id: 1, title: 'Buttons', description: 'Pick one', embedColor: '#5865f2', mode: 'BUTTON', allowMultiple: true },
        manyItems,
    );
    assert.equal(btnPayload.components.length, 2);
    assert.equal(btnPayload.components[0].toJSON().components.length, 5);
    assert.equal(btnPayload.components[1].toJSON().components.length, 2);

    const selPayload = buildReactionRolePanelPayload(
        { id: 2, title: 'Select', description: '', embedColor: '#5865f2', mode: 'SELECT', allowMultiple: false },
        manyItems.slice(0, 3),
    );
    assert.equal(selPayload.components.length, 1);
    const menuJson = selPayload.components[0].toJSON().components[0];
    assert.equal(menuJson.custom_id, 'rr:sel:2');
    assert.equal(menuJson.max_values, 1);
    assert.equal(menuJson.options.length, 3);
});

test('ReactionRolesService manages Panel/Item CRUD and publishes or edits Discord messages', async () => {
    const prisma = createReactionRolesPrisma();
    const sentPayloads = [];
    const editedPayloads = [];

    const existingMessage = {
        id: '77777777777777777',
        editable: true,
        async edit(payload) {
            editedPayloads.push(payload);
        },
    };
    const channelA = {
        id: CHANNEL_A,
        name: 'roles',
        guildId: GUILD_A,
        isSendable: () => true,
        messages: {
            async fetch(id) {
                return id === existingMessage.id ? existingMessage : null;
            },
        },
        async send(payload) {
            sentPayloads.push(payload);
            return existingMessage;
        },
    };
    const channelB = {
        id: CHANNEL_B,
        name: 'roles-v2',
        guildId: GUILD_A,
        isSendable: () => true,
        messages: { async fetch() { return null; } },
        async send(payload) {
            sentPayloads.push(payload);
            return { id: '88888888888888888' };
        },
    };
    const discord = {
        ready: {},
        requireReady() {
            return {};
        },
        guild() {
            return null;
        },
        async fetchGuildChannel(guildId, channelId) {
            if (guildId !== GUILD_A) return null;
            if (channelId === CHANNEL_A) return channelA;
            if (channelId === CHANNEL_B) return channelB;
            return null;
        },
    };

    const service = new ReactionRolesService(prisma, discord);

    const panel = await service.createPanel(GUILD_A, {
        title: 'Community Roles',
        description: 'Pick roles below',
        channelId: CHANNEL_A,
        embedColor: '#5865f2',
        mode: 'BUTTON',
        allowMultiple: false,
    });
    assert.equal(panel.items.length, 0);

    // Cannot publish empty panel
    await assert.rejects(() => service.publishPanel(GUILD_A, panel.id), (err) => err.getStatus?.() === 400);

    const item1 = await service.addItem(GUILD_A, panel.id, { roleId: ROLE_1, label: 'Gamer', buttonStyle: 'PRIMARY' });
    const item2 = await service.addItem(GUILD_A, panel.id, { roleId: ROLE_2, label: 'Artist', buttonStyle: 'SUCCESS' });
    assert.equal(item1.sortOrder, 0);
    assert.equal(item2.sortOrder, 1);

    // Publish first time -> sends new message and stores messageId
    const pub1 = await service.publishPanel(GUILD_A, panel.id);
    assert.equal(pub1.edited, false);
    assert.equal(pub1.panel.messageId, existingMessage.id);
    assert.equal(sentPayloads.length, 1);

    // Publish second time -> edits existing message
    const pub2 = await service.publishPanel(GUILD_A, panel.id);
    assert.equal(pub2.edited, true);
    assert.equal(editedPayloads.length, 1);

    // Changing channelId resets messageId so next publish sends to new channel
    const moved = await service.updatePanel(GUILD_A, panel.id, { channelId: CHANNEL_B });
    assert.equal(moved.messageId, null);
    const pub3 = await service.publishPanel(GUILD_A, panel.id);
    assert.equal(pub3.edited, false);
    assert.equal(pub3.panel.messageId, '88888888888888888');
});

test('ReactionRoleInteractionListener checks plugin status, role hierarchy, and single-choice replacement order', async () => {
    const prisma = createReactionRolesPrisma();
    const panel = await prisma.reactionRolePanel.create({
        data: {
            guildId: GUILD_A,
            channelId: CHANNEL_A,
            title: 'Single Choice Panel',
            mode: 'BUTTON',
            allowMultiple: false,
            items: {
                create: [
                    { roleId: ROLE_1, label: 'Team Red', buttonStyle: 'DANGER', sortOrder: 0 },
                    { roleId: ROLE_2, label: 'Team Blue', buttonStyle: 'PRIMARY', sortOrder: 1 },
                    { roleId: ROLE_HIGH, label: 'Admin Role', buttonStyle: 'SECONDARY', sortOrder: 2 },
                ],
            },
        },
    });

    const roleObjs = new Map([
        [ROLE_1, { id: ROLE_1, name: 'Team Red', position: 3, managed: false }],
        [ROLE_2, { id: ROLE_2, name: 'Team Blue', position: 4, managed: false }],
        [ROLE_HIGH, { id: ROLE_HIGH, name: 'Admin Role', position: 15, managed: false }],
    ]);

    let pluginInstalled = false;
    const pluginsStub = {
        async isInstalled(guildId, pluginId) {
            return pluginInstalled && guildId === GUILD_A && pluginId === 'reaction-roles';
        },
    };
    const listener = new ReactionRoleInteractionListener(prisma, pluginsStub);

    function createInteraction({ customId, values, initialRoleIds = [], botPosition = 10, hasManageRoles = true }) {
        const held = new Set(initialRoleIds);
        const ops = [];
        const replies = [];
        const member = {
            roles: {
                cache: {
                    has: (id) => held.has(id),
                },
                async add(roleOrRoles) {
                    const arr = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];
                    for (const r of arr) {
                        held.add(r.id);
                        ops.push(`add:${r.id}`);
                    }
                },
                async remove(roleOrRoles) {
                    const arr = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];
                    for (const r of arr) {
                        held.delete(r.id);
                        ops.push(`remove:${r.id}`);
                    }
                },
            },
        };
        const guild = {
            id: GUILD_A,
            members: {
                me: {
                    permissions: { has: (flag) => (flag === PermissionFlagsBits.ManageRoles ? hasManageRoles : true) },
                    roles: { highest: { position: botPosition } },
                },
            },
            roles: {
                cache: { get: (id) => roleObjs.get(id) },
                async fetch(id) {
                    return roleObjs.get(id) ?? null;
                },
            },
        };
        const interaction = {
            customId,
            values,
            guildId: GUILD_A,
            user: { id: '99999999999999999' },
            guild,
            member,
            deferred: false,
            replied: false,
            isButton: () => customId.startsWith('rr:btn:'),
            isStringSelectMenu: () => customId.startsWith('rr:sel:'),
            inCachedGuild: () => true,
            isRepliable: () => true,
            async reply(payload) {
                this.replied = true;
                replies.push(payload);
            },
        };
        return { interaction, ops, replies, held };
    }

    // 1) Plugin uninstalled -> replies ephemerally with PLUGIN_BOT_DISABLED_MESSAGE
    const disabledCase = createInteraction({ customId: RR_IDS.button(panel.id, panel.items[0].id) });
    await listener.onInteraction(disabledCase.interaction);
    assert.deepEqual(disabledCase.replies[0], { content: PLUGIN_BOT_DISABLED_MESSAGE, flags: MessageFlags.Ephemeral });
    assert.equal(disabledCase.ops.length, 0);

    // 2) Install plugin, click role above bot hierarchy -> friendly ephemeral warning, no role ops
    pluginInstalled = true;
    const highCase = createInteraction({ customId: RR_IDS.button(panel.id, panel.items[2].id) });
    await listener.onInteraction(highCase.interaction);
    assert.equal(highCase.ops.length, 0);
    assert.equal(highCase.replies[0].flags, MessageFlags.Ephemeral);
    assert.match(highCase.replies[0].content, /ลำดับยศของบอทอยู่ต่ำกว่าหรือเท่ากับยศ/);

    // 3) Single-choice button: user holds ROLE_1, clicks ROLE_2 -> removes ROLE_1 BEFORE adding ROLE_2
    const switchBtn = createInteraction({
        customId: RR_IDS.button(panel.id, panel.items[1].id),
        initialRoleIds: [ROLE_1],
    });
    await listener.onInteraction(switchBtn.interaction);
    assert.deepEqual(switchBtn.ops, [`remove:${ROLE_1}`, `add:${ROLE_2}`]);
    assert.equal(switchBtn.held.has(ROLE_1), false);
    assert.equal(switchBtn.held.has(ROLE_2), true);

    // 4) Single-choice select menu: user holds ROLE_2, selects ROLE_1 -> removes ROLE_2 BEFORE adding ROLE_1
    const switchSel = createInteraction({
        customId: RR_IDS.select(panel.id),
        values: [String(panel.items[0].id)],
        initialRoleIds: [ROLE_2],
    });
    await listener.onInteraction(switchSel.interaction);
    assert.deepEqual(switchSel.ops, [`remove:${ROLE_2}`, `add:${ROLE_1}`]);
    assert.equal(switchSel.held.has(ROLE_2), false);
    assert.equal(switchSel.held.has(ROLE_1), true);
});
