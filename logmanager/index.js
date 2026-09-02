// ==========================================
// 📋 LOG MANAGER
// ดักจับเหตุการณ์ต่างๆ ใน Discord แล้วส่ง embed เข้าห้องที่แอดมินตั้งค่าไว้ต่อรายการ
// เปิด/ปิด + เลือกห้อง + เลือกสี ได้จากหน้า Dashboard แท็บ "Log Management"
// ==========================================
const { Events, EmbedBuilder, AuditLogEvent, AttachmentBuilder } = require('discord.js');
const store = require('./store');
const { LOG_EVENT_MAP } = require('./events');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ==========================================
// 🛠️ HELPERS
// ==========================================

// ตัดข้อความให้ไม่เกินลิมิตของ Discord (field 1024 / description 4096)
function trim(text, max = 1024) {
    const str = String(text ?? '').trim();
    if (!str) return '';
    return str.length > max ? `${str.slice(0, max - 3)}...` : str;
}

function field(name, value, inline = true) {
    const trimmed = trim(value);
    if (!trimmed) return null;
    return { name, value: trimmed, inline };
}

function userLine(user) {
    if (!user) return 'ไม่ทราบ';
    return `<@${user.id}>\n\`${user.tag || user.username || user.id}\``;
}

function executorLine(info) {
    const id = info?.executor?.id || info?.entry?.executorId;
    return id ? `<@${id}>` : 'ไม่ทราบ';
}

// ==========================================
// 🕵️ AUDIT LOG
// ใช้ gateway event guildAuditLogEntryCreate เป็นหลัก (วิธีที่ discord.js แนะนำ)
// เพราะได้ entry ทันทีที่เกิดเหตุ ไม่ต้องยิง REST fetchAuditLogs ทุกครั้ง
// เก็บ entry ที่ไหลเข้ามาไว้ในบัฟเฟอร์สั้นๆ แล้วให้ event ต่างๆ มาจับคู่เอาเอง
// ==========================================
const AUDIT_BUFFER_TTL = 60000;
const AUDIT_BUFFER_MAX = 300;
const auditBuffer = [];

// ถ้าเคยได้รับ entry จาก gateway แล้ว แปลว่า intent + สิทธิ์ครบ → ไม่ต้อง fallback ไปยิง REST อีก
let auditGatewayWorking = false;

function pushAuditEntry(entry, guild) {
    auditGatewayWorking = true;
    auditBuffer.push({ entry, guildId: guild?.id, at: Date.now() });

    const cutoff = Date.now() - AUDIT_BUFFER_TTL;
    while (auditBuffer.length && auditBuffer[0].at < cutoff) auditBuffer.shift();
    while (auditBuffer.length > AUDIT_BUFFER_MAX) auditBuffer.shift();
}

function findInAuditBuffer(guildId, auditType, targetId, maxAgeMs) {
    const cutoff = Date.now() - maxAgeMs;
    for (let i = auditBuffer.length - 1; i >= 0; i--) {
        const rec = auditBuffer[i];
        if (rec.at < cutoff) break;
        if (guildId && rec.guildId && rec.guildId !== guildId) continue;
        if (rec.entry.action !== auditType) continue;
        if (targetId && rec.entry.targetId && rec.entry.targetId !== targetId) continue;
        return { executor: rec.entry.executor, reason: rec.entry.reason, entry: rec.entry };
    }
    return null;
}

/**
 * หาว่าใครเป็นคนลงมือทำ
 * 1) รอ entry จาก gateway (เร็ว ไม่กินโควตา API)
 * 2) ถ้ายังไม่เคยได้ entry จาก gateway เลย ค่อย fallback ไปยิง REST ให้
 */
async function fetchExecutor(guild, auditType, targetId = null, maxAgeMs = 10000) {
    if (!guild) return null;

    // entry อาจมาถึงก่อนหรือหลัง gateway event เล็กน้อย → วนเช็คสั้นๆ
    for (let i = 0; i < 6; i++) {
        const hit = findInAuditBuffer(guild.id, auditType, targetId, maxAgeMs);
        if (hit) return hit;
        await sleep(150);
    }

    if (auditGatewayWorking) return null; // gateway ทำงานอยู่แล้ว ถ้าไม่เจอแปลว่าไม่มี entry จริงๆ

    try {
        const logs = await guild.fetchAuditLogs({ limit: 6, type: auditType });
        const entry = logs.entries.find(e => {
            if (Date.now() - e.createdTimestamp > maxAgeMs) return false;
            if (targetId && e.target && e.target.id !== targetId) return false;
            return true;
        });
        return entry ? { executor: entry.executor, reason: entry.reason, entry } : null;
    } catch (err) {
        // ปกติเกิดจากบอทไม่มีสิทธิ์ View Audit Log — ไม่ต้องหยุดการส่ง log
        return null;
    }
}

// ==========================================
// 🚫 IGNORE FILTER
// ยกเว้นห้อง / คน / ยศ ที่แอดมินไม่อยากให้ log (แนวเดียวกับ Carl-bot)
// ==========================================
function isIgnored(context = {}) {
    const { userId, isBot, channelId, parentId, member } = context;
    const opt = store.getOptions();

    if (isBot && opt.ignoreBots) return true;
    if (userId && opt.ignoredUsers.has(userId)) return true;
    if (channelId && opt.ignoredChannels.has(channelId)) return true;
    if (parentId && opt.ignoredChannels.has(parentId)) return true; // ยกเว้นทั้งหมวดหมู่

    if (opt.ignoredRoles.size && member?.roles?.cache) {
        for (const roleId of opt.ignoredRoles) {
            if (member.roles.cache.has(roleId)) return true;
        }
    }
    return false;
}

// ==========================================
// 📤 DISPATCHER
// รวม embed หลายอันส่งเป็นข้อความเดียว (Discord รับได้ 10 embed/ข้อความ)
// ช่วยไม่ให้ชน rate limit ตอนเซิร์ฟเวอร์คึกคักหรือมีคนก่อกวน
// ==========================================
let clientRef = null;

const FLUSH_DELAY = 1200;
const MAX_EMBEDS_PER_MESSAGE = 10;
const MAX_CHARS_PER_MESSAGE = 5500;
const queues = new Map(); // channelId -> { embeds: [], timer }

function enqueueEmbed(channelId, embed) {
    let queue = queues.get(channelId);
    if (!queue) {
        queue = { embeds: [], timer: null };
        queues.set(channelId, queue);
    }
    queue.embeds.push(embed);

    if (queue.embeds.length >= MAX_EMBEDS_PER_MESSAGE) return flushQueue(channelId);
    if (!queue.timer) queue.timer = setTimeout(() => flushQueue(channelId), FLUSH_DELAY);
}

function embedLength(embed) {
    const data = embed.data || {};
    let len = (data.title || '').length + (data.description || '').length + (data.footer?.text || '').length;
    for (const f of data.fields || []) len += f.name.length + f.value.length;
    return len;
}

