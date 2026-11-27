const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const req = createRequire(require('node:path').resolve('apps/backend/package.json'));
req('reflect-metadata');
const { ChannelType, MessageFlags, OverwriteType, PermissionFlagsBits, PermissionsBitField } = req('discord.js');
const { PLUGIN_BOT_DISABLED_MESSAGE, formatTicketNumber, normalizeStaffRoleIds, ticketListQuerySchema, ticketTranscriptQuerySchema, updateTicketConfigSchema } =
    req('@notstack/shared');

const {
    TICKET_IDS,
    parseTicketCustomId,
    ticketChannelName,
    ticketPanelMessage,
    ticketWelcomeMessage,
} = require('../apps/backend/dist/tickets/utils/tickets.messages');
const {
    buildTranscriptHtml,
    buildTranscriptMarkdown,
    fetchAllChannelMessages,
    renderTranscriptHtmlFromMarkdown,
} = require('../apps/backend/dist/tickets/utils/ticket-transcript');
const { TicketsService } = require('../apps/backend/dist/tickets/tickets.service');
const { TicketsController } = require('../apps/backend/dist/tickets/tickets.controller');
const { TicketListQueryDto, TicketTranscriptQueryDto, UpdateTicketConfigDto } = require('../apps/backend/dist/tickets/dto/tickets.dto');
const { TicketsModule } = require('../apps/backend/dist/tickets/tickets.module');
const { TicketInteractionListener } = require('../apps/backend/dist/tickets/listeners/ticket-interaction.listener');

const GUILD_ID = '11111111111111111';
const CATEGORY_ID = '22222222222222222';
const PANEL_CH_ID = '33333333333333333';
const LOG_CH_ID = '44444444444444444';
const STAFF_ROLE_ID = '55555555555555555';
const OPENER_ID = '66666666666666666';
const STAFF_USER_ID = '77777777777777777';
const BOT_ID = '88888888888888888';

function createTicketsPrisma() {
    const configs = new Map();
    const tickets = [];
    let nextId = 1;

    const matchWhere = (row, where = {}) => {
        if (where.guildId !== undefined && row.guildId !== where.guildId) return false;
        if (where.id !== undefined && row.id !== where.id) return false;
        if (where.openerId !== undefined && row.openerId !== where.openerId) return false;
        if (where.channelId !== undefined && row.channelId !== where.channelId) return false;
        if (where.status !== undefined && row.status !== where.status) return false;
        if (where.OR) {
            const matched = where.OR.some((clause) => {
                if (clause.ticketNumber !== undefined) return row.ticketNumber === clause.ticketNumber;
                if (clause.openerId?.contains) return row.openerId.toLowerCase().includes(clause.openerId.contains.toLowerCase());
                if (clause.claimedById?.contains) return (row.claimedById ?? '').toLowerCase().includes(clause.claimedById.contains.toLowerCase());
                if (clause.subject?.contains) return (row.subject ?? '').toLowerCase().includes(clause.subject.contains.toLowerCase());
                return false;
            });
            if (!matched) return false;
        }
        return true;
    };

    return {
        configs,
        tickets,
        ticketConfig: {
            async findUnique({ where }) {
                const row = configs.get(where.guildId);
                return row ? { ...row } : null;
            },
            async upsert({ where, create, update }) {
                const existing = configs.get(where.guildId);
                const next = existing
                    ? { ...existing, ...update, updatedAt: new Date() }
                    : {
                          categoryId: '',
                          logChannelId: null,
                          panelChannelId: null,
                          panelMessageId: null,
                          staffRoleIds: [],
                          panelTitle: '🎫 ติดต่อทีมงาน / แจ้งปัญหา',
                          panelDescription: 'กดปุ่มด้านล่างเพื่อเปิดห้อง Ticket ส่วนตัว',
                          panelColor: '#5865F2',
                          dmTranscript: true,
                          maxOpenPerUser: 1,
                          ...create,
                          updatedAt: new Date(),
                      };
                configs.set(where.guildId, next);
                return { ...next };
            },
        },
        ticket: {
            async findFirst({ where, orderBy }) {
                let rows = tickets.filter((row) => matchWhere(row, where));
                if (orderBy?.ticketNumber === 'desc') rows = [...rows].sort((a, b) => b.ticketNumber - a.ticketNumber);
                return rows[0] ? { ...rows[0] } : null;
            },
            async findMany({ where, orderBy, skip = 0, take } = {}) {
                let rows = tickets.filter((row) => matchWhere(row, where));
                if (orderBy?.id === 'desc') rows = [...rows].sort((a, b) => b.id - a.id);
                else if (orderBy?.id === 'asc') rows = [...rows].sort((a, b) => a.id - b.id);
                if (take !== undefined) rows = rows.slice(skip, skip + take);
                return rows.map((r) => ({ ...r }));
            },
            async count({ where } = {}) {
                return tickets.filter((row) => matchWhere(row, where)).length;
            },
            async create({ data }) {
                if (tickets.some((t) => t.guildId === data.guildId && t.ticketNumber === data.ticketNumber)) {
                    const err = new Error('Unique constraint failed');
                    err.code = 'P2002';
                    throw err;
                }
                const row = {
                    id: nextId++,
                    channelId: null,
                    claimedById: null,
                    status: 'OPEN',
                    subject: null,
                    transcriptMarkdown: null,
                    closedById: null,
                    createdAt: new Date(),
                    closedAt: null,
                    ...data,
                };
                tickets.push(row);
                return { ...row };
            },
            async update({ where, data }) {
                const idx = tickets.findIndex((row) => row.id === where.id);
                if (idx === -1) throw new Error('Not found');
                tickets[idx] = { ...tickets[idx], ...data };
                return { ...tickets[idx] };
            },
            async updateMany({ where, data }) {
                let count = 0;
                for (let i = 0; i < tickets.length; i++) {
                    if (matchWhere(tickets[i], where)) {
                        tickets[i] = { ...tickets[i], ...data };
                        count += 1;
                    }
                }
                return { count };
            },
            async delete({ where }) {
                const idx = tickets.findIndex((row) => row.id === where.id);
                if (idx === -1) throw new Error('Not found');
                const [removed] = tickets.splice(idx, 1);
                return removed;
            },
        },
    };
}

