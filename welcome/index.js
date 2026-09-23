// ==========================================
// 🎉 WELCOME ANNOUNCEMENT — ส่งการ์ดต้อนรับแบบรูปภาพเมื่อมีสมาชิกใหม่เข้าเซิร์ฟเวอร์
// ระบบใหม่ทั้งหมด แยกจาก Welcome เดิมใน index.js (ข้อความธรรมดาเข้าห้อง WELCOME_CHANNEL_ID) — ไม่แตะของเดิม
// ตั้งค่าการ์ด/รูปพื้นหลัง/ห้องที่จะส่ง ได้จาก Dashboard แท็บ Welcome (API อยู่ใน welcome/routes.js)
// ==========================================
const { Events, AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const store = require('./store');
const { buildVars, fillPlaceholders } = require('./design');
const { loadAssetImage, loadAvatarImage, renderWelcomeImage } = require('./render');

const REQUIRED_PERMISSIONS = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.AttachFiles,
];

// ห้องต้องเป็นห้องข้อความของเซิร์ฟเวอร์เดียวกับสมาชิก และบอทต้องมีสิทธิ์ส่งไฟล์ — คืนข้อความ error ภาษาไทยถ้าส่งไม่ได้
async function resolveTargetChannel(guild, channelId) {
    if (!channelId) return { error: 'การ์ดนี้ยังไม่ได้เลือกห้องที่จะส่ง' };
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return { error: `ไม่พบห้อง ${channelId} ในเซิร์ฟเวอร์ ${guild.name}` };
    if (!channel.isTextBased() || channel.isVoiceBased()) return { error: `ห้อง #${channel.name} ไม่ใช่ห้องข้อความ` };

    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    const permissions = me ? channel.permissionsFor(me) : null;
    if (!permissions || !permissions.has(REQUIRED_PERMISSIONS)) {
        return { error: `บอทไม่มีสิทธิ์ดูห้อง / ส่งข้อความ / แนบไฟล์ ในห้อง #${channel.name}` };
    }
    return { channel };
}

/**
 * สร้างข้อความ (ข้อความ + ไฟล์รูป) ของการ์ด 1 ใบ สำหรับสมาชิก 1 คน
 * @param {object} card แถวจาก store (design ผ่าน normalize แล้ว)
 * @param {{member?: import('discord.js').GuildMember, user?: import('discord.js').User, guild?: import('discord.js').Guild}} target
 */
async function buildWelcomePayload(card, { member = null, user = null, guild = null }) {
    const vars = buildVars({ member, user, guild: guild || member?.guild });
    const [background, avatar] = await Promise.all([
        loadAssetImage(card.backgroundId).catch((err) => {
            console.warn(`[Welcome] โหลดรูปพื้นหลัง #${card.backgroundId} ไม่สำเร็จ:`, err.message);
            return null;
        }),
        card.design.avatar.visible ? loadAvatarImage(member?.user || user) : null,
    ]);

    const image = await renderWelcomeImage({ design: card.design, background, avatar, vars });
    const content = fillPlaceholders(card.content, vars, 'message').trim();

    return {
        content: content || undefined,
        files: [new AttachmentBuilder(image, { name: 'welcome.png' })],
        // แท็กได้เฉพาะคนที่เพิ่งเข้ามา + ยศที่แอดมินพิมพ์ไว้ในข้อความเอง
        // (กันชื่อเล่นอย่าง "@everyone" ที่ถูกแทนค่าผ่าน {user} กลายเป็นการแท็กทั้งเซิร์ฟเวอร์)
        allowedMentions: {
            users: vars.mentionId ? [vars.mentionId] : [],
            roles: [...String(card.content).matchAll(/<@&(\d+)>/g)].map((m) => m[1]),
        },
    };
}

async function handleMemberJoin(member) {
    // บอทที่ถูกเชิญเข้ามาไม่ต้องได้การ์ดต้อนรับ
    if (member.user.bot) return;

    const cards = await store.listEnabledCards();
    for (const card of cards) {
        try {
            // การ์ดของห้องในเซิร์ฟเวอร์อื่น (กรณีบอทอยู่หลายเซิร์ฟเวอร์) — ข้ามเงียบๆ
            const known = member.client.channels.cache.get(card.channelId);
            if (known && known.guildId !== member.guild.id) continue;

            const { channel, error } = await resolveTargetChannel(member.guild, card.channelId);
            if (!channel) {
                console.warn(`[Welcome] ข้ามการ์ด "${card.name}": ${error}`);
                continue;
            }
            await channel.send(await buildWelcomePayload(card, { member }));
        } catch (err) {
            console.error(`[Welcome] ส่งการ์ด "${card.name}" ให้ ${member.user.tag} ไม่สำเร็จ:`, err);
        }
    }
}

function initWelcome(client) {
    client.on(Events.GuildMemberAdd, (member) => {
        handleMemberJoin(member).catch((err) => console.error('[Welcome] ระบบการ์ดต้อนรับผิดพลาด:', err));
    });
}

module.exports = { initWelcome, buildWelcomePayload, resolveTargetChannel };
