const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../apps/backend/node_modules/reflect-metadata');
const { loadImage } = require('../apps/backend/node_modules/@napi-rs/canvas');
const { PermissionFlagsBits } = require('../apps/backend/node_modules/discord.js');
const shared = require('../packages/shared/dist');
const { RankCardRenderer, compactNumber } = require('../apps/backend/dist/rank/rank-card.renderer');
const { RankCardService } = require('../apps/backend/dist/rank/rank-card.service');
const { RankCardStore } = require('../apps/backend/dist/rank/rank-card.store');
const { LevelUpService } = require('../apps/backend/dist/rank/level-up.service');
const { RankCardController } = require('../apps/backend/dist/rank/rank-card.controller');
const { leaderboardButtons } = require('../apps/backend/dist/commands/slash/leaderboard.command');
const { XpCommand } = require('../apps/backend/dist/commands/slash/xp.command');
const { GUILD_ACCESS_KEY } = require('../apps/backend/dist/guilds/decorators/guild-route.decorator');

const quiet = (target) => {
    target.logger = { log() {}, warn() {}, error() {} };
    return target;
};

// --- shared: theme / member style ---
test('theme normalization falls back field by field and caps member backgrounds', () => {
    const theme = shared.normalizeRankTheme({
        style: { layout: 'nope', accentColor: '#ABCDEF', background: { type: 'image', imageId: null, overlayOpacity: 5 }, show: { rank: false } },
        members: { enabled: false, backgroundIds: [3, 3, '4', -1, 'x', ...Array.from({ length: 40 }, (_, i) => i + 10)] },
    });
    const def = shared.defaultRankTheme();
    assert.equal(theme.style.layout, def.style.layout);
    assert.equal(theme.style.accentColor, '#abcdef');
    // แบบรูปแต่ไม่มีรูป = สีพื้น
    assert.equal(theme.style.background.type, 'color');
    assert.equal(theme.style.background.overlayOpacity, 0.9);
    assert.equal(theme.style.show.rank, false);
    assert.equal(theme.style.show.level, true);
    assert.equal(theme.members.enabled, false);
    assert.deepEqual(theme.members.backgroundIds.slice(0, 3), [3, 4, 10]);
    assert.equal(theme.members.backgroundIds.length, shared.RANK_LIMITS.maxMemberBackgrounds);
    assert.deepEqual(shared.normalizeRankTheme('garbage'), def);
});
test('member customisation only applies what the theme allows', () => {
    const theme = shared.defaultRankTheme();
    theme.members = { enabled: true, layout: true, colors: false, backgrounds: true, backgroundIds: [7] };
    const member = shared.normalizeMemberStyle({
        layout: 'minimal',
        accentColor: '#FF0000',
        textColor: 'red',
        background: { type: 'image', imageId: 7 },
    });
    assert.deepEqual(member, { layout: 'minimal', accentColor: '#ff0000', background: { type: 'image', color: '#1e1b4b', color2: '#312e81', imageId: 7 } });
    const style = shared.applyMemberStyle(theme, member);
    assert.equal(style.layout, 'minimal');
    assert.equal(style.accentColor, theme.style.accentColor);
    assert.equal(style.background.imageId, 7);
    // รูปที่ไม่อยู่ในรายการที่อนุญาต / พื้นหลังสีเมื่อไม่ให้เปลี่ยนสี → ไม่ใช้
    assert.equal(shared.applyMemberStyle(theme, { background: { type: 'image', color: '#000000', color2: '#000000', imageId: 8 } }).background.type, theme.style.background.type);
    assert.deepEqual(shared.allowedMemberStyle(theme, { background: { type: 'color', color: '#000000', color2: '#000000', imageId: null } }), {});
    theme.members.enabled = false;
    assert.deepEqual(shared.applyMemberStyle(theme, member), theme.style);
});