function createMockDiscord({ messagesForTicket = [], dmThrows = false } = {}) {
    const guildChannels = new Map();
    const sentMessages = [];
    const dmMessages = [];
    const deletedChannels = [];
    let nextChanSeq = 1;
    let nextMsgSeq = 1;

    const category = {
        id: CATEGORY_ID,
        guildId: GUILD_ID,
        name: 'Tickets',
        type: ChannelType.GuildCategory,
        isSendable: () => false,
    };

    const panelChannel = {
        id: PANEL_CH_ID,
        guildId: GUILD_ID,
        name: 'open-ticket',
        type: ChannelType.GuildText,
        isSendable: () => true,
        messages: new Map(),
        async send(payload) {
            const id = `9100000000000000${nextMsgSeq++}`;
            const msg = {
                id,
                payload,
                editable: true,
                async edit(nextPayload) {
                    this.payload = nextPayload;
                    sentMessages.push({ channelId: PANEL_CH_ID, edited: true, id, payload: nextPayload });
                },
            };
            this.messages.set(id, msg);
            sentMessages.push({ channelId: PANEL_CH_ID, edited: false, id, payload });
            return msg;
        },
    };
    panelChannel.messages.fetch = async (id) => panelChannel.messages.get(id) ?? null;

    const logChannel = {
        id: LOG_CH_ID,
        guildId: GUILD_ID,
        name: 'ticket-logs',
        type: ChannelType.GuildText,
        isSendable: () => true,
        async send(payload) {
            sentMessages.push({ channelId: LOG_CH_ID, payload });
            return { id: `9200000000000000${nextMsgSeq++}` };
        },
    };

    guildChannels.set(CATEGORY_ID, category);
    guildChannels.set(PANEL_CH_ID, panelChannel);
    guildChannels.set(LOG_CH_ID, logChannel);

    const me = {
        id: BOT_ID,
        permissions: new PermissionsBitField([
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageRoles,
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ReadMessageHistory,
        ]),
        permissionsIn() {
            return this.permissions;
        },
    };

    const rolesCache = new Map([
        [GUILD_ID, { id: GUILD_ID, name: '@everyone' }],
        [STAFF_ROLE_ID, { id: STAFF_ROLE_ID, name: 'Support' }],
    ]);

    const usersCache = new Map([
        [OPENER_ID, { id: OPENER_ID, username: 'alice', globalName: 'Alice' }],
        [STAFF_USER_ID, { id: STAFF_USER_ID, username: 'bob_staff', globalName: 'Bob Staff' }],
    ]);

    const guild = {
        id: GUILD_ID,
        name: 'NotStack Guild',
        members: {
            me,
            cache: new Map(),
            async fetchMe() {
                return me;
            },
        },
        roles: {
            everyone: { id: GUILD_ID },
            cache: rolesCache,
        },
        channels: {
            cache: guildChannels,
            async fetch(id) {
                return guildChannels.get(id) ?? null;
            },
            async create(opts) {
                const id = `9900000000000000${nextChanSeq++}`;
                const ch = {
                    id,
                    guildId: GUILD_ID,
                    guild: { id: GUILD_ID },
                    name: opts.name,
                    type: opts.type,
                    parentId: opts.parent,
                    topic: opts.topic,
                    permissionOverwrites: opts.permissionOverwrites,
                    isSendable: () => true,
                    async send(payload) {
                        sentMessages.push({ channelId: id, payload });
                        return { id: `9300000000000000${nextMsgSeq++}` };
                    },
                    messages: {
                        async fetch({ limit = 100, before } = {}) {
                            const sortedDesc = [...messagesForTicket].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
                            const startIdx = before ? sortedDesc.findIndex((m) => m.id === before) + 1 : 0;
                            const slice = sortedDesc.slice(startIdx, startIdx + limit);
                            return new Map(slice.map((m) => [m.id, m]));
                        },
                    },
                    async delete(reason) {
                        deletedChannels.push({ id, reason });
                        guildChannels.delete(id);
                    },
                };
                guildChannels.set(id, ch);
                return ch;
            },
        },
    };

    const discord = {
        ready: { guilds: { cache: new Map([[GUILD_ID, guild]]) } },
        client: { users: { cache: usersCache } },
        sentMessages,
        dmMessages,
        deletedChannels,
        guildChannels,
        guild: (id) => (id === GUILD_ID ? guild : null),
        requireReady: () => ({ guilds: { cache: new Map([[GUILD_ID, guild]]) } }),
        fetchGuildChannel: async (gid, cid) => (gid === GUILD_ID ? (guildChannels.get(cid) ?? null) : null),
        cacheMembers: async () => {},
        displayName: async (uid) => usersCache.get(uid)?.globalName ?? usersCache.get(uid)?.username ?? null,
        fetchUser: async (uid) => ({
            id: uid,
            username: usersCache.get(uid)?.username ?? uid,
            async send(payload) {
                if (dmThrows) throw new Error('Cannot send messages to this user');
                dmMessages.push({ uid, payload });
            },
        }),
    };

    return { discord, guild };
}