async function flushQueue(channelId) {
    const queue = queues.get(channelId);
    if (!queue || queue.embeds.length === 0) return;

    clearTimeout(queue.timer);
    queue.timer = null;

    // หยิบเท่าที่ยัดลงหนึ่งข้อความได้ ที่เหลือรอรอบถัดไป
    const batch = [];
    let chars = 0;
    while (queue.embeds.length && batch.length < MAX_EMBEDS_PER_MESSAGE) {
        const next = queue.embeds[0];
        const nextLen = embedLength(next);
        if (batch.length && chars + nextLen > MAX_CHARS_PER_MESSAGE) break;
        batch.push(queue.embeds.shift());
        chars += nextLen;
    }

    try {
        const channel = await resolveChannel(channelId);
        if (channel) await channel.send({ embeds: batch });
    } catch (err) {
        console.error(`❌ Log Manager (ส่งเข้าห้อง ${channelId}):`, err.message);
    }

    if (queue.embeds.length) {
        queue.timer = setTimeout(() => flushQueue(channelId), FLUSH_DELAY);
    } else {
        queues.delete(channelId);
    }
}

async function resolveChannel(channelId) {
    if (!clientRef) return null;
    const channel = clientRef.channels.cache.get(channelId)
        || await clientRef.channels.fetch(channelId).catch(() => null);
    return channel && channel.isTextBased() ? channel : null;
}

/**
 * ส่ง log หนึ่งรายการเข้าห้องที่ตั้งค่าไว้
 * ข้ามการส่งเงียบๆ ถ้า: ปิดทั้งระบบ / ปิด event นี้ / ยังไม่ได้เลือกห้อง / ติด ignore list
 */
async function sendLog(eventKey, payload) {
    try {
        if (!clientRef || !store.isReady()) return;
        if (!store.isSystemEnabled()) return;
        if (payload.context && isIgnored(payload.context)) return;

        const setting = store.getSetting(eventKey);
        if (!setting || !setting.enabled || !setting.channelId) return;

        const meta = LOG_EVENT_MAP.get(eventKey);
        const embed = new EmbedBuilder()
            .setColor(setting.color || meta?.color || '#5865F2')
            .setTitle(payload.title || meta?.label || 'Log')
            .setTimestamp();

        if (payload.description) embed.setDescription(trim(payload.description, 4000));
        const fields = (payload.fields || []).filter(Boolean);
        if (fields.length) embed.addFields(fields);
        if (payload.thumbnail) embed.setThumbnail(payload.thumbnail);
        embed.setFooter({ text: payload.footer || `Log Manager • ${meta?.label || eventKey}` });

        // ข้อความที่มีไฟล์แนบรวมกับอันอื่นไม่ได้ ส่งแยกทันที
        if (payload.files?.length) {
            const channel = await resolveChannel(setting.channelId);
            if (channel) await channel.send({ embeds: [embed], files: payload.files });
            return;
        }

        enqueueEmbed(setting.channelId, embed);
    } catch (err) {
        console.error(`❌ Log Manager (${eventKey}):`, err.message);
    }
}

// เช็คก่อนว่า event นี้เปิดใช้งานอยู่ไหม เพื่อไม่ต้องเสียเวลาดึง audit log ทิ้งเปล่า
function isActive(eventKey) {
    if (!store.isReady() || !store.isSystemEnabled()) return false;
    const setting = store.getSetting(eventKey);
    return Boolean(setting && setting.enabled && setting.channelId);
}