// --- shared: level-up + rewards ---
test('level-up settings keep one level per role, sorted, within limits', () => {
    const settings = shared.normalizeLevelUpSettings({
        announce: true,
        destination: 'moon',
        channelId: 'abc',
        message: 'x'.repeat(900),
        rewards: [
            { level: 20, roleId: '22222' },
            { level: 5, roleId: '11111' },
            { level: 10, roleId: '11111' },
            { level: 0, roleId: '33333' },
            { level: 3, roleId: 'not-a-role' },
        ],
    });
    assert.equal(settings.destination, 'current');
    assert.equal(settings.channelId, '');
    assert.equal(settings.message.length, shared.RANK_LIMITS.maxMessageLength);
    assert.deepEqual(settings.rewards, [
        { level: 5, roleId: '11111' },
        { level: 20, roleId: '22222' },
    ]);
});
test('reward plans stack or replace, remove on level loss and never touch other roles', () => {
    const rewards = [
        { level: 5, roleId: 'r5' },
        { level: 10, roleId: 'r10' },
        { level: 10, roleId: 'r10b' },
        { level: 20, roleId: 'r20' },
    ];
    assert.deepEqual(shared.rewardRolesForLevel({ rewards, stackRewards: true }, 12), ['r5', 'r10', 'r10b']);
    assert.deepEqual(shared.rewardRolesForLevel({ rewards, stackRewards: false }, 12), ['r10', 'r10b']);
    assert.deepEqual(shared.rewardRolesForLevel({ rewards, stackRewards: false }, 2), []);
    assert.deepEqual(shared.planRewardChanges({ rewards, stackRewards: false }, 12, ['r5', 'other']), { add: ['r10', 'r10b'], remove: ['r5'] });
    assert.deepEqual(shared.planRewardChanges({ rewards, stackRewards: true }, 7, ['r5', 'r20', 'other']), { add: [], remove: ['r20'] });
    assert.equal(
        shared.fillLevelUpMessage('{mention} → {level} ({previousLevel}) {roles} {unknown}', { mention: '<@1>', user: 'A', level: '5', previousLevel: '4', server: 'S', roles: 'VIP' }),
        '<@1> → 5 (4) VIP {unknown}',
    );
});

// --- renderer ---
const progress = { level: 12, xp: 15500, levelStartXp: 14400, nextLevelXp: 16900 };
const rankData = { ...progress, displayName: 'ชื่อยาวมากๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆ 🚀', username: 'user', avatar: null, rank: 123456, serverName: 'S' };
test('every rank layout, the leaderboard and the level-up card render PNGs at their declared sizes', async () => {
    const renderer = new RankCardRenderer();
    for (const layout of shared.RANK_LAYOUTS) {
        for (const background of [{ type: 'color' }, { type: 'gradient', angle: 135 }]) {
            const style = { ...shared.defaultRankStyle(), layout, background: { ...shared.defaultRankStyle().background, ...background } };
            const image = await loadImage(await renderer.renderRank(style, rankData, { background: null }));
            assert.deepEqual([image.width, image.height], [shared.RANK_CARD_SIZES[layout].width, shared.RANK_CARD_SIZES[layout].height]);
        }
    }
    const rows = Array.from({ length: 10 }, (_, i) => ({ ...progress, rank: i + 1, displayName: `User ${i}`, avatar: null }));
    const board = await loadImage(await renderer.renderLeaderboard(shared.defaultRankStyle(), { serverName: 'S', serverIcon: null, page: 1, totalPages: 3, rows }, { background: null }));
    const empty = await loadImage(await renderer.renderLeaderboard(shared.defaultRankStyle(), { serverName: 'S', serverIcon: null, page: 1, totalPages: 1, rows: [] }, { background: null }));
    assert.equal(board.width, 1000);
    assert(board.height > empty.height);
    const levelUp = await loadImage(await renderer.renderLevelUp(shared.defaultRankStyle(), { displayName: 'A', avatar: null, previousLevel: 9, level: 10, rewardNames: ['VIP'] }, { background: null }));
    assert.deepEqual([levelUp.width, levelUp.height], [shared.LEVEL_UP_CARD_SIZE.width, shared.LEVEL_UP_CARD_SIZE.height]);
    assert.equal(compactNumber(999), '999');
    assert.equal(compactNumber(12345), '12.3K');
    assert.equal(compactNumber(2_500_000), '2.5M');
});

