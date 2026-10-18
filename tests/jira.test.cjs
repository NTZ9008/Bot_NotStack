const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType, OverwriteType, PermissionFlagsBits, PermissionsBitField } = require('../apps/backend/node_modules/discord.js');
const { updateJiraSchema, normalizeJiraOptions, jiraTicketQuerySchema } = require('../packages/shared/dist');
const { TokenCipher } = require('../apps/backend/dist/jira/utils/token-cipher');
const { textToAdf } = require('../apps/backend/dist/jira/utils/adf');
const { parseJiraCustomId, JIRA_IDS, ticketChannelName, issueModal } = require('../apps/backend/dist/jira/utils/jira.messages');
const { downloadDiscordImages } = require('../apps/backend/dist/jira/utils/discord-images');
const { JiraClient, JiraApiError } = require('../apps/backend/dist/jira/clients/jira.client');
const { JiraService } = require('../apps/backend/dist/jira/jira.service');
const { JiraInteractionListener } = require('../apps/backend/dist/jira/listeners/jira-interaction.listener');

const SECRET = 'x'.repeat(48);
const config = (secret = SECRET) => ({ get: (key) => (key === 'JWT_SECRET' ? secret : undefined) });

test('settings only accept Jira Cloud sites and normalise pasted URLs', () => {
    const ok = updateJiraSchema.parse({ siteUrl: 'https://Acme-Team.atlassian.net/jira/software/projects/X/boards/1', projectKey: 'proj', email: 'a@b.co' });
    assert.equal(ok.siteUrl, 'https://acme-team.atlassian.net');
    assert.equal(ok.projectKey, 'PROJ');
    assert.equal(updateJiraSchema.parse({ siteUrl: 'acme.atlassian.net' }).siteUrl, 'https://acme.atlassian.net');
    assert.equal(updateJiraSchema.parse({ siteUrl: '' }).siteUrl, '');
    for (const siteUrl of [
        'https://evil.com',
        'https://acme.atlassian.net.evil.com',
        'https://127.0.0.1',
        'https://user@169.254.169.254',
        'file:///etc/passwd',
    ]) {
        assert.equal(updateJiraSchema.safeParse({ siteUrl }).success, false, siteUrl);
    }
    // http:// ถูกบังคับเป็น https เสมอ
    assert.equal(updateJiraSchema.parse({ siteUrl: 'http://acme.atlassian.net' }).siteUrl, 'https://acme.atlassian.net');
    assert.equal(updateJiraSchema.safeParse({ email: 'not-an-email' }).success, false);
    assert.equal(updateJiraSchema.safeParse({ projectKey: '1ABC' }).success, false);
    assert.equal(updateJiraSchema.safeParse({ panelChannelId: '<#123>' }).success, false);
    assert.deepEqual(updateJiraSchema.parse({}), {});
    assert.equal(jiraTicketQuerySchema.parse({}).page, 1);
    assert.equal(jiraTicketQuerySchema.safeParse({ status: 'deleted' }).success, false);
});

test('options are trimmed, deduplicated and capped to Discord limits', () => {
    const types = Array.from({ length: 30 }, (_, i) => ({ id: String(10000 + i), name: ` Type ${i} `, emoji: '🐞', extra: true }));
    const options = normalizeJiraOptions({
        issueTypes: [{ id: '10000', name: 'dup' }, ...types, { id: 'abc', name: 'bad id' }, { id: '1', name: '' }],
        staffRoleIds: ['123456', '123456', 'nope', 42],
        panel: { title: '  Hello  ', color: 'red', buttonLabel: '' },
        junk: 1,
    });
    assert.equal(options.issueTypes.length, 25);
    assert.deepEqual(options.issueTypes[0], { id: '10000', name: 'dup', emoji: '' });
    assert.equal(options.issueTypes[1].name, 'Type 1');
    assert.deepEqual(options.staffRoleIds, ['123456']);
    assert.equal(options.panel.title, 'Hello');
    assert.equal(options.panel.color, '#2684FF');
    assert.equal(options.panel.buttonLabel, 'เปิด Jira card');
    assert.equal('junk' in options, false);
    assert.deepEqual(normalizeJiraOptions(null).issueTypes, []);
});