// ==========================================
// 🎧 EVENT LISTENERS
// ==========================================
function registerListeners(client) {
    // เก็บ audit entry ทุกอันที่ไหลเข้ามา + จัดการ log ที่รู้ได้จาก audit อย่างเดียว
    client.on(Events.GuildAuditLogEntryCreate, (entry, guild) => {
        pushAuditEntry(entry, guild);
        handleAuditOnlyEvents(entry, guild);
    });

    // --- สมาชิกเข้า / ออก / ถูกเตะ ---
    client.on(Events.GuildMemberAdd, async member => {
        if (!isActive('memberJoin')) return;
        const createdAt = Math.floor(member.user.createdTimestamp / 1000);
        sendLog('memberJoin', {
            title: '📥 สมาชิกเข้า',
            context: { userId: member.id, isBot: member.user.bot, member },
            description: `${userLine(member.user)} เข้าร่วมเซิร์ฟเวอร์`,
            thumbnail: member.user.displayAvatarURL({ size: 128 }),
            fields: [
                field('👤 ผู้ใช้', `<@${member.id}>`),
                field('🆔 User ID', member.id),
                field('📅 สร้างบัญชีเมื่อ', `<t:${createdAt}:F>\n(<t:${createdAt}:R>)`, false),
                field('👥 จำนวนสมาชิกตอนนี้', `${member.guild.memberCount} คน`),
            ],
        });
    });

    client.on(Events.GuildMemberRemove, async member => {
        // แยกให้ออกว่า "ออกเอง" หรือ "ถูกเตะ" — ดูจาก audit log MemberKick
        const kickActive = isActive('memberKick');
        const leaveActive = isActive('memberLeave');
        if (!kickActive && !leaveActive) return;

        const context = { userId: member.id, isBot: member.user.bot, member };
        const kickInfo = kickActive ? await fetchExecutor(member.guild, AuditLogEvent.MemberKick, member.id, 8000) : null;

        if (kickInfo) {
            sendLog('memberKick', {
                title: '👢 เตะสมาชิกแล้ว',
                context,
                description: `${userLine(member.user)} ถูกเตะออกจากเซิร์ฟเวอร์`,
                thumbnail: member.user.displayAvatarURL({ size: 128 }),
                fields: [
                    field('👤 สมาชิก', `<@${member.id}>`),
                    field('🛡️ ผู้ดูแลรับผิดชอบ', executorLine(kickInfo)),
                    field('📝 เหตุผล', kickInfo.reason || 'ไม่ได้ระบุ', false),
                ],
            });
            return;
        }

        if (!leaveActive) return;
        const roles = member.roles?.cache
            ? member.roles.cache.filter(r => r.id !== member.guild.id).map(r => `<@&${r.id}>`).join(' ')
            : '';
        sendLog('memberLeave', {
            title: '📤 สมาชิกออก',
            context,
            description: `${userLine(member.user)} ออกจากเซิร์ฟเวอร์`,
            thumbnail: member.user.displayAvatarURL({ size: 128 }),
            fields: [
                field('👤 ผู้ใช้', `<@${member.id}>`),
                field('🆔 User ID', member.id),
                field('🎭 บทบาทที่เคยมี', roles || 'ไม่มี', false),
                field('👥 จำนวนสมาชิกตอนนี้', `${member.guild.memberCount} คน`),
            ],
        });
    });

    // --- แบน / ปลดแบน ---
    client.on(Events.GuildBanAdd, async ban => {
        if (!isActive('memberBan')) return;
        const info = await fetchExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
        sendLog('memberBan', {
            title: '🔨 แบนสมาชิก',
            context: { userId: ban.user.id, isBot: ban.user.bot },
            description: `${userLine(ban.user)} ถูกแบนออกจากเซิร์ฟเวอร์`,
            thumbnail: ban.user.displayAvatarURL({ size: 128 }),
            fields: [
                field('👤 สมาชิก', `<@${ban.user.id}>`),
                field('🛡️ ผู้ดูแลรับผิดชอบ', executorLine(info)),
                field('📝 เหตุผล', info?.reason || ban.reason || 'ไม่ได้ระบุ', false),
            ],
        });
    });

    client.on(Events.GuildBanRemove, async ban => {
        if (!isActive('memberUnban')) return;
        const info = await fetchExecutor(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
        sendLog('memberUnban', {
            title: '🕊️ ปลดแบนสมาชิก',
            context: { userId: ban.user.id, isBot: ban.user.bot },
            description: `${userLine(ban.user)} ถูกปลดแบนแล้ว`,
            thumbnail: ban.user.displayAvatarURL({ size: 128 }),
            fields: [
                field('👤 สมาชิก', `<@${ban.user.id}>`),
                field('🛡️ ผู้ดูแลรับผิดชอบ', executorLine(info)),
            ],
        });
    });

    // --- อัปเดตสมาชิก: ชื่อเล่น / บทบาท / timeout ---
    client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
        const context = { userId: newMember.id, isBot: newMember.user.bot, member: newMember };

        // 1) เปลี่ยนชื่อเล่น
        if (oldMember.nickname !== newMember.nickname && isActive('nicknameUpdate')) {
            const info = await fetchExecutor(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
            sendLog('nicknameUpdate', {
                title: '✏️ เปลี่ยนชื่อเล่นแล้ว',
                context,
                description: `${userLine(newMember.user)} ถูกเปลี่ยนชื่อเล่น`,
                thumbnail: newMember.user.displayAvatarURL({ size: 128 }),
                fields: [
                    field('👤 สมาชิก', `<@${newMember.id}>`),
                    field('🛡️ ผู้ดูแลรับผิดชอบ', executorLine(info)),
                    field('❌ ชื่อเดิม', oldMember.nickname || oldMember.user.username),
                    field('✅ ชื่อใหม่', newMember.nickname || newMember.user.username),
                ],
            });
        }

        // 2) ให้ / ลบ บทบาท
        const oldRoles = oldMember.roles.cache;
        const newRoles = newMember.roles.cache;
        const added = newRoles.filter(r => !oldRoles.has(r.id));
        const removed = oldRoles.filter(r => !newRoles.has(r.id));

        if (added.size > 0 && isActive('roleGiven')) {
            const info = await fetchExecutor(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
            sendLog('roleGiven', {
                title: '🎭 ให้บทบาท',
                context,
                description: `${userLine(newMember.user)} ได้รับบทบาทใหม่`,
                thumbnail: newMember.user.displayAvatarURL({ size: 128 }),
                fields: [
                    field('👤 สมาชิก', `<@${newMember.id}>`),
                    field('🛡️ ผู้ดูแลรับผิดชอบ', executorLine(info)),
                    field('✅ บทบาทที่ได้รับ', added.map(r => `<@&${r.id}>`).join(' '), false),
                ],
            });
        }

        if (removed.size > 0 && isActive('roleRemoved')) {
            const info = await fetchExecutor(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
            sendLog('roleRemoved', {
                title: '🎭 ลบบทบาท',
                context,
                description: `${userLine(newMember.user)} ถูกถอดบทบาท`,
                thumbnail: newMember.user.displayAvatarURL({ size: 128 }),
                fields: [
                    field('👤 สมาชิก', `<@${newMember.id}>`),
                    field('🛡️ ผู้ดูแลรับผิดชอบ', executorLine(info)),
                    field('❌ บทบาทที่ถูกถอด', removed.map(r => `<@&${r.id}>`).join(' '), false),
                ],
            });
        }

        // 3) Timeout (ให้ / ลบ)
        const oldTimeout = oldMember.communicationDisabledUntilTimestamp || 0;
        const newTimeout = newMember.communicationDisabledUntilTimestamp || 0;
        if (oldTimeout !== newTimeout && isActive('memberTimeout')) {
            const info = await fetchExecutor(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
            const isGiven = newTimeout > Date.now();
            sendLog('memberTimeout', {
                title: isGiven ? '⏳ ให้หมดเวลา (Timeout)' : '⌛ ปลดหมดเวลา (Timeout)',
                context,
                description: `${userLine(newMember.user)} ${isGiven ? 'ถูกสั่งหมดเวลาพูดคุย' : 'ถูกปลดสถานะหมดเวลา'}`,
                thumbnail: newMember.user.displayAvatarURL({ size: 128 }),
                fields: [
                    field('👤 สมาชิก', `<@${newMember.id}>`),
                    field('🛡️ ผู้ดูแลรับผิดชอบ', executorLine(info)),
                    isGiven ? field('⏰ หมดเวลาเมื่อ', `<t:${Math.floor(newTimeout / 1000)}:F>\n(<t:${Math.floor(newTimeout / 1000)}:R>)`, false) : null,
                    field('📝 เหตุผล', info?.reason || 'ไม่ได้ระบุ', false),
                ],
            });
        }
    });

    // --- เปลี่ยนชื่อผู้ใช้ / รูปโปรไฟล์ (ระดับบัญชี ไม่ใช่ชื่อเล่นในเซิร์ฟเวอร์) ---
    client.on(Events.UserUpdate, async (oldUser, newUser) => {
        if (!isActive('userProfileUpdate')) return;

        const changes = [];
        if (oldUser.username !== newUser.username) changes.push(field('🏷️ ชื่อผู้ใช้', `${oldUser.username} → ${newUser.username}`, false));
        if (oldUser.globalName !== newUser.globalName) changes.push(field('📛 ชื่อที่แสดง', `${oldUser.globalName || '(ไม่มี)'} → ${newUser.globalName || '(ไม่มี)'}`, false));
        if (oldUser.avatar !== newUser.avatar) changes.push(field('🖼️ รูปโปรไฟล์', 'มีการเปลี่ยนรูปโปรไฟล์', false));
        if (changes.length === 0) return;

        sendLog('userProfileUpdate', {
            title: '👤 เปลี่ยนชื่อผู้ใช้ / รูปโปรไฟล์',
            context: { userId: newUser.id, isBot: newUser.bot },
            description: `${userLine(newUser)} แก้ไขโปรไฟล์`,
            thumbnail: newUser.displayAvatarURL({ size: 128 }),
            fields: changes,
        });
    });

    // --- ข้อความ ---
    client.on(Events.MessageDelete, async message => {
        if (!isActive('messageDelete')) return;
        if (!message.guild) return;

        const info = await fetchExecutor(message.guild, AuditLogEvent.MessageDelete, message.author?.id, 6000);
        sendLog('messageDelete', {
            title: '🗑️ ข้อความที่ลบไปแล้ว',
            context: {
                userId: message.author?.id,
                isBot: message.author?.bot,
                channelId: message.channelId,
                parentId: message.channel?.parentId,
                member: message.member,
            },
            description: `ข้อความใน <#${message.channelId}> ถูกลบ`,
            fields: [
                field('👤 ผู้เขียน', message.author ? `<@${message.author.id}>` : 'ไม่ทราบ'),
                field('📺 ช่อง', `<#${message.channelId}>`),
                field('🛡️ ผู้ลบ', info ? executorLine(info) : 'ผู้เขียนเอง / ไม่ทราบ'),
                field('💬 เนื้อหา', message.content || '*(ไม่มีข้อความ — อาจเป็นรูปหรือ embed)*', false),
                message.attachments?.size ? field('📎 ไฟล์แนบ', message.attachments.map(a => a.name).join(', '), false) : null,
            ],
        });
    });

    client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
        if (!isActive('messageUpdate')) return;
        if (!newMessage.guild) return;
        // ข้ามกรณี embed โหลดทีหลัง (เนื้อหาไม่ได้เปลี่ยนจริง)
        if (oldMessage.content === newMessage.content) return;

        sendLog('messageUpdate', {
            title: '📝 ข้อความที่แก้ไขแล้ว',
            context: {
                userId: newMessage.author?.id,
                isBot: newMessage.author?.bot,
                channelId: newMessage.channelId,
                parentId: newMessage.channel?.parentId,
                member: newMessage.member,
            },
            description: `ข้อความใน <#${newMessage.channelId}> ถูกแก้ไข — [ไปที่ข้อความ](${newMessage.url})`,
            fields: [
                field('👤 ผู้เขียน', newMessage.author ? `<@${newMessage.author.id}>` : 'ไม่ทราบ'),
                field('📺 ช่อง', `<#${newMessage.channelId}>`),
                field('❌ ข้อความเดิม', oldMessage.content || '*(ไม่ทราบ — ข้อความเก่าเกินแคช)*', false),
                field('✅ ข้อความใหม่', newMessage.content || '*(ว่าง)*', false),
            ],
        });
    });

    // --- ลบข้อความจำนวนมาก (Purge) พร้อมแนบไฟล์เก็บข้อความที่หายไป ---
    client.on(Events.MessageBulkDelete, async (messages, channel) => {
        if (!isActive('messageBulkDelete')) return;
        if (!channel?.guild) return;

        const cached = [...messages.values()].filter(m => m.content || m.attachments?.size);
        let files;
        if (cached.length) {
            const lines = cached
                .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
                .map(m => {
                    const time = new Date(m.createdTimestamp).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
                    const files = m.attachments?.size ? ` [ไฟล์แนบ: ${m.attachments.map(a => a.name).join(', ')}]` : '';
                    return `[${time}] ${m.author?.tag || 'ไม่ทราบ'}: ${m.content || ''}${files}`;
                });
            files = [new AttachmentBuilder(Buffer.from(lines.join('\n'), 'utf8'), { name: `purged-${Date.now()}.txt` })];
        }

        const info = await fetchExecutor(channel.guild, AuditLogEvent.MessageBulkDelete, channel.id, 8000);
        sendLog('messageBulkDelete', {
            title: '🧹 ลบข้อความจำนวนมาก (Purge)',
            context: { channelId: channel.id, parentId: channel.parentId },
            description: `มีการลบข้อความหลายรายการใน <#${channel.id}>`,
            files,
            fields: [
                field('📺 ช่อง', `<#${channel.id}>`),
                field('🔢 จำนวนที่ถูกลบ', `${messages.size} ข้อความ`),
                field('🛡️ ผู้ดูแลรับผิดชอบ', executorLine(info)),
                field('💾 ข้อความที่กู้จากแคชได้', `${cached.length} ข้อความ`),
            ],
        });
    });

    // --- ช่อง ---
    client.on(Events.ChannelCreate, async channel => {
        if (!isActive('channelCreate')) return;
        const info = await fetchExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
        sendLog('channelCreate', {
            title: '🏠 สร้างช่องแล้ว',
            description: `สร้างช่องใหม่: <#${channel.id}>`,
            fields: [
                field('📺 ช่อง', `<#${channel.id}>`),
                field('🏷️ ชื่อ', channel.name),
                field('🛡️ ผู้ดูแลรับผิดชอบ', executorLine(info)),
                field('📂 หมวดหมู่', channel.parent?.name || 'ไม่มี'),
            ],
        });
    });

    client.on(Events.ChannelDelete, async channel => {
        if (!isActive('channelDelete')) return;
        const info = await fetchExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
        sendLog('channelDelete', {
            title: '🗑️ ลบช่องแล้ว',
            description: `ช่อง **${channel.name}** ถูกลบ`,
            fields: [
                field('🏷️ ชื่อช่อง', channel.name),
                field('🆔 Channel ID', channel.id),
                field('🛡️ ผู้ดูแลรับผิดชอบ', executorLine(info)),
                field('📂 หมวดหมู่', channel.parent?.name || 'ไม่มี'),
            ],
        });
    });

    client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
        // 1) สิทธิของช่องเปลี่ยน
        if (isActive('channelPermissionUpdate')) {
            const oldPerms = oldChannel.permissionOverwrites?.cache;
            const newPerms = newChannel.permissionOverwrites?.cache;
            if (oldPerms && newPerms && permissionsChanged(oldPerms, newPerms)) {
                const info = await fetchExecutor(newChannel.guild, AuditLogEvent.ChannelOverwriteUpdate, newChannel.id)
                    || findInAuditBuffer(newChannel.guild.id, AuditLogEvent.ChannelOverwriteCreate, newChannel.id, 10000)
                    || findInAuditBuffer(newChannel.guild.id, AuditLogEvent.ChannelOverwriteDelete, newChannel.id, 10000);
                sendLog('channelPermissionUpdate', {
                    title: '🔐 สิทธิของช่องอัพเดทแล้ว',
                    description: `สิทธิ์ในช่อง <#${newChannel.id}> ถูกแก้ไข`,
                    fields: [
                        field('📺 ช่อง', `<#${newChannel.id}>`),
                        field('🛡️ ผู้ดูแลรับผิดชอบ', executorLine(info)),
                        field('👥 จำนวนกฎสิทธิ์', `${oldPerms.size} → ${newPerms.size}`),
                    ],
                });
            }
        }

        // 2) รายละเอียดช่องเปลี่ยน (ชื่อ / หัวข้อ / bitrate / ฯลฯ)
        if (!isActive('channelUpdate')) return;
        const changes = [];
        if (oldChannel.name !== newChannel.name) changes.push(field('🏷️ ชื่อ', `${oldChannel.name} → ${newChannel.name}`, false));
        if (oldChannel.topic !== newChannel.topic) changes.push(field('📌 หัวข้อ', `${oldChannel.topic || '(ว่าง)'} → ${newChannel.topic || '(ว่าง)'}`, false));
        if (oldChannel.nsfw !== newChannel.nsfw) changes.push(field('🔞 NSFW', `${oldChannel.nsfw} → ${newChannel.nsfw}`));
        if (oldChannel.bitrate !== newChannel.bitrate) changes.push(field('🎚️ Bitrate', `${oldChannel.bitrate / 1000} → ${newChannel.bitrate / 1000} kbps`));
        if (oldChannel.userLimit !== newChannel.userLimit) changes.push(field('👥 จำกัดคน', `${oldChannel.userLimit || 'ไม่จำกัด'} → ${newChannel.userLimit || 'ไม่จำกัด'}`));
        if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) changes.push(field('🐌 Slowmode', `${oldChannel.rateLimitPerUser || 0} → ${newChannel.rateLimitPerUser || 0} วิ`));
        if (oldChannel.rtcRegion !== newChannel.rtcRegion) changes.push(field('🌍 Region', `${oldChannel.rtcRegion || 'อัตโนมัติ'} → ${newChannel.rtcRegion || 'อัตโนมัติ'}`));
        if (oldChannel.parentId !== newChannel.parentId) changes.push(field('📂 หมวดหมู่', `${oldChannel.parent?.name || 'ไม่มี'} → ${newChannel.parent?.name || 'ไม่มี'}`));
        if (changes.length === 0) return;

        const info = await fetchExecutor(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
        sendLog('channelUpdate', {
            title: '🏠 อัปเดตช่องแล้ว',
            description: `ช่อง <#${newChannel.id}> ถูกแก้ไข`,
            fields: [
                field('🛡️ ผู้ดูแลรับผิดชอบ', executorLine(info), false),
                ...changes,
            ],
        });
    });

    // --- เธรด ---
    client.on(Events.ThreadCreate, async thread => {
        if (!isActive('threadCreate')) return;
        const info = await fetchExecutor(thread.guild, AuditLogEvent.ThreadCreate, thread.id);
        sendLog('threadCreate', {
            title: '🧵 สร้างเธรด',
            context: { channelId: thread.parentId },
            description: `สร้างเธรดใหม่: <#${thread.id}>`,
            fields: [
                field('🧵 เธรด', `<#${thread.id}>`),
                field('📺 อยู่ในช่อง', thread.parentId ? `<#${thread.parentId}>` : 'ไม่ทราบ'),
                field('🛡️ ผู้สร้าง', info ? executorLine(info) : (thread.ownerId ? `<@${thread.ownerId}>` : 'ไม่ทราบ')),
            ],
        });
    });

    client.on(Events.ThreadDelete, async thread => {
        if (!isActive('threadDelete')) return;
        const info = await fetchExecutor(thread.guild, AuditLogEvent.ThreadDelete, thread.id);
        sendLog('threadDelete', {
            title: '🗑️ ลบเธรด',
            context: { channelId: thread.parentId },
            description: `เธรด **${thread.name}** ถูกลบ`,
            fields: [
                field('🏷️ ชื่อเธรด', thread.name),
                field('📺 อยู่ในช่อง', thread.parentId ? `<#${thread.parentId}>` : 'ไม่ทราบ'),
                field('🛡️ ผู้ดูแลรับผิดชอบ', executorLine(info)),
            ],
        });
    });

    client.on(Events.ThreadUpdate, async (oldThread, newThread) => {
        if (!isActive('threadUpdate')) return;
        const changes = [];
        if (oldThread.name !== newThread.name) changes.push(field('🏷️ ชื่อ', `${oldThread.name} → ${newThread.name}`, false));
        if (oldThread.archived !== newThread.archived) changes.push(field('📦 เก็บถาวร', `${oldThread.archived} → ${newThread.archived}`));
        if (oldThread.locked !== newThread.locked) changes.push(field('🔒 ล็อก', `${oldThread.locked} → ${newThread.locked}`));
        if (oldThread.rateLimitPerUser !== newThread.rateLimitPerUser) changes.push(field('🐌 Slowmode', `${oldThread.rateLimitPerUser || 0} → ${newThread.rateLimitPerUser || 0} วิ`));
        if (changes.length === 0) return;

        const info = await fetchExecutor(newThread.guild, AuditLogEvent.ThreadUpdate, newThread.id);
        sendLog('threadUpdate', {
            title: '🧵 อัปเดตเธรดแล้ว',
            context: { channelId: newThread.parentId },
            description: `เธรด <#${newThread.id}> ถูกแก้ไข`,
            fields: [
                field('🛡️ ผู้ดูแลรับผิดชอบ', executorLine(info), false),
                ...changes,
            ],
        });
    });

    // --- บทบาท ---
    client.on(Events.GuildRoleCreate, async role => {
        if (!isActive('roleCreate')) return;
        const info = await fetchExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
        sendLog('roleCreate', {
            title: '🎭 สร้างบทบาทแล้ว',
            description: `สร้างบทบาทใหม่: <@&${role.id}>`,
            fields: [
                field('🎭 บทบาท', `<@&${role.id}>`),
                field('🏷️ ชื่อ', role.name),
                field('🛡️ ผู้ดูแลรับผิดชอบ', executorLine(info)),
                field('🎨 สี', role.hexColor),
            ],
        });
    });

    client.on(Events.GuildRoleDelete, async role => {
        if (!isActive('roleDelete')) return;
        const info = await fetchExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
        sendLog('roleDelete', {
            title: '🗑️ ลบบทบาทแล้ว',
            description: `บทบาท **${role.name}** ถูกลบ`,
            fields: [
                field('🏷️ ชื่อบทบาท', role.name),
                field('🆔 Role ID', role.id),
                field('🛡️ ผู้ดูแลรับผิดชอบ', executorLine(info)),
            ],
        });
    });

    client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
        if (!isActive('roleUpdate')) return;
        const changes = [];
        if (oldRole.name !== newRole.name) changes.push(field('🏷️ ชื่อ', `${oldRole.name} → ${newRole.name}`, false));
        if (oldRole.hexColor !== newRole.hexColor) changes.push(field('🎨 สี', `${oldRole.hexColor} → ${newRole.hexColor}`));
        if (oldRole.hoist !== newRole.hoist) changes.push(field('📌 แสดงแยกกลุ่ม', `${oldRole.hoist} → ${newRole.hoist}`));
        if (oldRole.mentionable !== newRole.mentionable) changes.push(field('📣 แท็กได้', `${oldRole.mentionable} → ${newRole.mentionable}`));
        if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
            const addedPerms = newRole.permissions.toArray().filter(p => !oldRole.permissions.has(p));
            const removedPerms = oldRole.permissions.toArray().filter(p => !newRole.permissions.has(p));
            if (addedPerms.length) changes.push(field('✅ สิทธิ์ที่เพิ่ม', addedPerms.join(', '), false));
            if (removedPerms.length) changes.push(field('❌ สิทธิ์ที่ถอด', removedPerms.join(', '), false));
        }
        if (changes.length === 0) return;

        const info = await fetchExecutor(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
        sendLog('roleUpdate', {
            title: '🎭 อัพเดทบทบาทแล้ว',
            description: `บทบาท <@&${newRole.id}> ถูกแก้ไข`,
            fields: [
                field('🛡️ ผู้ดูแลรับผิดชอบ', executorLine(info), false),
                ...changes,
            ],
        });
    });

    // --- เซิร์ฟเวอร์ ---
    client.on(Events.GuildUpdate, async (oldGuild, newGuild) => {
        if (!isActive('guildUpdate')) return;
        const changes = [];
        if (oldGuild.name !== newGuild.name) changes.push(field('🏷️ ชื่อเซิร์ฟเวอร์', `${oldGuild.name} → ${newGuild.name}`, false));
        if (oldGuild.iconURL() !== newGuild.iconURL()) changes.push(field('🖼️ ไอคอน', 'มีการเปลี่ยนไอคอนเซิร์ฟเวอร์', false));
        if (oldGuild.ownerId !== newGuild.ownerId) changes.push(field('👑 เจ้าของ', `<@${oldGuild.ownerId}> → <@${newGuild.ownerId}>`, false));
        if (oldGuild.verificationLevel !== newGuild.verificationLevel) changes.push(field('🛡️ ระดับการยืนยัน', `${oldGuild.verificationLevel} → ${newGuild.verificationLevel}`));
        if (oldGuild.afkChannelId !== newGuild.afkChannelId) changes.push(field('💤 ห้อง AFK', `${oldGuild.afkChannel?.name || 'ไม่มี'} → ${newGuild.afkChannel?.name || 'ไม่มี'}`));
        if (changes.length === 0) return;

        const info = await fetchExecutor(newGuild, AuditLogEvent.GuildUpdate);
        sendLog('guildUpdate', {
            title: '🏰 อัปเดตเซิร์ฟเวอร์',
            description: `ตั้งค่าเซิร์ฟเวอร์ **${newGuild.name}** ถูกแก้ไข`,
            fields: [
                field('🛡️ ผู้ดูแลรับผิดชอบ', executorLine(info), false),
                ...changes,
            ],
        });
    });

    // --- คำเชิญ ---
    client.on(Events.InviteCreate, async invite => {
        if (!isActive('inviteCreate')) return;
        sendLog('inviteCreate', {
            title: '📨 สร้างคำเชิญของเซิร์ฟเวอร์',
            context: { userId: invite.inviter?.id, isBot: invite.inviter?.bot, channelId: invite.channelId },
            description: `มีการสร้างลิงก์เชิญใหม่`,
            fields: [
                field('🔗 โค้ด', invite.code),
                field('📺 ช่องปลายทาง', invite.channelId ? `<#${invite.channelId}>` : 'ไม่ทราบ'),
                field('👤 ผู้สร้าง', invite.inviter ? `<@${invite.inviter.id}>` : 'ไม่ทราบ'),
                field('⏳ หมดอายุ', invite.maxAge ? `<t:${Math.floor((Date.now() + invite.maxAge * 1000) / 1000)}:R>` : 'ไม่มีวันหมดอายุ'),
                field('🔢 ใช้ได้สูงสุด', invite.maxUses ? `${invite.maxUses} ครั้ง` : 'ไม่จำกัด'),
            ],
        });
    });

    client.on(Events.InviteDelete, async invite => {
        if (!isActive('inviteCreate')) return;
        sendLog('inviteCreate', {
            title: '🗑️ ลบคำเชิญของเซิร์ฟเวอร์',
            description: `ลิงก์เชิญถูกลบหรือหมดอายุ`,
            fields: [
                field('🔗 โค้ด', invite.code),
                field('📺 ช่องปลายทาง', invite.channelId ? `<#${invite.channelId}>` : 'ไม่ทราบ'),
            ],
        });
    });

    // --- อีโมจิ / สติกเกอร์ (รวมเป็นการ์ดเดียว เพราะเป็นของประดับเซิร์ฟเวอร์เหมือนกัน) ---
    const expressionLog = (eventKey, titleIcon, typeLabel) => (action, auditType) => async (item, updated) => {
        if (!isActive(eventKey)) return;
        const target = updated || item;
        const info = await fetchExecutor(target.guild, auditType, target.id);
        const changes = updated && item.name !== updated.name
            ? [field('🏷️ ชื่อ', `${item.name} → ${updated.name}`, false)]
            : [];
        sendLog(eventKey, {
            title: `${titleIcon} ${action} ${typeLabel}`,
            description: `${typeLabel} **${target.name}**`,
            thumbnail: typeof target.imageURL === 'function' ? target.imageURL() : (target.url || null),
            fields: [
                field('🏷️ ชื่อ', target.name),
                field('🆔 ID', target.id),
                field('🛡️ ผู้ดูแลรับผิดชอบ', executorLine(info)),
                ...changes,
            ],
        });
    };

    const emojiLog = expressionLog('emojiUpdate', '😀', 'อีโมจิ');
    client.on(Events.GuildEmojiCreate, emojiLog('เพิ่ม', AuditLogEvent.EmojiCreate));
    client.on(Events.GuildEmojiDelete, emojiLog('ลบ', AuditLogEvent.EmojiDelete));
    client.on(Events.GuildEmojiUpdate, emojiLog('แก้ไข', AuditLogEvent.EmojiUpdate));

    const stickerLog = expressionLog('stickerUpdate', '🏷️', 'สติกเกอร์');
    client.on(Events.GuildStickerCreate, stickerLog('เพิ่ม', AuditLogEvent.StickerCreate));
    client.on(Events.GuildStickerDelete, stickerLog('ลบ', AuditLogEvent.StickerDelete));
    client.on(Events.GuildStickerUpdate, stickerLog('แก้ไข', AuditLogEvent.StickerUpdate));

    // --- กิจกรรมของเซิร์ฟเวอร์ (Scheduled Events) ---
    const scheduledEventLog = (action, icon) => async (item, updated) => {
        if (!isActive('scheduledEvent')) return;
        const target = updated || item;
        const startAt = target.scheduledStartTimestamp ? Math.floor(target.scheduledStartTimestamp / 1000) : null;
        sendLog('scheduledEvent', {
            title: `${icon} ${action}กิจกรรมของเซิร์ฟเวอร์`,
            context: { userId: target.creatorId, channelId: target.channelId },
            description: `กิจกรรม **${target.name}**`,
            fields: [
                field('🏷️ ชื่อกิจกรรม', target.name),
                field('👤 ผู้สร้าง', target.creatorId ? `<@${target.creatorId}>` : 'ไม่ทราบ'),
                field('📍 สถานที่', target.channelId ? `<#${target.channelId}>` : (target.entityMetadata?.location || 'ไม่ระบุ')),
                startAt ? field('🕒 เริ่ม', `<t:${startAt}:F>\n(<t:${startAt}:R>)`, false) : null,
            ],
        });
    };
    client.on(Events.GuildScheduledEventCreate, scheduledEventLog('สร้าง', '📅'));
    client.on(Events.GuildScheduledEventUpdate, scheduledEventLog('แก้ไข', '📅'));
    client.on(Events.GuildScheduledEventDelete, scheduledEventLog('ลบ', '🗑️'));

    // --- เวทีเสียง (Stage) ---
    const stageLog = (action, icon) => async (item, updated) => {
        if (!isActive('stageInstance')) return;
        const target = updated || item;
        sendLog('stageInstance', {
            title: `${icon} ${action}เวทีเสียง (Stage)`,
            context: { channelId: target.channelId },
            description: `หัวข้อ: **${target.topic}**`,
            fields: [
                field('🔊 ห้อง', target.channelId ? `<#${target.channelId}>` : 'ไม่ทราบ'),
                field('📌 หัวข้อ', target.topic),
            ],
        });
    };
    client.on(Events.StageInstanceCreate, stageLog('เริ่ม', '🎤'));
    client.on(Events.StageInstanceUpdate, stageLog('แก้ไข', '🎤'));
    client.on(Events.StageInstanceDelete, stageLog('จบ', '🔚'));

    // --- AutoMod ของ Discord ---
    client.on(Events.AutoModerationActionExecution, async execution => {
        if (!isActive('autoModAction')) return;
        sendLog('autoModAction', {
            title: '🤖 AutoMod ของ Discord ทำงาน',
            context: { userId: execution.userId, channelId: execution.channelId },
            description: `AutoMod จัดการข้อความของ <@${execution.userId}>`,
            fields: [
                field('👤 สมาชิก', `<@${execution.userId}>`),
                field('📺 ช่อง', execution.channelId ? `<#${execution.channelId}>` : 'ไม่ทราบ'),
                field('⚙️ ประเภทกฎ', String(execution.ruleTriggerType)),
                field('🔍 คำที่ตรงกับกฎ', execution.matchedKeyword || execution.matchedContent || 'ไม่ระบุ'),
                field('💬 เนื้อหา', execution.content || '*(ไม่มีข้อความ)*', false),
            ],
        });
    });

    const autoModRuleLog = (action, icon) => async (item, updated) => {
        if (!isActive('autoModRule')) return;
        const target = updated || item;
        sendLog('autoModRule', {
            title: `${icon} ${action}กฎ AutoMod`,
            description: `กฎ **${target.name}**`,
            fields: [
                field('🏷️ ชื่อกฎ', target.name),
                field('👤 ผู้สร้างกฎ', target.creatorId ? `<@${target.creatorId}>` : 'ไม่ทราบ'),
                field('⚙️ สถานะ', target.enabled ? 'เปิดใช้งาน' : 'ปิดอยู่'),
            ],
        });
    };
    client.on(Events.AutoModerationRuleCreate, autoModRuleLog('สร้าง', '🛡️'));
    client.on(Events.AutoModerationRuleUpdate, autoModRuleLog('แก้ไข', '🛡️'));
    client.on(Events.AutoModerationRuleDelete, autoModRuleLog('ลบ', '🗑️'));

    // --- ห้องเสียง ---
    client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
        const member = newState.member || oldState.member;
        if (!member) return;
        const guild = newState.guild || oldState.guild;
        const context = { userId: member.id, isBot: member.user.bot, member };

        // เข้าห้องเสียง
        if (!oldState.channelId && newState.channelId) {
            if (!isActive('voiceJoin')) return;
            sendLog('voiceJoin', {
                title: '🔊 สมาชิกเข้าร่วมช่องเสียง',
                context: { ...context, channelId: newState.channelId },
                description: `${userLine(member.user)} เข้าห้องเสียง <#${newState.channelId}>`,
                fields: [
                    field('👤 สมาชิก', `<@${member.id}>`),
                    field('🔊 ห้อง', `<#${newState.channelId}>`),
                ],
            });
            return;
        }

        // ออกจากห้องเสียง (อาจถูกแอดมินตัดสาย)
        if (oldState.channelId && !newState.channelId) {
            const disconnectActive = isActive('voiceDisconnected');
            const leaveActive = isActive('voiceLeave');
            if (!disconnectActive && !leaveActive) return;

            // audit log MemberDisconnect ไม่มี target user (Discord รวมเป็นยอดรวม)
            // จึงเช็คแค่ว่ามี entry เกิดขึ้นในช่วงเวลาไล่เลี่ยกันไหม
            const kickInfo = disconnectActive ? await fetchExecutor(guild, AuditLogEvent.MemberDisconnect, null, 5000) : null;

            if (kickInfo) {
                sendLog('voiceDisconnected', {
                    title: '⛔ สมาชิกถูกตัดออกจากช่องเสียง',
                    context: { ...context, channelId: oldState.channelId },
                    description: `${userLine(member.user)} ถูกตัดออกจาก <#${oldState.channelId}>`,
                    fields: [
                        field('👤 สมาชิก', `<@${member.id}>`),
                        field('🔊 ห้อง', `<#${oldState.channelId}>`),
                        field('🛡️ ผู้ดูแลรับผิดชอบ', executorLine(kickInfo)),
                    ],
                });
                return;
            }

            if (!leaveActive) return;
            sendLog('voiceLeave', {
                title: '🔇 สมาชิกออกจากช่องเสียง',
                context: { ...context, channelId: oldState.channelId },
                description: `${userLine(member.user)} ออกจากห้องเสียง <#${oldState.channelId}>`,
                fields: [
                    field('👤 สมาชิก', `<@${member.id}>`),
                    field('🔊 ห้อง', `<#${oldState.channelId}>`),
                ],
            });
            return;
        }

        // สลับห้อง (อาจถูกแอดมินลากย้าย)
        if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
            const movedActive = isActive('voiceMoved');
            const switchActive = isActive('voiceSwitch');
            if (!movedActive && !switchActive) return;

            const moveInfo = movedActive ? await fetchExecutor(guild, AuditLogEvent.MemberMove, null, 5000) : null;

            if (moveInfo) {
                sendLog('voiceMoved', {
                    title: '↔️ สมาชิกถูกย้ายไปช่องเสียงอื่น',
                    context: { ...context, channelId: newState.channelId },
                    description: `${userLine(member.user)} ถูกย้ายห้องเสียง`,
                    fields: [
                        field('👤 สมาชิก', `<@${member.id}>`),
                        field('🛡️ ผู้ดูแลรับผิดชอบ', executorLine(moveInfo)),
                        field('❌ จาก', `<#${oldState.channelId}>`),
                        field('✅ ไป', `<#${newState.channelId}>`),
                    ],
                });
                return;
            }

            if (!switchActive) return;
            sendLog('voiceSwitch', {
                title: '🔀 สมาชิกสลับห้องเสียง',
                context: { ...context, channelId: newState.channelId },
                description: `${userLine(member.user)} ย้ายห้องเสียง`,
                fields: [
                    field('👤 สมาชิก', `<@${member.id}>`),
                    field('❌ จาก', `<#${oldState.channelId}>`),
                    field('✅ ไป', `<#${newState.channelId}>`),
                ],
            });
            return;
        }

        // สถานะเสียงเปลี่ยน (ปิดไมค์ / ปิดหูฟัง / สตรีม / เปิดกล้อง)
        if (!isActive('voiceStateChange')) return;
        const changes = [];
        if (oldState.selfMute !== newState.selfMute) changes.push(field('🎙️ ปิดไมค์เอง', newState.selfMute ? 'เปิดใช้งาน' : 'ยกเลิก'));
        if (oldState.selfDeaf !== newState.selfDeaf) changes.push(field('🎧 ปิดหูฟังเอง', newState.selfDeaf ? 'เปิดใช้งาน' : 'ยกเลิก'));
        if (oldState.serverMute !== newState.serverMute) changes.push(field('🔇 ถูกปิดไมค์โดยแอดมิน', newState.serverMute ? 'ใช่' : 'ไม่ใช่'));
        if (oldState.serverDeaf !== newState.serverDeaf) changes.push(field('🔕 ถูกปิดหูฟังโดยแอดมิน', newState.serverDeaf ? 'ใช่' : 'ไม่ใช่'));
        if (oldState.streaming !== newState.streaming) changes.push(field('📺 สตรีมหน้าจอ', newState.streaming ? 'เริ่ม' : 'หยุด'));
        if (oldState.selfVideo !== newState.selfVideo) changes.push(field('📹 เปิดกล้อง', newState.selfVideo ? 'เริ่ม' : 'หยุด'));
        if (changes.length === 0) return;

        sendLog('voiceStateChange', {
            title: '🎚️ สถานะเสียงเปลี่ยนแปลง',
            context: { ...context, channelId: newState.channelId || oldState.channelId },
            description: `${userLine(member.user)} ใน <#${newState.channelId || oldState.channelId}>`,
            fields: [
                field('👤 สมาชิก', `<@${member.id}>`, false),
                ...changes,
            ],
        });
    });
}