test('shared ticket Zod schemas, custom IDs, and helper formatting validate properly', () => {
    assert.equal(formatTicketNumber(1), '0001');
    assert.equal(formatTicketNumber(42), '0042');
    assert.deepEqual(normalizeStaffRoleIds([STAFF_ROLE_ID, STAFF_ROLE_ID, 'bad', 123]), [STAFF_ROLE_ID]);

    const parsed = updateTicketConfigSchema.parse({
        categoryId: CATEGORY_ID,
        logChannelId: '',
        panelChannelId: PANEL_CH_ID,
        staffRoleIds: [STAFF_ROLE_ID, STAFF_ROLE_ID],
        panelTitle: '  Helpdesk  ',
        panelColor: '#2684ff',
        dmTranscript: false,
        maxOpenPerUser: 3,
    });
    assert.equal(parsed.logChannelId, null);
    assert.equal(parsed.panelChannelId, PANEL_CH_ID);
    assert.deepEqual(parsed.staffRoleIds, [STAFF_ROLE_ID]);
    assert.equal(parsed.panelTitle, 'Helpdesk');
    assert.equal(parsed.panelColor, '#2684FF');
    assert.equal(parsed.dmTranscript, false);
    assert.equal(parsed.maxOpenPerUser, 3);

    assert.equal(updateTicketConfigSchema.safeParse({ maxOpenPerUser: 0 }).success, false);
    assert.equal(updateTicketConfigSchema.safeParse({ maxOpenPerUser: 11 }).success, false);
    assert.equal(updateTicketConfigSchema.safeParse({ panelColor: 'blue' }).success, false);
    assert.equal(ticketListQuerySchema.parse({}).status, 'ALL');
    assert.equal(ticketListQuerySchema.parse({}).pageSize, 20);
    assert.equal(ticketListQuerySchema.safeParse({ pageSize: '101' }).success, false);
    assert.equal(ticketTranscriptQuerySchema.parse({}).format, 'md');

    assert.deepEqual(parseTicketCustomId(TICKET_IDS.open), { action: 'open' });
    assert.deepEqual(parseTicketCustomId(TICKET_IDS.claim(5)), { action: 'claim', ticketId: 5 });
    assert.deepEqual(parseTicketCustomId(TICKET_IDS.close(5)), { action: 'close', ticketId: 5 });
    assert.deepEqual(parseTicketCustomId(TICKET_IDS.closeConfirm(5)), { action: 'closeConfirm', ticketId: 5 });
    assert.equal(parseTicketCustomId('jira:open'), null);
    assert.equal(parseTicketCustomId('ticket:claim:abc'), null);

    assert.equal(ticketChannelName(1, 'Alice_99'), 'ticket-0001-alice-99');
    assert.equal(ticketChannelName(12, 'สมชาย'), 'ticket-0012');

    const panel = ticketPanelMessage({ panelTitle: 'Support', panelDescription: 'Click below', panelColor: '#5865F2' });
    assert.equal(panel.embeds.length, 1);
    assert.equal(panel.components.length, 1);

    const welcome = ticketWelcomeMessage({ id: 1, ticketNumber: 1, openerId: OPENER_ID, claimedById: null, subject: null });
    assert.equal(welcome.components[0].components.length, 2);
});