test('API tokens are encrypted, authenticated and tied to JWT_SECRET', () => {
    const cipher = new TokenCipher(SECRET);
    const stored = cipher.encrypt('ATATT-secret-token');
    assert.match(stored, /^v1\./);
    assert.equal(stored.includes('ATATT'), false);
    assert.notEqual(cipher.encrypt('ATATT-secret-token'), stored);
    assert.equal(cipher.decrypt(stored), 'ATATT-secret-token');
    assert.equal(new TokenCipher('y'.repeat(48)).decrypt(stored), null);
    const parts = stored.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    assert.equal(cipher.decrypt(parts.join('.')), null);
    assert.equal(cipher.decrypt('garbage'), null);
    assert.equal(new TokenCipher('short').available, false);
    assert.throws(() => new TokenCipher(undefined).encrypt('x'));
});

test('plain text descriptions become valid Atlassian documents', () => {
    assert.deepEqual(textToAdf('line 1\r\nline 2\n\n\nnext\n\n'), {
        type: 'doc',
        version: 1,
        content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'line 1' }, { type: 'hardBreak' }, { type: 'text', text: 'line 2' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'next' }] },
        ],
    });
    assert.deepEqual(textToAdf('   ').content, []);
});

test('custom ids round-trip and reject anything else', () => {
    assert.deepEqual(parseJiraCustomId(JIRA_IDS.open), { action: 'open' });
    assert.deepEqual(parseJiraCustomId(JIRA_IDS.type(7)), { action: 'type', ticketId: 7 });
    assert.deepEqual(parseJiraCustomId(JIRA_IDS.modal(7, '10001')), { action: 'modal', ticketId: 7, issueTypeId: '10001' });
    assert.deepEqual(parseJiraCustomId(JIRA_IDS.close(7)), { action: 'close', ticketId: 7 });
    assert.deepEqual(parseJiraCustomId(JIRA_IDS.closeConfirm(7)), { action: 'closeConfirm', ticketId: 7 });
    for (const id of ['jira:modal:7', 'jira:type:7:1', 'jira:type:x', 'jira:delete:1', 'help_menu', 'jira:open:1', `jira:type:${'9'.repeat(30)}`]) {
        assert.equal(parseJiraCustomId(id), null, id);
    }
    assert.equal(ticketChannelName('Boat.Ngin_99', 12), 'jira-boat-ngin-99-12');
    assert.equal(ticketChannelName('บอท', 3), 'jira-3');
});

function fakeFetch(responses) {
    const calls = [];
    const fn = async (url, init) => {
        calls.push({ url, init });
        const next = responses.shift();
        return { ok: next.status < 400, status: next.status, json: async () => next.body };
    };
    return { fn, calls };
}
const creds = { siteUrl: 'https://acme.atlassian.net', email: 'bot@acme.io', apiToken: 'tok' };