// --- service ---
function levelsFake(total) {
    const calls = [];
    return {
        calls,
        list: async (_guild, query) => {
            calls.push(query);
            const start = (query.page - 1) * query.pageSize;
            const items = Array.from({ length: Math.max(0, Math.min(query.pageSize, total - start)) }, (_, i) => ({
                userId: String(start + i),
                username: `U${start + i}`,
                xp: 1000,
                level: 3,
                rank: start + i + 1,
            }));
            return { items, total, page: query.page, pageSize: query.pageSize, searchLimited: false, settings: { curveBase: 100, curveExponent: 2 } };
        },
    };
}
function serviceFixture(total, theme = shared.defaultRankTheme()) {
    const levels = levelsFake(total);
    const rendered = [];
    const renderer = {
        renderLeaderboard: async (style, data) => {
            rendered.push({ style, data });
            return Buffer.from('png');
        },
    };
    const store = { theme: async () => theme, memberStyle: async () => null };
    const images = { loadAvatarImage: async () => null, loadImageUrl: async () => null, loadAssetImage: async () => null };
    const discord = { ready: null, guild: () => null, fetchUser: async () => null };
    return { service: quiet(new RankCardService(store, renderer, images, { getAssetInfo: async () => null }, levels, discord)), levels, rendered };
}
test('leaderboard clamps pages past the end and only uses sample rows for previews', async () => {
    const { service, levels, rendered } = serviceFixture(23);
    const result = await service.renderLeaderboard('g', 9);
    assert.deepEqual([result.page, result.totalPages, result.total], [3, 3, 23]);
    assert.deepEqual(
        levels.calls.map((q) => q.page),
        [9, 3],
    );
    assert.equal(rendered[0].data.rows.length, 3);
    const empty = serviceFixture(0);
    await empty.service.renderLeaderboard('g', 1);
    assert.equal(empty.rendered[0].data.rows.length, 0);
    await empty.service.renderLeaderboard('g', 1, undefined, true);
    assert.equal(empty.rendered[1].data.rows.length, 10);
});
test('themes and previews may only reference images from the same server', async () => {
    const service = new RankCardService({}, {}, {}, { getAssetInfo: async (guildId, id) => (guildId === 'g' && id === 1 ? { id } : null) }, {}, {});
    await service.assertOwnedAssets('g', [1, 1]);
    await assert.rejects(service.assertOwnedAssets('g', [1, 2]), /ไม่พบรูปพื้นหลัง/);
    await assert.rejects(service.assertOwnedAssets('other', [1]), /ไม่พบรูปพื้นหลัง/);
});
test('saving a member card keeps only what the current theme allows', async () => {
    const theme = shared.defaultRankTheme();
    theme.members = { enabled: true, layout: false, colors: true, backgrounds: false, backgroundIds: [] };
    const writes = [];
    const prisma = {
        rankCardSetting: { findUnique: async () => ({ theme }) },
        rankCardMember: { upsert: async (args) => writes.push(['upsert', args.create.style]), deleteMany: async () => writes.push(['delete']) },
    };
    const store = new RankCardStore(prisma);
    assert.deepEqual(await store.saveMemberStyle('g', 'u', { layout: 'minimal', accentColor: '#000000' }), { accentColor: '#000000' });
    assert.deepEqual(await store.saveMemberStyle('g', 'u', { layout: 'minimal' }), {});
    assert.deepEqual(writes, [['upsert', { accentColor: '#000000' }], ['delete']]);
});

