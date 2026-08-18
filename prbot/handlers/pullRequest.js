const config = require('../config');
const { getClient } = require('../discordClient');
const prOpenedPayload = require('../discord/embeds/prOpened');
const prClosedPayload = require('../discord/embeds/prClosed');
const { saveMessage, getMessage } = require('../store/messageStore');

// แต่ละ GitHub org แยก channel ได้ตาม PR_ORG_CHANNEL_MAP (ตั้งผ่าน Dashboard) — org ที่ไม่ได้ระบุไว้จะ fallback ไป channel default
async function resolveChannelId(repo) {
    const orgLogin = repo.full_name.split('/')[0];
    const orgChannel = await config.getChannelIdForOrg(orgLogin);
    if (orgChannel) return orgChannel;
    return config.getDefaultChannelId();
}

// แต่ละ repo mention role ได้ตาม PR_REPO_MENTION_MAP (ตั้งผ่าน Dashboard) — repo ที่ไม่ได้ระบุไว้จะไม่ mention เลย
// ต้องใส่เป็น content ของข้อความ (ไม่ใช่ใน embed) ถึงจะ ping แจ้งเตือนจริงได้ — ข้อจำกัดของ Discord
async function resolveMention(repo, channel) {
    const mentionValue = await config.getMentionForRepo(repo.full_name);
    if (!mentionValue) return '';
    if (mentionValue.startsWith('<@')) return mentionValue; // ตั้งเป็น mention tag ตรงๆ อยู่แล้ว

    // ไม่งั้นถือว่าเป็นชื่อ Role แล้วค้นหาใน guild ของ channel นี้ (เหมือนที่ index.js ทำกับ reactionRolesMap)
    const role = channel.guild?.roles.cache.find(r => r.name === mentionValue);
    if (role) return `<@&${role.id}>`;

    console.error(`[prbot] ไม่พบ role ชื่อ "${mentionValue}" ใน guild — ส่งเป็นข้อความเฉยๆ แทนการ mention จริง`);
    return `@${mentionValue}`;
}

module.exports = async function handlePullRequest(payload) {
    const { action, pull_request: pr, repository: repo } = payload;
    if (!pr || !repo) return;

    const channelId = await resolveChannelId(repo);
    if (!channelId) return console.error('[prbot] ยังไม่ได้ตั้งค่า channel สำหรับ PR นี้ในหน้า Dashboard');

    const client = getClient();
    if (!client) return console.error('[prbot] Discord client ยังไม่พร้อม');

    const channel = client.channels.cache.get(channelId)
        || await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return console.error('[prbot] ไม่พบ channel:', channelId);

    if (['opened', 'reopened', 'ready_for_review'].includes(action)) {
        const mention = await resolveMention(repo, channel);
        const payloadOut = { ...prOpenedPayload(pr, repo), ...(mention ? { content: mention } : {}) };
        const message = await channel.send(payloadOut);
        await saveMessage(repo.full_name, pr.number, channel.id, message.id);
        return;
    }

    if (action === 'closed') {
        const existing = await getMessage(repo.full_name, pr.number);
        if (!existing) return; // ไม่เคยเห็น "opened" มาก่อน (เช่น bot เพิ่งเปิดใช้งาน) → ข้าม
        const msg = await channel.messages.fetch(existing.messageId).catch(() => null);
        if (!msg) return;
        // pr.merged = true → สีม่วง "Merged", false → สีแดง "Closed"
        await msg.edit(prClosedPayload(pr, repo));
    }
};