test('Jira client creates issues with basic auth and ADF descriptions', async () => {
    const client = new JiraClient();
    const fetch = fakeFetch([{ status: 201, body: { id: '1', key: 'PROJ-42' } }]);
    client.fetchImpl = fetch.fn;
    const issue = await client.createIssue(creds, { projectKey: 'PROJ', issueTypeId: '10001', summary: 'Crash', description: 'steps\n\nmore' });
    assert.deepEqual(issue, { key: 'PROJ-42', url: 'https://acme.atlassian.net/browse/PROJ-42' });
    const { url, init } = fetch.calls[0];
    assert.equal(url, 'https://acme.atlassian.net/rest/api/3/issue');
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Basic ${Buffer.from('bot@acme.io:tok').toString('base64')}`);
    const body = JSON.parse(init.body);
    assert.deepEqual(body.fields.project, { key: 'PROJ' });
    assert.deepEqual(body.fields.issuetype, { id: '10001' });
    assert.equal(body.fields.description.type, 'doc');
    assert.equal(body.fields.description.content.length, 2);
});

test('Jira client explains failures and never calls hosts outside atlassian.net', async () => {
    const client = new JiraClient();
    const fetch = fakeFetch([
        { status: 401, body: null },
        { status: 400, body: { errorMessages: [], errors: { components: 'Component is required.' } } },
        {
            status: 200,
            body: {
                name: 'Project',
                issueTypes: [
                    { id: 1, name: 'Bug' },
                    { id: '2', name: 'Sub-task', subtask: true },
                ],
            },
        },
    ]);
    client.fetchImpl = fetch.fn;
    await assert.rejects(client.myself(creds), (err) => err instanceof JiraApiError && /API token/.test(err.message));
    await assert.rejects(client.createIssue(creds, { projectKey: 'P', issueTypeId: '1', summary: 's', description: 'd' }), /components: Component is required/);
    const project = await client.project(creds, 'PROJ');
    assert.deepEqual(project.issueTypes, [{ id: '1', name: 'Bug', description: '', iconUrl: '' }]);

    await assert.rejects(client.myself({ ...creds, siteUrl: 'https://evil.example' }), JiraApiError);
    await assert.rejects(client.myself({ ...creds, apiToken: '' }), JiraApiError);
    assert.equal(fetch.calls.length, 3);
});

function fakePrisma(initialRow = null) {
    const state = { row: initialRow, upserts: [] };
    return {
        state,
        jiraSetting: {
            findUnique: async () => state.row,
            upsert: async ({ create, update }) => {
                state.upserts.push({ create, update });
                state.row = { ...(state.row ?? create), ...update, updatedAt: new Date('2026-10-18T00:00:00Z') };
                return state.row;
            },
        },
    };
}
const offlineDiscord = { ready: null, guild: () => null };

test('settings keep the stored token when the form leaves it blank and never expose it', async () => {
    const prisma = fakePrisma();
    const service = new JiraService(prisma, offlineDiscord, new JiraClient(), config());
    const first = await service.updateSettings('g1', { siteUrl: 'https://acme.atlassian.net', email: 'a@acme.io', apiToken: 'secret-1', projectKey: 'PROJ' });
    const stored = prisma.state.row.apiToken;
    assert.equal(service.cipher.decrypt(stored), 'secret-1');
    const view = service.view(first.settings);
    assert.equal(view.apiTokenSet, true);
    assert.equal('apiToken' in view, false);
    assert.equal(JSON.stringify(view).includes('secret-1'), false);

    await service.updateSettings('g1', { apiToken: '', email: 'b@acme.io' });
    assert.equal(prisma.state.row.apiToken, stored);
    assert.equal(prisma.state.row.email, 'b@acme.io');
    assert.deepEqual(service.credentials(await service.getSettings('g1')), { siteUrl: 'https://acme.atlassian.net', email: 'b@acme.io', apiToken: 'secret-1' });
});

test('enabling requires a complete setup and a usable encryption key', async () => {
    const service = new JiraService(fakePrisma(), offlineDiscord, new JiraClient(), config());
    await assert.rejects(service.updateSettings('g1', { enabled: true }), /เปิดใช้งานไม่ได้/);
    await service.updateSettings('g1', { siteUrl: 'https://acme.atlassian.net', email: 'a@acme.io', apiToken: 't', projectKey: 'P' });
    await assert.rejects(service.updateSettings('g1', { enabled: true }), /ประเภท card/);
    await assert.rejects(service.updateSettings('g1', { enabled: true, options: normalizeJiraOptions({ issueTypes: [{ id: '1', name: 'Bug' }] }) }), /ห้องแผง/);
    const done = await service.updateSettings('g1', {
        enabled: true,
        panelChannelId: '1234567890',
        options: normalizeJiraOptions({ issueTypes: [{ id: '1', name: 'Bug' }] }),
    });
    assert.equal(done.settings.enabled, true);

    // JWT_SECRET เปลี่ยน → token เดิมถอดไม่ได้ ต้องกรอกใหม่
    const rotated = new JiraService({ jiraSetting: { findUnique: async () => done.settings } }, offlineDiscord, new JiraClient(), config('z'.repeat(40)));
    assert.match(rotated.missingSetup(await rotated.getSettings('g1')), /API token ใหม่/);

    const noKey = new JiraService(fakePrisma(), offlineDiscord, new JiraClient(), config(''));
    await assert.rejects(noKey.updateSettings('g1', { apiToken: 'x' }), /JWT_SECRET/);
});

// ---------- ขั้นตอนใน Discord (fake interaction) ----------

function setupListener({ settings, tickets = [] } = {}) {
    const created = [];
    const channels = [];
    const sent = [];
    const db = { tickets: [...tickets], nextId: 1 };
    const prisma = {
        jiraTicket: {
            create: async ({ data }) => {
                const row = { id: db.nextId++, channelId: null, issueKey: null, closedAt: null, createdAt: new Date(), ...data };
                db.tickets.push(row);
                return row;
            },
            update: async ({ where, data }) =>
                Object.assign(
                    db.tickets.find((t) => t.id === where.id),
                    data,
                ),
            delete: async ({ where }) => {
                db.tickets = db.tickets.filter((t) => t.id !== where.id);
            },
        },
    };
    const jira = {
        getSettings: async () => settings,
        missingSetup: () => null,
        credentials: () => creds,
        findOpenTicket: async () => null,
        findTicket: async (_g, id) => db.tickets.find((t) => t.id === id) ?? null,
    };
    const attachments = [];
    const client = {
        createIssue: async (_c, input) => (created.push(input), { key: 'PROJ-9', url: 'https://acme.atlassian.net/browse/PROJ-9' }),
        addAttachment: async (_c, key, file) => {
            if (file.name.startsWith('deny')) throw new JiraApiError('บัญชี Jira นี้ไม่มีสิทธิ์', 403);
            attachments.push({ key, file });
        },
    };
    const listener = new JiraInteractionListener(jira, client, prisma);

    const roles = new Map([['555555', {}]]);
    const logChannel = { isSendable: () => true, send: async (payload) => sent.push(payload) };
    const guild = {
        id: 'g1',
        name: 'Guild',
        roles: { everyone: { id: 'g1' }, cache: roles },
        members: { me: { id: 'bot' } },
        channels: {
            cache: new Map([
                ['cat1', { type: ChannelType.GuildCategory }],
                ['log1', logChannel],
            ]),
            create: async (options) => {
                const channel = { id: `ch${channels.length + 1}`, options, messages: [], send: async (p) => channel.messages.push(p), setName: async () => {} };
                channels.push(channel);
                return channel;
            },
        },
    };
    return { listener, db, created, channels, sent, guild, attachments };
}

const baseSettings = {
    enabled: true,
    projectKey: 'PROJ',
    categoryId: 'cat1',
    logChannelId: 'log1',
    options: normalizeJiraOptions({ issueTypes: [{ id: '10001', name: 'Bug', emoji: '🐞' }], staffRoleIds: ['555555', '666666'] }),
};

function interaction(guild, overrides) {
    const replies = [];
    const base = {
        guild,
        guildId: guild.id,
        user: { id: 'u1', username: 'boat', globalName: 'Boat' },
        member: { permissions: new PermissionsBitField(), roles: { cache: new Map() } },
        client: { users: { fetch: async () => null } },
        inCachedGuild: () => true,
        isRepliable: () => true,
        isButton: () => false,
        isStringSelectMenu: () => false,
        isModalSubmit: () => false,
        isFromMessage: () => false,
        replies,
        deferred: false,
        replied: false,
        reply: async (p) => replies.push({ type: 'reply', p }),
        deferReply: async (p) => {
            base.deferred = true;
            replies.push({ type: 'defer', p });
        },
        editReply: async (p) => replies.push({ type: 'edit', p }),
        showModal: async (m) => replies.push({ type: 'modal', p: m.toJSON() }),
    };
    return Object.assign(base, overrides);
}

test('opening creates a channel hidden from everyone except the opener, staff and the bot', async () => {
    const { listener, db, channels, guild } = setupListener({ settings: baseSettings });
    const i = interaction(guild, { customId: 'jira:open', isButton: () => true });
    await listener.onInteraction(i);

    assert.equal(channels.length, 1);
    const { options } = channels[0];
    assert.equal(options.parent, 'cat1');
    assert.equal(options.type, ChannelType.GuildText);
    assert.equal(options.name, 'jira-boat-1');
    const byId = Object.fromEntries(options.permissionOverwrites.map((o) => [o.id, o]));
    assert.deepEqual(byId.g1.deny, [PermissionFlagsBits.ViewChannel]);
    assert.equal(byId.u1.type, OverwriteType.Member);
    assert.ok(byId.u1.allow.includes(PermissionFlagsBits.ViewChannel));
    assert.ok(byId.bot.allow.includes(PermissionFlagsBits.ManageChannels));
    assert.ok(byId['555555'].allow.includes(PermissionFlagsBits.ViewChannel));
    // ยศที่ถูกลบไปแล้วไม่ถูกใส่ (Discord จะตอบ error)
    assert.equal(byId['666666'], undefined);
    assert.equal(Object.keys(byId).length, 4);

    assert.equal(db.tickets[0].channelId, 'ch1');
    assert.equal(db.tickets[0].userName, 'Boat');
    const welcome = channels[0].messages[0];
    assert.deepEqual(welcome.allowedMentions, { users: ['u1'] });
    assert.equal(welcome.components[0].toJSON().components[0].custom_id, 'jira:type:1');
    assert.equal(i.replies.at(-1).p, '✅ สร้างห้องให้แล้ว: <#ch1>');
});

test('disabled system and failed channel creation leave no ticket behind', async () => {
    const off = setupListener({ settings: { ...baseSettings, enabled: false } });
    const i1 = interaction(off.guild, { customId: 'jira:open', isButton: () => true });
    await off.listener.onInteraction(i1);
    assert.match(i1.replies[0].p.content, /ปิดอยู่/);
    assert.equal(off.channels.length, 0);

    const broken = setupListener({ settings: baseSettings });
    broken.guild.channels.create = async () => {
        throw new Error('Missing Permissions');
    };
    const i2 = interaction(broken.guild, { customId: 'jira:open', isButton: () => true });
    await broken.listener.onInteraction(i2);
    assert.equal(broken.db.tickets.length, 0);
    assert.match(i2.replies.at(-1).p, /สร้างห้องไม่ได้/);
});

test('only the opener or staff can use a ticket and a channel yields one card', async () => {
    const ticket = { id: 1, guildId: 'g1', userId: 'u1', userName: 'Boat', channelId: 'ch1', issueKey: null, closedAt: null, createdAt: new Date() };
    const { listener, db, created, sent, guild } = setupListener({ settings: baseSettings, tickets: [ticket] });

    const stranger = interaction(guild, {
        customId: 'jira:type:1',
        channelId: 'ch1',
        values: ['10001'],
        isStringSelectMenu: () => true,
        user: { id: 'u2', username: 'other' },
    });
    await listener.onInteraction(stranger);
    assert.match(stranger.replies[0].p.content, /เฉพาะคนเปิดห้อง/);

    const wrongRoom = interaction(guild, { customId: 'jira:type:1', channelId: 'elsewhere', values: ['10001'], isStringSelectMenu: () => true });
    await listener.onInteraction(wrongRoom);
    assert.match(wrongRoom.replies[0].p.content, /ปิดไปแล้ว/);

    const pick = interaction(guild, { customId: 'jira:type:1', channelId: 'ch1', values: ['10001'], isStringSelectMenu: () => true });
    await listener.onInteraction(pick);
    assert.equal(pick.replies[0].type, 'modal');
    assert.equal(pick.replies[0].p.custom_id, 'jira:modal:1:10001');

    const fields = { getTextInputValue: (id) => (id === 'title' ? '  App crashes  ' : 'Steps to reproduce') };
    const submit = interaction(guild, {
        customId: 'jira:modal:1:10001',
        channelId: 'ch1',
        fields,
        isModalSubmit: () => true,
        channel: { setName: async () => {} },
    });
    await listener.onInteraction(submit);
    assert.equal(created.length, 1);
    assert.equal(created[0].summary, 'App crashes');
    assert.equal(created[0].issueTypeId, '10001');
    assert.match(created[0].description, /^Steps to reproduce\n\n— เปิดจาก Discord โดย boat \(u1\)/);
    assert.equal(db.tickets[0].issueKey, 'PROJ-9');
    assert.equal(db.tickets[0].issueType, 'Bug');
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].allowedMentions, { parse: [] });
    assert.equal(sent[0].embeds[0].toJSON().url, 'https://acme.atlassian.net/browse/PROJ-9');

    const again = interaction(guild, { customId: 'jira:modal:1:10001', channelId: 'ch1', fields, isModalSubmit: () => true });
    await listener.onInteraction(again);
    assert.match(again.replies[0].p.content, /สร้าง card ไปแล้ว \(PROJ-9\)/);
    assert.equal(created.length, 1);
});

test('staff with a configured role may act on someone else’s ticket', async () => {
    const ticket = { id: 1, guildId: 'g1', userId: 'u1', userName: 'Boat', channelId: 'ch1', issueKey: null, closedAt: null, createdAt: new Date() };
    const { listener, guild } = setupListener({ settings: baseSettings, tickets: [ticket] });
    const staff = interaction(guild, {
        customId: 'jira:close:1',
        channelId: 'ch1',
        isButton: () => true,
        user: { id: 'u3', username: 'staff' },
        member: { permissions: new PermissionsBitField(), roles: { cache: new Map([['555555', {}]]) } },
    });
    await listener.onInteraction(staff);
    assert.equal(staff.replies[0].p.components[0].toJSON().components[0].custom_id, 'jira:close-yes:1');
});

// ---------- รูปแนบ ----------

test('image option is clamped and the pop-up only gets an upload field when enabled', () => {
    assert.equal(normalizeJiraOptions({}).maxImages, 5);
    assert.equal(normalizeJiraOptions({ maxImages: 15 }).maxImages, 10);
    assert.equal(normalizeJiraOptions({ maxImages: -2 }).maxImages, 0);
    assert.equal(normalizeJiraOptions({ maxImages: 2.9 }).maxImages, 2);
    assert.equal(normalizeJiraOptions({ maxImages: '3' }).maxImages, 5);

    const type = { id: '10001', name: 'Bug', emoji: '' };
    const withImages = issueModal(1, type, 3).toJSON();
    assert.equal(withImages.components.length, 3);
    assert.deepEqual(withImages.components[2].component, {
        type: 19,
        file_types: ['image'],
        custom_id: 'images',
        required: false,
        min_values: 0,
        max_values: 3,
    });
    assert.equal(issueModal(1, type, 0).toJSON().components.length, 2);
    assert.equal(issueModal(1, type, 50).toJSON().components[2].component.max_values, 10);
});

test('only images from the Discord CDN within the size limit are downloaded', async () => {
    const calls = [];
    const fetch = async (url) => {
        calls.push(String(url));
        if (String(url).includes('broken')) return { ok: false, status: 404 };
        if (String(url).includes('huge')) return { ok: true, arrayBuffer: async () => new ArrayBuffer(2048) };
        return { ok: true, arrayBuffer: async () => new TextEncoder().encode('png-bytes').buffer };
    };
    const cdn = (name) => `https://cdn.discordapp.com/ephemeral-attachments/1/2/${name}?ex=1`;
    const result = await downloadDiscordImages(
        [
            { name: 'screen shot.PNG', url: cdn('a.png'), contentType: 'image/png', size: 10 },
            { name: 'screen shot.PNG', url: cdn('b.png'), contentType: 'image/png; charset=binary', size: 10 },
            { name: 'notes.pdf', url: cdn('c.pdf'), contentType: 'application/pdf', size: 10 },
            { name: 'big.jpg', url: cdn('big.jpg'), contentType: 'image/jpeg', size: 5000 },
            { name: 'lies.jpg', url: cdn('huge.jpg'), contentType: 'image/jpeg', size: 10 },
            { name: 'evil.png', url: 'https://169.254.169.254/latest', contentType: 'image/png', size: 10 },
            { name: 'plain.png', url: 'http://cdn.discordapp.com/x.png', contentType: 'image/png', size: 10 },
            { name: 'gone.png', url: cdn('broken.png'), contentType: 'image/png', size: 10 },
            { name: '../../ภาพ.webp', url: cdn('d.webp'), contentType: 'image/webp', size: 10 },
        ],
        fetch,
        1024,
    );
    assert.deepEqual(
        result.files.map((f) => [f.name, f.contentType, f.data.toString()]),
        [
            ['screen_shot.png', 'image/png', 'png-bytes'],
            ['screen_shot-2.png', 'image/png', 'png-bytes'],
            ['image-9.webp', 'image/webp', 'png-bytes'],
        ],
    );
    assert.equal(result.skipped.length, 6);
    assert.match(result.skipped.join('\n'), /notes\.pdf \(ไม่ใช่รูปภาพ\)/);
    assert.match(result.skipped.join('\n'), /big\.jpg \(ใหญ่เกิน/);
    assert.match(result.skipped.join('\n'), /lies\.jpg \(ใหญ่เกิน/);
    assert.match(result.skipped.join('\n'), /evil\.png \(ลิงก์ไฟล์ไม่ได้มาจาก Discord\)/);
    assert.match(result.skipped.join('\n'), /gone\.png \(ดาวน์โหลดจาก Discord ไม่ได้\)/);
    // ไม่เคยยิงไป host อื่นหรือ http
    assert.ok(calls.every((url) => url.startsWith('https://cdn.discordapp.com/')));
});

test('Jira client uploads attachments as multipart with the XSRF header', async () => {
    const client = new JiraClient();
    const fetch = fakeFetch([{ status: 200, body: [{ id: '1' }] }]);
    client.fetchImpl = fetch.fn;
    await client.addAttachment(creds, 'PROJ-42', { name: 'shot.png', contentType: 'image/png', data: Buffer.from('abc') });
    const { url, init } = fetch.calls[0];
    assert.equal(url, 'https://acme.atlassian.net/rest/api/3/issue/PROJ-42/attachments');
    assert.equal(init.headers['X-Atlassian-Token'], 'no-check');
    assert.equal(init.headers['Content-Type'], undefined);
    const file = init.body.get('file');
    assert.equal(file.name, 'shot.png');
    assert.equal(file.type, 'image/png');
    assert.equal(Buffer.from(await file.arrayBuffer()).toString(), 'abc');
});

test('images uploaded in the pop-up are attached to the card and shown in the room', async () => {
    const ticket = { id: 1, guildId: 'g1', userId: 'u1', userName: 'Boat', channelId: 'ch1', issueKey: null, closedAt: null, createdAt: new Date() };
    const settings = { ...baseSettings, options: normalizeJiraOptions({ ...baseSettings.options, maxImages: 2 }) };
    const { listener, created, attachments, sent, guild } = setupListener({ settings, tickets: [ticket] });
    listener.fetchImpl = async () => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode('img').buffer });
    const file = (name) => ({ name, url: `https://cdn.discordapp.com/ephemeral-attachments/1/2/${name}`, contentType: 'image/png', size: 3 });
    const uploaded = new Map([
        ['1', file('crash.png')],
        ['2', file('deny.png')],
        ['3', file('extra.png')],
    ]);
    const fields = {
        getTextInputValue: (id) => (id === 'title' ? 'App crashes' : 'Steps'),
        getUploadedFiles: (id) => (id === 'images' ? uploaded : null),
    };
    const submit = interaction(guild, { customId: 'jira:modal:1:10001', channelId: 'ch1', fields, isModalSubmit: () => true });
    await listener.onInteraction(submit);

    assert.equal(created.length, 1);
    // ตัดเหลือตามจำนวนที่ตั้งไว้ (2) — extra.png ไม่ถูกโหลด
    assert.deepEqual(
        attachments.map((a) => [a.key, a.file.name]),
        [['PROJ-9', 'crash.png']],
    );
    const reply = submit.replies.find((r) => r.type === 'edit').p;
    assert.deepEqual(
        reply.files.map((f) => f.name),
        ['crash.png'],
    );
    const embed = reply.embeds[0].toJSON();
    assert.equal(embed.image.url, 'attachment://crash.png');
    assert.match(embed.fields.find((f) => f.name.includes('แนบรูปไม่สำเร็จ')).value, /deny\.png \(บัญชี Jira นี้ไม่มีสิทธิ์\)/);
    assert.equal(sent[0].embeds[0].toJSON().fields.find((f) => f.name === 'รูปแนบ').value, '📎 1 รูป');
});

test('cards without images, or with image uploads turned off, still work', async () => {
    const ticket = { id: 1, guildId: 'g1', userId: 'u1', userName: 'Boat', channelId: 'ch1', issueKey: null, closedAt: null, createdAt: new Date() };
    const settings = { ...baseSettings, options: normalizeJiraOptions({ ...baseSettings.options, maxImages: 0 }) };
    const { listener, created, attachments, guild } = setupListener({ settings, tickets: [ticket] });
    listener.fetchImpl = async () => {
        throw new Error('must not download');
    };
    const fields = {
        getTextInputValue: (id) => (id === 'title' ? 'No pics' : 'text'),
        getUploadedFiles: () => {
            throw new Error('no such field');
        },
    };
    const submit = interaction(guild, { customId: 'jira:modal:1:10001', channelId: 'ch1', fields, isModalSubmit: () => true });
    await listener.onInteraction(submit);
    assert.equal(created.length, 1);
    assert.equal(attachments.length, 0);
    const reply = submit.replies.find((r) => r.type === 'edit').p;
    assert.deepEqual(reply.files, []);
    assert.equal(reply.embeds[0].toJSON().image, undefined);
});
