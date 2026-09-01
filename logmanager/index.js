// ==========================================
// 📋 LOG MANAGER
// ดักจับเหตุการณ์ต่างๆ ใน Discord แล้วส่ง embed เข้าห้องที่แอดมินตั้งค่าไว้ต่อรายการ
// เปิด/ปิด + เลือกห้อง + เลือกสี ได้จากหน้า Dashboard แท็บ "Log Management"
// ==========================================
const { Events, EmbedBuilder, AuditLogEvent, ChannelType } = require('discord.js');
const store = require('./store');
const { LOG_EVENT_MAP } = require('./events');

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

// ดึงผู้ลงมือทำจาก Audit Log (เพราะ gateway event ไม่ได้บอกว่าใครเป็นคนทำ)
// รอสักครู่ก่อนดึง เพราะ Discord เขียน audit log ช้ากว่า event เล็กน้อย
async function fetchExecutor(guild, auditType, targetId = null, maxAgeMs = 10000) {
    if (!guild) return null;
    try {
        await new Promise(r => setTimeout(r, 900));
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
// 📤 DISPATCHER
// ==========================================
let clientRef = null;

/**
 * ส่ง log หนึ่งรายการเข้าห้องที่ตั้งค่าไว้
 * ข้ามการส่งเงียบๆ ถ้า: ปิดทั้งระบบ / ปิด event นี้ / ยังไม่ได้เลือกห้อง
 */
async function sendLog(eventKey, payload) {
    try {
        if (!clientRef || !store.isReady()) return;
        if (!store.isSystemEnabled()) return;

        const setting = store.getSetting(eventKey);
        if (!setting || !setting.enabled || !setting.channelId) return;

        const channel = clientRef.channels.cache.get(setting.channelId)
            || await clientRef.channels.fetch(setting.channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) return;

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

        await channel.send({ embeds: [embed] });
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
    // --- สมาชิกเข้า / ออก / ถูกเตะ ---
    client.on(Events.GuildMemberAdd, async member => {
        if (!isActive('memberJoin')) return;
        const createdAt = Math.floor(member.user.createdTimestamp / 1000);
        sendLog('memberJoin', {
            title: '📥 สมาชิกเข้า',
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

        const kickInfo = kickActive ? await fetchExecutor(member.guild, AuditLogEvent.MemberKick, member.id, 8000) : null;

        if (kickInfo) {
            sendLog('memberKick', {
                title: '👢 เตะสมาชิกแล้ว',
                description: `${userLine(member.user)} ถูกเตะออกจากเซิร์ฟเวอร์`,
                thumbnail: member.user.displayAvatarURL({ size: 128 }),
                fields: [
                    field('👤 สมาชิก', `<@${member.id}>`),
                    field('🛡️ ผู้ดูแลรับผิดชอบ', kickInfo.executor ? `<@${kickInfo.executor.id}>` : 'ไม่ทราบ'),
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
            description: `${userLine(ban.user)} ถูกแบนออกจากเซิร์ฟเวอร์`,
            thumbnail: ban.user.displayAvatarURL({ size: 128 }),
            fields: [
                field('👤 สมาชิก', `<@${ban.user.id}>`),
                field('🛡️ ผู้ดูแลรับผิดชอบ', info?.executor ? `<@${info.executor.id}>` : 'ไม่ทราบ'),
                field('📝 เหตุผล', info?.reason || ban.reason || 'ไม่ได้ระบุ', false),
            ],
        });
    });

    client.on(Events.GuildBanRemove, async ban => {
        if (!isActive('memberUnban')) return;
        const info = await fetchExecutor(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
        sendLog('memberUnban', {
            title: '🕊️ ปลดแบนสมาชิก',
            description: `${userLine(ban.user)} ถูกปลดแบนแล้ว`,
            thumbnail: ban.user.displayAvatarURL({ size: 128 }),
            fields: [
                field('👤 สมาชิก', `<@${ban.user.id}>`),
                field('🛡️ ผู้ดูแลรับผิดชอบ', info?.executor ? `<@${info.executor.id}>` : 'ไม่ทราบ'),
            ],
        });
    });

    // --- อัปเดตสมาชิก: ชื่อเล่น / บทบาท / timeout ---
    client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
        // 1) เปลี่ยนชื่อเล่น
        if (oldMember.nickname !== newMember.nickname && isActive('nicknameUpdate')) {
            const info = await fetchExecutor(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
            sendLog('nicknameUpdate', {
                title: '✏️ เปลี่ยนชื่อเล่นแล้ว',
                description: `${userLine(newMember.user)} ถูกเปลี่ยนชื่อเล่น`,
                thumbnail: newMember.user.displayAvatarURL({ size: 128 }),
                fields: [
                    field('👤 สมาชิก', `<@${newMember.id}>`),
                    field('🛡️ ผู้ดูแลรับผิดชอบ', info?.executor ? `<@${info.executor.id}>` : 'ไม่ทราบ'),
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
                description: `${userLine(newMember.user)} ได้รับบทบาทใหม่`,
                thumbnail: newMember.user.displayAvatarURL({ size: 128 }),
                fields: [
                    field('👤 สมาชิก', `<@${newMember.id}>`),
                    field('🛡️ ผู้ดูแลรับผิดชอบ', info?.executor ? `<@${info.executor.id}>` : 'ไม่ทราบ'),
                    field('✅ บทบาทที่ได้รับ', added.map(r => `<@&${r.id}>`).join(' '), false),
                ],
            });
        }

        if (removed.size > 0 && isActive('roleRemoved')) {
            const info = await fetchExecutor(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
            sendLog('roleRemoved', {
                title: '🎭 ลบบทบาท',
                description: `${userLine(newMember.user)} ถูกถอดบทบาท`,
                thumbnail: newMember.user.displayAvatarURL({ size: 128 }),
                fields: [
                    field('👤 สมาชิก', `<@${newMember.id}>`),
                    field('🛡️ ผู้ดูแลรับผิดชอบ', info?.executor ? `<@${info.executor.id}>` : 'ไม่ทราบ'),
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
                description: `${userLine(newMember.user)} ${isGiven ? 'ถูกสั่งหมดเวลาพูดคุย' : 'ถูกปลดสถานะหมดเวลา'}`,
                thumbnail: newMember.user.displayAvatarURL({ size: 128 }),
                fields: [
                    field('👤 สมาชิก', `<@${newMember.id}>`),
                    field('🛡️ ผู้ดูแลรับผิดชอบ', info?.executor ? `<@${info.executor.id}>` : 'ไม่ทราบ'),
                    isGiven ? field('⏰ หมดเวลาเมื่อ', `<t:${Math.floor(newTimeout / 1000)}:F>\n(<t:${Math.floor(newTimeout / 1000)}:R>)`, false) : null,
                    field('📝 เหตุผล', info?.reason || 'ไม่ได้ระบุ', false),
                ],
            });
        }
    });

    // --- ข้อความ ---
    client.on(Events.MessageDelete, async message => {
        if (!isActive('messageDelete')) return;
        if (!message.guild) return;
        if (message.author?.bot) return; // ข้ามข้อความบอท กัน log ตีกันเอง

        const info = await fetchExecutor(message.guild, AuditLogEvent.MessageDelete, message.author?.id, 6000);
        sendLog('messageDelete', {
            title: '🗑️ ข้อความที่ลบไปแล้ว',
            description: `ข้อความใน <#${message.channelId}> ถูกลบ`,
            fields: [
                field('👤 ผู้เขียน', message.author ? `<@${message.author.id}>` : 'ไม่ทราบ'),
                field('📺 ช่อง', `<#${message.channelId}>`),
                field('🛡️ ผู้ลบ', info?.executor ? `<@${info.executor.id}>` : 'ผู้เขียนเอง / ไม่ทราบ'),
                field('💬 เนื้อหา', message.content || '*(ไม่มีข้อความ — อาจเป็นรูปหรือ embed)*', false),
                message.attachments?.size ? field('📎 ไฟล์แนบ', message.attachments.map(a => a.name).join(', '), false) : null,
            ],
        });
    });

    client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
        if (!isActive('messageUpdate')) return;
        if (!newMessage.guild) return;
        if (newMessage.author?.bot) return;
        // ข้ามกรณี embed โหลดทีหลัง (เนื้อหาไม่ได้เปลี่ยนจริง)
        if (oldMessage.content === newMessage.content) return;

        sendLog('messageUpdate', {
            title: '📝 ข้อความที่แก้ไขแล้ว',
            description: `ข้อความใน <#${newMessage.channelId}> ถูกแก้ไข — [ไปที่ข้อความ](${newMessage.url})`,
            fields: [
                field('👤 ผู้เขียน', newMessage.author ? `<@${newMessage.author.id}>` : 'ไม่ทราบ'),
                field('📺 ช่อง', `<#${newMessage.channelId}>`),
                field('❌ ข้อความเดิม', oldMessage.content || '*(ไม่ทราบ — ข้อความเก่าเกินแคช)*', false),
                field('✅ ข้อความใหม่', newMessage.content || '*(ว่าง)*', false),
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
                field('🛡️ ผู้ดูแลรับผิดชอบ', info?.executor ? `<@${info.executor.id}>` : 'ไม่ทราบ'),
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
                field('🛡️ ผู้ดูแลรับผิดชอบ', info?.executor ? `<@${info.executor.id}>` : 'ไม่ทราบ'),
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
                    || await fetchExecutor(newChannel.guild, AuditLogEvent.ChannelOverwriteCreate, newChannel.id)
                    || await fetchExecutor(newChannel.guild, AuditLogEvent.ChannelOverwriteDelete, newChannel.id);
                sendLog('channelPermissionUpdate', {
                    title: '🔐 สิทธิของช่องอัพเดทแล้ว',
                    description: `สิทธิ์ในช่อง <#${newChannel.id}> ถูกแก้ไข`,
                    fields: [
                        field('📺 ช่อง', `<#${newChannel.id}>`),
                        field('🛡️ ผู้ดูแลรับผิดชอบ', info?.executor ? `<@${info.executor.id}>` : 'ไม่ทราบ'),
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
                field('🛡️ ผู้ดูแลรับผิดชอบ', info?.executor ? `<@${info.executor.id}>` : 'ไม่ทราบ', false),
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
            description: `สร้างเธรดใหม่: <#${thread.id}>`,
            fields: [
                field('🧵 เธรด', `<#${thread.id}>`),
                field('📺 อยู่ในช่อง', thread.parentId ? `<#${thread.parentId}>` : 'ไม่ทราบ'),
                field('🛡️ ผู้สร้าง', info?.executor ? `<@${info.executor.id}>` : (thread.ownerId ? `<@${thread.ownerId}>` : 'ไม่ทราบ')),
            ],
        });
    });

    client.on(Events.ThreadDelete, async thread => {
        if (!isActive('threadDelete')) return;
        const info = await fetchExecutor(thread.guild, AuditLogEvent.ThreadDelete, thread.id);
        sendLog('threadDelete', {
            title: '🗑️ ลบเธรด',
            description: `เธรด **${thread.name}** ถูกลบ`,
            fields: [
                field('🏷️ ชื่อเธรด', thread.name),
                field('📺 อยู่ในช่อง', thread.parentId ? `<#${thread.parentId}>` : 'ไม่ทราบ'),
                field('🛡️ ผู้ดูแลรับผิดชอบ', info?.executor ? `<@${info.executor.id}>` : 'ไม่ทราบ'),
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
            description: `เธรด <#${newThread.id}> ถูกแก้ไข`,
            fields: [
                field('🛡️ ผู้ดูแลรับผิดชอบ', info?.executor ? `<@${info.executor.id}>` : 'ไม่ทราบ', false),
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
                field('🛡️ ผู้ดูแลรับผิดชอบ', info?.executor ? `<@${info.executor.id}>` : 'ไม่ทราบ'),
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
                field('🛡️ ผู้ดูแลรับผิดชอบ', info?.executor ? `<@${info.executor.id}>` : 'ไม่ทราบ'),
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
                field('🛡️ ผู้ดูแลรับผิดชอบ', info?.executor ? `<@${info.executor.id}>` : 'ไม่ทราบ', false),
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
                field('🛡️ ผู้ดูแลรับผิดชอบ', info?.executor ? `<@${info.executor.id}>` : 'ไม่ทราบ', false),
                ...changes,
            ],
        });
    });

    // --- คำเชิญ ---
    client.on(Events.InviteCreate, async invite => {
        if (!isActive('inviteCreate')) return;
        sendLog('inviteCreate', {
            title: '📨 สร้างคำเชิญของเซิร์ฟเวอร์',
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

    // --- ห้องเสียง ---
    client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
        const member = newState.member || oldState.member;
        if (!member || member.user.bot) return;
        const guild = newState.guild || oldState.guild;

        // เข้าห้องเสียง
        if (!oldState.channelId && newState.channelId) {
            if (!isActive('voiceJoin')) return;
            sendLog('voiceJoin', {
                title: '🔊 สมาชิกเข้าร่วมช่องเสียง',
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
                    description: `${userLine(member.user)} ถูกตัดออกจาก <#${oldState.channelId}>`,
                    fields: [
                        field('👤 สมาชิก', `<@${member.id}>`),
                        field('🔊 ห้อง', `<#${oldState.channelId}>`),
                        field('🛡️ ผู้ดูแลรับผิดชอบ', kickInfo.executor ? `<@${kickInfo.executor.id}>` : 'ไม่ทราบ'),
                    ],
                });
                return;
            }

            if (!leaveActive) return;
            sendLog('voiceLeave', {
                title: '🔇 สมาชิกออกจากช่องเสียง',
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
                    description: `${userLine(member.user)} ถูกย้ายห้องเสียง`,
                    fields: [
                        field('👤 สมาชิก', `<@${member.id}>`),
                        field('🛡️ ผู้ดูแลรับผิดชอบ', moveInfo.executor ? `<@${moveInfo.executor.id}>` : 'ไม่ทราบ'),
                        field('❌ จาก', `<#${oldState.channelId}>`),
                        field('✅ ไป', `<#${newState.channelId}>`),
                    ],
                });
                return;
            }

            if (!switchActive) return;
            sendLog('voiceSwitch', {
                title: '🔀 สมาชิกสลับห้องเสียง',
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
            description: `${userLine(member.user)} ใน <#${newState.channelId || oldState.channelId}>`,
            fields: [
                field('👤 สมาชิก', `<@${member.id}>`, false),
                ...changes,
            ],
        });
    });
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
        description: `ระบบคัดกรองอัตโนมัติทำงานกับข้อความของ ${userLine(user)}`,
        fields: [
            field('👤 สมาชิก', `<@${user.id}>`),
            field('📺 ช่อง', `<#${channelId}>`),
            field('⚙️ ระบบที่ทำงาน', reason, false),
            field('💬 ข้อความที่ถูกจัดการ', content || '*(ไม่มีข้อความ)*', false),
        ],
    });
}

// เรียกครั้งเดียวตอนบอทเริ่มทำงาน
async function initLogManager(client) {
    clientRef = client;
    await store.initLogSettings();
    registerListeners(client);
    console.log('📋 Log Manager: เริ่มติดตามเหตุการณ์ในเซิร์ฟเวอร์แล้ว');
}

module.exports = { initLogManager, sendLog, logFilterAction };