// --- level-up announcements + rewards ---
function levelUpFixture({ settings, channels = {}, memberRoles = [], botPosition = 50 }) {
    const roleAt = (id, position, managed = false) => ({ id, name: `Role ${id}`, position, managed });
    const roles = new Map([
        ['r5', roleAt('r5', 10)],
        ['r10', roleAt('r10', 20)],
        ['high', roleAt('high', 99)],
        ['bot', roleAt('bot', 5, true)],
    ]);
    const sent = [];
    const roleOps = [];
    const me = { permissions: { has: () => true }, roles: { highest: { position: botPosition } } };
    const member = {
        id: 'u',
        displayName: 'Member',
        user: { id: 'u', bot: false },
        roles: {
            cache: new Map(memberRoles.map((id) => [id, roles.get(id)])),
            add: async (list) => roleOps.push(['add', list.map((r) => r.id)]),
            remove: async (list) => roleOps.push(['remove', list.map((r) => r.id)]),
        },
        send: async (payload) => sent.push(['dm', payload]),
    };
    const guild = { id: 'g', name: 'G', roles: { cache: roles }, members: { me, fetch: async () => member } };
    const channel = (id, ok) => ({ id, guild, isSendable: () => true, permissionsFor: () => ({ has: () => ok }), send: async (payload) => sent.push([id, payload]) });
    const discord = { guild: () => guild, fetchGuildChannel: async (_g, id) => (id in channels ? channel(id, channels[id]) : null) };
    const service = quiet(
        new LevelUpService(
            { levelChanges: { subscribe() {} } },
            // ยศใน fixture ไม่ใช่ snowflake จึงไม่ผ่าน normalize — ใส่ค่าตรงๆ
            { levelUp: async () => ({ ...shared.defaultLevelUpSettings(), ...settings }) },
            { renderLevelUp: async () => Buffer.from('png') },
            discord,
            {},
        ),
    );
    return { service, sent, roleOps };
}
const change = (data) => ({ guildId: 'g', userId: 'u', previousLevel: 9, level: 10, xp: 10000, source: 'message', channelId: 'chat', ...data });
test('level-up grants assignable reward roles and announces in the chat channel with the card', async () => {
    const fx = levelUpFixture({
        settings: {
            announce: true,
            message: '{mention} ถึงเลเวล {level} ได้ {roles}',
            rewards: [
                { level: 5, roleId: 'r5' },
                { level: 10, roleId: 'r10' },
                { level: 10, roleId: 'high' },
            ],
            stackRewards: false,
        },
        channels: { chat: true },
    });
    await fx.service.handle(change({}));
    // high อยู่สูงกว่ายศของบอท → ข้าม, r5 ถูกแทนด้วย r10 (ไม่ซ้อน) แต่สมาชิกไม่มี r5 อยู่แล้ว
    assert.deepEqual(fx.roleOps, [['add', ['r10']]]);
    assert.equal(fx.sent.length, 1);
    const [where, payload] = fx.sent[0];
    assert.equal(where, 'chat');
    assert.equal(payload.content, '<@u> ถึงเลเวล 10 ได้ Role r10');
    assert.deepEqual(payload.allowedMentions, { users: ['u'] });
    assert.equal(payload.files.length, 1);
});
test('level-up falls back to the configured channel, skips admin edits and removes rewards on level loss', async () => {
    const base = { announce: true, destination: 'current', channelId: 'fallback', showCard: false };
    const fx = levelUpFixture({ settings: base, channels: { chat: false, fallback: true } });
    await fx.service.handle(change({}));
    assert.equal(fx.sent[0][0], 'fallback');
    assert.equal(fx.sent[0][1].files.length, 0);

    const rewards = [
        { level: 5, roleId: 'r5' },
        { level: 10, roleId: 'r10' },
    ];
    const admin = levelUpFixture({ settings: { ...base, rewards }, channels: { chat: true }, memberRoles: ['r5', 'r10'] });
    await admin.service.handle(change({ source: 'admin.subtract', previousLevel: 10, level: 6 }));
    assert.equal(admin.sent.length, 0);
    assert.deepEqual(admin.roleOps, [['remove', ['r10']]]);

    const dm = levelUpFixture({ settings: { ...base, destination: 'dm' } });
    await dm.service.handle(change({}));
    assert.equal(dm.sent[0][0], 'dm');
});
test('reward warnings explain roles the bot cannot manage', async () => {
    const fx = levelUpFixture({ settings: {}, botPosition: 15 });
    const warnings = await fx.service.warnings('g', {
        ...shared.defaultLevelUpSettings(),
        rewards: [
            { level: 1, roleId: 'r5' },
            { level: 2, roleId: 'r10' },
            { level: 3, roleId: 'bot' },
            { level: 4, roleId: 'gone' },
        ],
    });
    assert.equal(warnings.length, 3);
    assert.match(warnings.join('\n'), /Role r10.*สูงกว่ายศของบอท/);
    assert.match(warnings.join('\n'), /integration/);
    assert.match(warnings.join('\n'), /เลเวล 4 ถูกลบ/);
});