// ==========================================
// 🗂️ LOG ที่รู้ได้จาก Audit Log อย่างเดียว
// (Discord ไม่มี gateway event บอกรายละเอียดพวกนี้ตรงๆ)
// ==========================================
function handleAuditOnlyEvents(entry, guild) {
    const executor = entry.executorId ? `<@${entry.executorId}>` : 'ไม่ทราบ';

    switch (entry.action) {
        case AuditLogEvent.BotAdd:
            sendLog('botAdd', {
                title: '🤖 เพิ่มบอทเข้าเซิร์ฟเวอร์',
                description: `มีการเพิ่มบอทใหม่เข้ามาในเซิร์ฟเวอร์`,
                fields: [
                    field('🤖 บอท', entry.targetId ? `<@${entry.targetId}>` : 'ไม่ทราบ'),
                    field('🛡️ ผู้เพิ่ม', executor),
                    field('📝 เหตุผล', entry.reason || 'ไม่ได้ระบุ', false),
                ],
            });
            break;

        case AuditLogEvent.MemberPrune:
            sendLog('memberPrune', {
                title: '🧹 ล้างสมาชิกที่ไม่เคลื่อนไหว (Prune)',
                description: `มีการล้างสมาชิกที่ไม่เคลื่อนไหวออกจากเซิร์ฟเวอร์`,
                fields: [
                    field('🛡️ ผู้ดูแลรับผิดชอบ', executor),
                    field('🔢 จำนวนที่ถูกล้าง', `${entry.extra?.removed ?? 'ไม่ทราบ'} คน`),
                    field('📅 ไม่เคลื่อนไหวเกิน', `${entry.extra?.days ?? 'ไม่ทราบ'} วัน`),
                ],
            });
            break;

        case AuditLogEvent.MessagePin:
        case AuditLogEvent.MessageUnpin: {
            const isPin = entry.action === AuditLogEvent.MessagePin;
            const channelId = entry.extra?.channel?.id || entry.extra?.channelId;
            sendLog('messagePin', {
                title: isPin ? '📌 ปักหมุดข้อความ' : '📍 เลิกปักหมุดข้อความ',
                context: { userId: entry.executorId, channelId },
                description: channelId ? `ข้อความใน <#${channelId}>` : 'มีการเปลี่ยนแปลงข้อความที่ปักหมุด',
                fields: [
                    field('🛡️ ผู้ดำเนินการ', executor),
                    field('📺 ช่อง', channelId ? `<#${channelId}>` : 'ไม่ทราบ'),
                    field('👤 เจ้าของข้อความ', entry.targetId ? `<@${entry.targetId}>` : 'ไม่ทราบ'),
                    entry.extra?.messageId && channelId && guild
                        ? field('🔗 ลิงก์', `[ไปที่ข้อความ](https://discord.com/channels/${guild.id}/${channelId}/${entry.extra.messageId})`, false)
                        : null,
                ],
            });
            break;
        }

        case AuditLogEvent.WebhookCreate:
        case AuditLogEvent.WebhookUpdate:
        case AuditLogEvent.WebhookDelete: {
            const actionLabel = entry.action === AuditLogEvent.WebhookCreate ? 'สร้าง'
                : entry.action === AuditLogEvent.WebhookDelete ? 'ลบ' : 'แก้ไข';
            sendLog('webhookUpdate', {
                title: `🪝 ${actionLabel} Webhook`,
                description: `มีการ${actionLabel} webhook ในเซิร์ฟเวอร์ — ควรตรวจสอบว่าเป็นการกระทำที่ตั้งใจ`,
                fields: [
                    field('🛡️ ผู้ดำเนินการ', executor),
                    field('🆔 Webhook ID', entry.targetId || 'ไม่ทราบ'),
                    field('📝 เหตุผล', entry.reason || 'ไม่ได้ระบุ', false),
                ],
            });
            break;
        }
    }
}