test('fetchAllChannelMessages paginates >100 messages and transcript generators escape HTML safely', async () => {
    const messages = Array.from({ length: 150 }, (_, idx) => ({
        id: String(100000000000000000n + BigInt(idx)),
        createdTimestamp: 1700000000000 + idx * 1000,
        content: idx === 0 ? '<script>alert(1)</script>' : `Message ${idx}`,
        author: { id: OPENER_ID, username: 'alice', globalName: 'Alice', bot: false },
        attachments:
            idx === 1
                ? [
                      { name: 'log.txt', url: 'https://cdn.example.com/log.txt' },
                      { name: 'xss.txt', url: 'javascript:alert(1)' },
                  ]
                : [],
        embeds: idx === 2 ? [{ title: '<b>Embed</b>', description: 'Details' }] : [],
    }));

    const channel = {
        messages: {
            async fetch({ limit = 100, before } = {}) {
                const desc = [...messages].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
                const start = before ? desc.findIndex((m) => m.id === before) + 1 : 0;
                const page = desc.slice(start, start + limit);
                return new Map(page.map((m) => [m.id, m]));
            },
        },
    };

    const fetched = await fetchAllChannelMessages(channel);
    assert.equal(fetched.length, 150);
    assert.equal(fetched[0].content, '<script>alert(1)</script>');
    assert.equal(fetched[149].content, 'Message 149');

    const meta = {
        guildName: 'Test <Guild>',
        ticketNumber: 7,
        openerId: OPENER_ID,
        openerName: 'Alice',
        claimedById: STAFF_USER_ID,
        claimedByName: 'Bob Staff',
        closedById: STAFF_USER_ID,
        closedByName: 'Bob Staff',
        subject: 'Bug <Report>',
        createdAt: new Date('2026-11-27T01:00:00Z'),
        closedAt: new Date('2026-11-27T01:30:00Z'),
    };
    const md = buildTranscriptMarkdown(meta, fetched);
    assert.match(md, /# Transcript — Ticket #0007/);
    assert.match(md, /จำนวนข้อความทั้งหมด:\*\* 150/);
    assert.match(md, /📎 \[log\.txt\]\(https:\/\/cdn\.example\.com\/log\.txt\)/);

    const html = buildTranscriptHtml(meta, fetched);
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /href="javascript:alert\(1\)"/);

    const fromMdHtml = renderTranscriptHtmlFromMarkdown(meta, md);
    assert.match(fromMdHtml, /<pre class="markdown">/);
    assert.doesNotMatch(fromMdHtml, /<script>alert\(1\)<\/script>/);
});