// --- commands / API access ---
test('leaderboard buttons encode the target page and disable at the ends', () => {
    const ids = (row) => row.components.map((b) => [b.data.custom_id, Boolean(b.data.disabled)]);
    assert.deepEqual(ids(leaderboardButtons(1, 3)), [
        ['leaderboard:page:0', true],
        ['leaderboard:current', true],
        ['leaderboard:page:2', false],
    ]);
    assert.deepEqual(ids(leaderboardButtons(3, 3))[2], ['leaderboard:page:4', true]);
});
test('/xp history hides admin reasons from members and blocks viewing others without Manage Server', async () => {
    const history = {
        items: [
            { id: 2, userId: 'u', source: 'admin.add', delta: 50, balance: 150, reason: 'internal note', createdAt: new Date().toISOString() },
            { id: 1, userId: 'u', source: 'message', delta: 100, balance: 100, reason: 'แชท', createdAt: new Date().toISOString() },
        ],
        nextCursor: null,
    };
    const levels = { history: async () => history, today: async () => ({ earned: 100, dailyCap: 500 }) };
    const run = async ({ manager, target }) => {
        const out = {};
        await new XpCommand(levels).execute({
            guildId: 'g',
            user: { id: 'u', username: 'u', displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png' },
            member: { displayName: 'U' },
            inCachedGuild: () => true,
            memberPermissions: { has: (perm) => manager && perm === PermissionFlagsBits.ManageGuild },
            options: { getUser: () => target ?? null, getMember: () => null },
            reply: async (payload) => (out.reply = payload),
            deferReply: async () => {},
            editReply: async (payload) => (out.edit = payload),
        });
        return out;
    };
    const member = await run({ manager: false });
    const text = member.edit.embeds[0].data.description;
    assert.doesNotMatch(text, /internal note/);
    assert.match(text, /\(แชท\)/);
    assert.match(member.edit.embeds[0].data.footer.text, /100 XP จากเพดาน 500/);
    assert.match((await run({ manager: true })).edit.embeds[0].data.description, /internal note/);
    const other = await run({ manager: false, target: { id: 'x', bot: false, username: 'x', displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png' } });
    assert.match(other.reply.content, /Manage Server/);
});
test('rank card API: members reach only their own card routes, theme and level-up need manage', () => {
    const access = (name) => Reflect.getMetadata(GUILD_ACCESS_KEY, RankCardController.prototype[name]) ?? Reflect.getMetadata(GUILD_ACCESS_KEY, RankCardController);
    for (const name of ['meta', 'me', 'saveMine', 'resetMine', 'previewMine', 'background']) assert.equal(access(name), 'view', name);
    for (const name of ['theme', 'saveTheme', 'preview', 'levelUpSettings', 'saveLevelUp', 'syncRewards']) assert.equal(access(name), 'manage', name);
});