// เทียบว่ากฎสิทธิ์ในช่องเปลี่ยนไปจริงไหม (จำนวน / allow / deny ของแต่ละ overwrite)
function permissionsChanged(oldPerms, newPerms) {
    if (oldPerms.size !== newPerms.size) return true;
    for (const [id, oldOverwrite] of oldPerms) {
        const newOverwrite = newPerms.get(id);
        if (!newOverwrite) return true;
        if (oldOverwrite.allow.bitfield !== newOverwrite.allow.bitfield) return true;
        if (oldOverwrite.deny.bitfield !== newOverwrite.deny.bitfield) return true;
    }
    return false;
}

/**
 * บันทึก log ตอนระบบคัดกรอง (anti-spam / bad words) ทำงาน
 * เรียกจาก index.js ตอนที่บอทลบข้อความเอง
 */
function logFilterAction({ user, channelId, reason, content }) {
    if (!isActive('filterUsed')) return;
    sendLog('filterUsed', {
        title: '🚨 ใช้คำสั่งการคัดกรอง',
        context: { userId: user?.id, channelId },
        description: `ระบบคัดกรองอัตโนมัติทำงานกับข้อความของ ${userLine(user)}`,
        fields: [
            field('👤 สมาชิก', `<@${user.id}>`),
            field('📺 ช่อง', `<#${channelId}>`),
            field('⚙️ ระบบที่ทำงาน', reason, false),
            field('💬 ข้อความที่ถูกจัดการ', content || '*(ไม่มีข้อความ)*', false),
        ],
    });
}

