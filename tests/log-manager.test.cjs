const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const backendRequire = createRequire(require.resolve('../apps/backend/package.json'));
const { EmbedBuilder } = backendRequire('discord.js');
const { DEFAULT_LOG_APPEARANCE: defaults, LOG_EVENTS, formatLogEmbed, updateLogOptionsSchema } = require('../packages/shared/dist');
const { LogSettingsService } = require('../apps/backend/dist/log-manager/services/log-settings.service');
const { LogDispatcher } = require('../apps/backend/dist/log-manager/services/log-dispatcher.service');

const payload = {
    title: '📝 แก้ไขข้อความ',
    description: '<@123> แก้ไขข้อความ',
    thumbnail: 'https://cdn.discordapp.com/embed/avatars/0.png',
    fields: [
        null,
        { name: '👤 ผู้เขียน', value: '<@123>' },
        { name: '🆔 User ID', value: '123' },
        { name: 'ก่อนแก้ไข', value: 'a'.repeat(1100), inline: false },
        { name: 'หลังแก้ไข', value: 'ข้อความใหม่', inline: false },
    ],
};

test('appearance validation rejects invalid layouts, lengths, and booleans; accepts legacy option updates', () => {
    assert.equal(updateLogOptionsSchema.safeParse({ ignoreBots: false }).success, true);
    for (const patch of [{ layout: 'invalid' }, { maxContentLength: 6000 }, { showIds: 'false' }, { footerText: 'a'.repeat(101) }]) {
        assert.equal(updateLogOptionsSchema.safeParse({ appearance: { ...defaults, ...patch } }).success, false);
    }
    assert.equal(updateLogOptionsSchema.parse({ appearance: { ...defaults, footerText: '  ทีมงาน  ' } }).appearance.footerText, 'ทีมงาน');
});

test('readable defaults hide IDs and field icons, preserve before/after and original activity payload', () => {
    const before = JSON.stringify(payload);
    const result = formatLogEmbed('messageUpdate', payload);
    assert.equal(result.fields.length, 3);
    assert.equal(result.fields[0].name, 'ผู้เขียน');
    assert.equal(result.fields[0].inline, true);
    assert.equal(result.fields[1].name, 'ก่อนแก้ไข');
    assert.equal(result.fields[1].value.length, 500);
    assert.equal(result.fields[1].inline, false);
    assert.equal(result.fields[2].value, 'ข้อความใหม่');
    assert.equal(JSON.stringify(payload), before);
    assert.doesNotThrow(() => new EmbedBuilder(result).toJSON());
});

test('all presentation controls affect delivery and preserve event-specific footer context', () => {
    const result = formatLogEmbed(
        'memberJoin',
        { ...payload, footer: 'รายละเอียดเฉพาะเหตุการณ์' },
        {
            ...defaults,
            layout: 'comfortable',
            showIds: true,
            showFieldIcons: true,
            showThumbnail: false,
            showTimestamp: false,
            footerText: 'ทีมดูแล',
            maxContentLength: 250,
        },
        '#ABCDEF',
    );
    assert.equal(result.color, 0xabcdef);
    assert.equal(result.fields[0].name, '👤 ผู้เขียน');
    assert.ok(result.fields.some((f) => f.name.includes('ID')));
    assert.ok(result.fields.every((f) => !f.inline));
    assert.equal(result.fields[2].value.length, 250);
    assert.equal(result.thumbnail, undefined);
    assert.equal(result.timestamp, undefined);
    assert.equal(result.footer.text, 'ทีมดูแล • รายละเอียดเฉพาะเหตุการณ์');
    assert.equal(formatLogEmbed('memberJoin', {}, { ...defaults, footerText: '' }).footer, undefined);
});

test('every catalog event builds a valid embed; extreme payloads respect Discord total and per-field limits', () => {
    for (const event of LOG_EVENTS) {
        assert.doesNotThrow(() => new EmbedBuilder(formatLogEmbed(event.key, {})).toJSON());
    }
    const embed = formatLogEmbed(
        'messageUpdate',
        {
            title: 't'.repeat(500),
            description: 'd'.repeat(6000),
            footer: 'f'.repeat(3000),
            fields: Array.from({ length: 40 }, () => ({ name: 'n'.repeat(300), value: 'v'.repeat(5000) })),
        },
        { ...defaults, maxContentLength: 1024 },
        'invalid',
    );
    assert.ok(embed.title.length <= 256);
    assert.ok(embed.description.length <= 4096);
    assert.ok(embed.footer.text.length <= 2048);
    assert.ok(embed.fields.length <= 25);
    assert.match(embed.description, /มีรายละเอียดอีก/);
    assert.ok(embed.fields.every((f) => f.name.length <= 256 && f.value.length <= 1024));
    const total =
        embed.title.length + embed.description.length + embed.footer.text.length + embed.fields.reduce((sum, f) => sum + f.name.length + f.value.length, 0);
    assert.ok(total <= 5500);
    assert.doesNotThrow(() => new EmbedBuilder(embed).toJSON());
});

