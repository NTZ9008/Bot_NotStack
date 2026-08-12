const config = require('../config');
const { getClient } = require('../discordClient');
const prOpenedPayload = require('../discord/embeds/prOpened');
const prClosedPayload = require('../discord/embeds/prClosed');
const { saveMessage, getMessage } = require('../store/messageStore');

module.exports = async function handlePullRequest(payload) {
    const { action, pull_request: pr, repository: repo } = payload;
    if (!pr || !repo) return;

    const channelId = await config.getChannelId();
    if (!channelId) return console.error('[prbot] ยังไม่ได้ตั้งค่า PR_CHANNEL_ID ในหน้า Dashboard');

    const client = getClient();
    if (!client) return console.error('[prbot] Discord client ยังไม่พร้อม');

    const channel = client.channels.cache.get(channelId)
        || await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return console.error('[prbot] ไม่พบ channel:', channelId);

    if (['opened', 'reopened', 'ready_for_review'].includes(action)) {
        const message = await channel.send(prOpenedPayload(pr, repo));
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