// รูปแบบลิงก์เชิญของ Discord ทุกโดเมนที่ใช้กันจริง
const INVITE_PATTERN = /(?:discord(?:app)?\.com\/invite|discord\.gg|discord\.me|dsc\.gg)\/([a-zA-Z0-9-]+)/gi;

/**
 * ตรวจว่ามีลิงก์เชิญเซิร์ฟเวอร์อื่นในข้อความไหม (ท่าเดียวกับ Carl-bot)
 * เรียกจาก index.js ตอน messageCreate — คืน true ถ้าเจอ
 */
function logInvitePosted(msg) {
    if (!isActive('invitePosted')) return false;
    const matches = [...(msg.content || '').matchAll(INVITE_PATTERN)];
    if (matches.length === 0) return false;

    sendLog('invitePosted', {
        title: '📨 มีคนโพสต์ลิงก์เชิญ',
        context: {
            userId: msg.author?.id,
            isBot: msg.author?.bot,
            channelId: msg.channel?.id,
            parentId: msg.channel?.parentId,
            member: msg.member,
        },
        description: `${userLine(msg.author)} โพสต์ลิงก์เชิญใน <#${msg.channel.id}> — [ไปที่ข้อความ](${msg.url})`,
        fields: [
            field('👤 ผู้โพสต์', `<@${msg.author.id}>`),
            field('📺 ช่อง', `<#${msg.channel.id}>`),
            field('🔗 โค้ดที่พบ', matches.map(m => `\`${m[1]}\``).join(', '), false),
            field('💬 ข้อความ', msg.content, false),
        ],
    });
    return true;
}

// เรียกครั้งเดียวตอนบอทเริ่มทำงาน
async function initLogManager(client) {
    clientRef = client;
    await store.initLogSettings();
    registerListeners(client);
    console.log('📋 Log Manager: เริ่มติดตามเหตุการณ์ในเซิร์ฟเวอร์แล้ว');
}

module.exports = { initLogManager, sendLog, logFilterAction, logInvitePosted };