test('TicketInteractionListener enforces plugin guard, opening lock, maxOpenPerUser, Staff Claim, and Close transcript flow', async () => {
    const prisma = createTicketsPrisma();
    const transcriptMsgs = Array.from({ length: 120 }, (_, i) => ({
        id: String(200000000000000000n + BigInt(i)),
        createdTimestamp: 1700000100000 + i * 1000,
        content: `Chat line ${i + 1}`,
        author: { id: i % 2 === 0 ? OPENER_ID : STAFF_USER_ID, username: i % 2 === 0 ? 'alice' : 'bob', globalName: null, bot: false },
        attachments: new Map(),
        embeds: [],
    }));
    const { discord, guild } = createMockDiscord({ messagesForTicket: transcriptMsgs });
    const service = new TicketsService(prisma, discord);

    let installed = false;
    const plugins = { isInstalled: async () => installed };
    const listener = new TicketInteractionListener(service, prisma, plugins);

    // 1. Disabled plugin guard
    const disabledReplies = [];
    await listener.onInteraction({
        customId: TICKET_IDS.open,
        guildId: GUILD_ID,
        isButton: () => true,
        inCachedGuild: () => true,
        isRepliable: () => true,
        reply: async (payload) => disabledReplies.push(payload),
    });
    assert.deepEqual(disabledReplies[0], {
        content: PLUGIN_BOT_DISABLED_MESSAGE,
        flags: MessageFlags.Ephemeral,
    });

    installed = true;
    await service.updateConfig(GUILD_ID, {
        categoryId: CATEGORY_ID,
        panelChannelId: PANEL_CH_ID,
        logChannelId: LOG_CH_ID,
        staffRoleIds: [STAFF_ROLE_ID],
        dmTranscript: true,
        maxOpenPerUser: 1,
    });

    // Publish & re-publish panel (send then edit)
    const pub1 = await service.publishPanel(GUILD_ID);
    assert.equal(pub1.edited, false);
    const pub2 = await service.publishPanel(GUILD_ID);
    assert.equal(pub2.edited, true);
    assert.equal(pub2.messageId, pub1.messageId);

    // 2. Opening lock prevents double-click duplicate creation
    listener.opening.add(`${GUILD_ID}:${OPENER_ID}`);
    const lockReplies = [];
    await listener.onInteraction({
        customId: TICKET_IDS.open,
        guildId: GUILD_ID,
        guild,
        user: { id: OPENER_ID, username: 'alice', globalName: 'Alice' },
        isButton: () => true,
        inCachedGuild: () => true,
        isRepliable: () => true,
        reply: async (payload) => lockReplies.push(payload),
    });
    assert.match(lockReplies[0].content, /กำลังเปิดห้อง Ticket/);
    listener.opening.delete(`${GUILD_ID}:${OPENER_ID}`);

    // 3. Open first ticket -> creates private channel with permissionOverwrites
    const openEditReplies = [];
    await listener.onInteraction({
        customId: TICKET_IDS.open,
        guildId: GUILD_ID,
        guild,
        user: { id: OPENER_ID, username: 'alice', globalName: 'Alice' },
        isButton: () => true,
        inCachedGuild: () => true,
        isRepliable: () => true,
        deferReply: async () => {},
        editReply: async (msg) => openEditReplies.push(msg),
    });
    assert.equal(prisma.tickets.length, 1);
    const ticket = prisma.tickets[0];
    assert.equal(ticket.ticketNumber, 1);
    assert.equal(ticket.status, 'OPEN');
    assert.ok(ticket.channelId);
    assert.match(openEditReplies[0], /Ticket #0001/);

    const createdChannel = discord.guildChannels.get(ticket.channelId);
    assert.equal(createdChannel.parentId, CATEGORY_ID);
    const everyoneOverwrite = createdChannel.permissionOverwrites.find((o) => o.id === GUILD_ID && o.type === OverwriteType.Role);
    const openerOverwrite = createdChannel.permissionOverwrites.find((o) => o.id === OPENER_ID && o.type === OverwriteType.Member);
    const staffOverwrite = createdChannel.permissionOverwrites.find((o) => o.id === STAFF_ROLE_ID && o.type === OverwriteType.Role);
    assert.ok(everyoneOverwrite.deny.includes(PermissionFlagsBits.ViewChannel));
    assert.ok(openerOverwrite.allow.includes(PermissionFlagsBits.ViewChannel));
    assert.ok(staffOverwrite.allow.includes(PermissionFlagsBits.ViewChannel));

    // 4. maxOpenPerUser = 1 blocks second ticket
    const secondOpenReplies = [];
    await listener.onInteraction({
        customId: TICKET_IDS.open,
        guildId: GUILD_ID,
        guild,
        user: { id: OPENER_ID, username: 'alice', globalName: 'Alice' },
        isButton: () => true,
        inCachedGuild: () => true,
        isRepliable: () => true,
        deferReply: async () => {},
        editReply: async (msg) => secondOpenReplies.push(msg),
    });
    assert.equal(prisma.tickets.length, 1);
    assert.match(secondOpenReplies[0], /เปิด Ticket อยู่ครบจำนวนสูงสุดแล้ว/);

    // 5. Claim rejects non-staff user
    const nonStaffClaimReplies = [];
    await listener.onInteraction({
        customId: TICKET_IDS.claim(ticket.id),
        guildId: GUILD_ID,
        channelId: ticket.channelId,
        guild,
        user: { id: OPENER_ID, username: 'alice' },
        member: {
            permissions: new PermissionsBitField([]),
            roles: { cache: new Map() },
        },
        isButton: () => true,
        inCachedGuild: () => true,
        isRepliable: () => true,
        reply: async (payload) => nonStaffClaimReplies.push(payload),
    });
    assert.match(nonStaffClaimReplies[0].content, /เฉพาะทีมงาน/);
    assert.equal(prisma.tickets[0].claimedById, null);

    // 6. Claim succeeds for staff role member & updates embed
    const claimUpdates = [];
    const claimFollowUps = [];
    await listener.onInteraction({
        customId: TICKET_IDS.claim(ticket.id),
        guildId: GUILD_ID,
        channelId: ticket.channelId,
        guild,
        user: { id: STAFF_USER_ID, username: 'bob_staff' },
        member: {
            permissions: new PermissionsBitField([]),
            roles: { cache: new Map([[STAFF_ROLE_ID, { id: STAFF_ROLE_ID }]]) },
        },
        isButton: () => true,
        inCachedGuild: () => true,
        isRepliable: () => true,
        update: async (payload) => claimUpdates.push(payload),
        followUp: async (payload) => claimFollowUps.push(payload),
    });
    assert.equal(prisma.tickets[0].claimedById, STAFF_USER_ID);
    assert.equal(claimUpdates.length, 1);
    assert.match(claimFollowUps[0].content, /รับเรื่อง Ticket นี้แล้ว/);

    // 7. Close confirmation prompt
    const askCloseReplies = [];
    await listener.onInteraction({
        customId: TICKET_IDS.close(ticket.id),
        guildId: GUILD_ID,
        channelId: ticket.channelId,
        guild,
        user: { id: OPENER_ID, username: 'alice' },
        member: { permissions: new PermissionsBitField([]), roles: { cache: new Map() } },
        isButton: () => true,
        inCachedGuild: () => true,
        isRepliable: () => true,
        reply: async (payload) => askCloseReplies.push(payload),
    });
    assert.equal(askCloseReplies[0].flags, MessageFlags.Ephemeral);
    assert.equal(askCloseReplies[0].components.length, 1);

    // 8. Confirm close -> paginated fetch (120 msgs), save transcript, logChannel, DM, delete channel
    const closeUpdates = [];
    await listener.onInteraction({
        customId: TICKET_IDS.closeConfirm(ticket.id),
        guildId: GUILD_ID,
        channelId: ticket.channelId,
        guild,
        user: { id: STAFF_USER_ID, username: 'bob_staff' },
        member: {
            permissions: new PermissionsBitField([]),
            roles: { cache: new Map([[STAFF_ROLE_ID, { id: STAFF_ROLE_ID }]]) },
        },
        isButton: () => true,
        inCachedGuild: () => true,
        isRepliable: () => true,
        update: async (payload) => closeUpdates.push(payload),
    });

    const closed = prisma.tickets[0];
    assert.equal(closed.status, 'CLOSED');
    assert.equal(closed.closedById, STAFF_USER_ID);
    assert.ok(closed.closedAt);
    assert.match(closed.transcriptMarkdown, /Chat line 1/);
    assert.match(closed.transcriptMarkdown, /Chat line 120/);
    assert.equal(discord.deletedChannels.length, 1);
    assert.equal(discord.deletedChannels[0].id, ticket.channelId);

    const logDelivery = discord.sentMessages.find((m) => m.channelId === LOG_CH_ID);
    assert.ok(logDelivery);
    assert.equal(logDelivery.payload.files.length, 2);
    assert.equal(discord.dmMessages.length, 1);
    assert.equal(discord.dmMessages[0].uid, OPENER_ID);
    assert.equal(discord.dmMessages[0].payload.files.length, 2);

    // 9. History listing & transcript download endpoints
    const list = await service.listTickets(GUILD_ID, { page: 1, status: 'CLOSED', q: '#0001' });
    assert.equal(list.items.length, 1);
    assert.equal(list.openCount, 0);
    assert.equal(list.closedCount, 1);
    assert.equal(list.items[0].hasTranscript, true);

    const mdFile = await service.getTranscriptFile(GUILD_ID, ticket.id, 'md');
    assert.equal(mdFile.filename, 'ticket-0001.md');
    assert.match(mdFile.buffer.toString('utf8'), /# Transcript — Ticket #0001/);

    const htmlFile = await service.getTranscriptFile(GUILD_ID, ticket.id, 'html');
    assert.equal(htmlFile.filename, 'ticket-0001.html');
    assert.match(htmlFile.buffer.toString('utf8'), /<!DOCTYPE html>/);

    // 10. Verify linear-time ticket search on long '0' repetitions and zero-only queries (CodeQL ReDoS regression test)
    const zeroSearch = await service.listTickets(GUILD_ID, { page: 1, status: 'ALL', q: `${'0'.repeat(10_000)}abc` });
    assert.equal(zeroSearch.items.length, 0);
    const allZeroSearch = await service.listTickets(GUILD_ID, { page: 1, status: 'ALL', q: '#0000' });
    assert.equal(allZeroSearch.items.length, 0);

    // 11. TicketsController endpoints (config GET/POST/PATCH, publishPanel, list, detail, downloadTranscript, closeTicket)
    assert.ok(TicketsModule);
    assert.ok(TicketListQueryDto.schema);
    assert.ok(TicketTranscriptQueryDto.schema);
    assert.ok(UpdateTicketConfigDto.schema);

    const controller = new TicketsController(service);
    const cfgBefore = await controller.getConfig(GUILD_ID);
    assert.equal(cfgBefore.categoryId, CATEGORY_ID);

    const postCfgAudit = {};
    const savedPost = await controller.saveConfigPost(GUILD_ID, { panelTitle: 'Updated Title', maxOpenPerUser: 2 }, postCfgAudit);
    assert.equal(savedPost.success, true);
    assert.equal(savedPost.config.panelTitle, 'Updated Title');
    assert.ok(postCfgAudit.extra.before);

    const patchCfgAudit = {};
    const savedPatch = await controller.saveConfigPatch(GUILD_ID, { dmTranscript: false }, patchCfgAudit);
    assert.equal(savedPatch.config.dmTranscript, false);

    const pubAudit = {};
    const pubRes = await controller.publishPanel(GUILD_ID, pubAudit);
    assert.ok(pubRes.messageId);
    assert.equal(pubAudit.extra.messageId, pubRes.messageId);

    const ctrlList = await controller.listTickets(GUILD_ID, { page: 1, status: 'CLOSED', q: '#0001' });
    assert.equal(ctrlList.items.length, 1);

    const detail = await controller.getTicketDetail(GUILD_ID, String(ticket.id));
    assert.equal(detail.id, ticket.id);
    assert.match(detail.transcriptMarkdown, /Chat line 1/);

    const headers = {};
    let sentBuffer = null;
    const mockRes = {
        setHeader(k, v) {
            headers[k] = v;
        },
        send(buf) {
            sentBuffer = buf;
        },
    };
    await controller.downloadTranscript(GUILD_ID, String(ticket.id), { format: 'html' }, mockRes);
    assert.match(headers['Content-Type'], /text\/html/);
    assert.match(headers['Content-Disposition'], /ticket-0001\.html/);
    assert.ok(Buffer.isBuffer(sentBuffer));

    // Open a second ticket and close it via TicketsController.closeTicket
    const secondTicket = await prisma.ticket.create({
        data: { guildId: GUILD_ID, ticketNumber: 2, openerId: OPENER_ID, status: 'OPEN' },
    });
    const closeAudit = {};
    const closedViaCtrl = await controller.closeTicket(GUILD_ID, String(secondTicket.id), { discordId: STAFF_USER_ID }, closeAudit);
    assert.equal(closeAudit.targetId, String(secondTicket.id));
    assert.equal(closedViaCtrl.status, 'CLOSED');
});