function database() {
    const options = new Map();
    const settings = new Map();
    const table = (rows, field) => ({
        createMany: async ({ data }) => {
            for (const row of data) {
                const key = `${row.guildId}:${row[field]}`;
                if (!rows.has(key)) rows.set(key, { ...row });
            }
        },
        findMany: async ({ where }) => [...rows.values()].filter((row) => row.guildId === where.guildId).map((row) => ({ ...row })),
        updateMany: async ({ where, data }) => {
            for (const row of rows.values()) if (row.guildId === where.guildId && (!where[field] || row[field] === where[field])) Object.assign(row, data);
        },
        upsert: async ({ create, update }) => {
            const key = `${create.guildId}:${create[field]}`;
            rows.set(key, rows.has(key) ? { ...rows.get(key), ...update } : { ...create });
        },
    });
    return { logOption: table(options, 'key'), logSetting: table(settings, 'eventKey'), options };
}

test('appearance survives reload/restart, stays guild-scoped, and legacy/corrupt rows fall back safely', async () => {
    const db = database();
    const service = new LogSettingsService(db);
    assert.deepEqual((await service.listOptions('a')).appearance, defaults);
    const appearance = { ...defaults, footerText: 'ทีม A', showIds: true };
    await service.updateOptions('a', { appearance });
    await service.updateOptions('a', { ignoreBots: false });
    assert.deepEqual(service.getOptions('a').appearance, appearance);
    assert.deepEqual((await service.listOptions('b')).appearance, defaults);
    const restarted = new LogSettingsService(db);
    assert.deepEqual((await restarted.listOptions('a')).appearance, appearance);
    assert.equal((await restarted.listOptions('a')).ignoreBots, false);
    db.options.set('b:APPEARANCE', { guildId: 'b', key: 'APPEARANCE', value: '{broken' });
    assert.deepEqual((await new LogSettingsService(db).listOptions('b')).appearance, defaults);
    db.options.set('b:APPEARANCE', { guildId: 'b', key: 'APPEARANCE', value: '{"layout":"invalid"}' });
    assert.deepEqual((await new LogSettingsService(db).listOptions('b')).appearance, defaults);
});

test('dispatcher uses saved appearance for queued and attached logs without changing activity/filter behavior', async () => {
    const db = database();
    const settings = new LogSettingsService(db);
    await settings.updateSetting('a', 'messageUpdate', { enabled: true, channelId: '123456789012345678', color: '#123456' });
    await settings.updateOptions('a', { appearance: { ...defaults, footerText: 'ทีม A', showTimestamp: false } });
    const sent = [],
        recorded = [];
    const logs = new LogDispatcher(
        { ready: true, fetchGuildChannel: async () => ({ isSendable: () => true, send: async (value) => sent.push(value) }) },
        settings,
        { record: (...args) => recorded.push(args) },
    );
    await logs.sendLog('a', 'messageUpdate', payload);
    await logs.flushQueue('a', '123456789012345678');
    assert.equal(sent[0].embeds[0].data.footer.text, 'ทีม A');
    assert.equal(sent[0].embeds[0].data.timestamp, undefined);
    assert.equal(sent[0].embeds[0].data.color, 0x123456);
    assert.deepEqual(sent[0].allowedMentions, { parse: [] });
    assert.equal(recorded[0][2], payload);
    await logs.sendLog('a', 'messageUpdate', { ...payload, files: ['attachment'] });
    assert.deepEqual(sent[1].files, ['attachment']);
    assert.equal(sent[1].embeds[0].data.footer.text, 'ทีม A');
    await logs.sendLog('a', 'messageUpdate', { ...payload, context: { isBot: true } });
    assert.equal(sent.length, 2);
    assert.equal(recorded.length, 2);
    await settings.setSystemEnabled('a', false);
    await logs.sendLog('a', 'messageUpdate', payload);
    assert.equal(sent.length, 2);
    assert.equal(recorded.length, 3);
});
