import { Injectable } from '@nestjs/common';
import {
    AttachmentBuilder,
    AuditLogEvent,
    Events,
    type AnyThreadChannel,
    type AutoModerationActionExecution,
    type AutoModerationRule,
    type Collection,
    type DMChannel,
    type Guild,
    type GuildAuditLogsEntry,
    type GuildBan,
    type GuildEmoji,
    type GuildMember,
    type GuildScheduledEvent,
    type GuildTextBasedChannel,
    type Invite,
    type Message,
    type NonThreadGuildBasedChannel,
    type PartialGuildMember,
    type PartialGuildScheduledEvent,
    type PartialMessage,
    type PartialUser,
    type PermissionOverwriteManager,
    type Role,
    type StageInstance,
    type Sticker,
    type User,
    type VoiceState,
} from 'discord.js';
import { OnDiscord } from '../../discord/decorators/on-discord.decorator';
import type { LogField } from '../interfaces/log-payload.interface';
import { LogDispatcher, type ExecutorInfo } from '../services/log-dispatcher.service';
import { executorLine, field, unixSeconds, userLine } from '../utils/log-format.util';

type AnyMessage = Message | PartialMessage;
type AnyChannel = DMChannel | NonThreadGuildBasedChannel;
// อ่าน property ที่มีเฉพาะบางชนิดห้อง (topic / bitrate / rtcRegion ...) โดยไม่ต้องแยก type ทีละแบบ
type Loose = Record<string, unknown> & { name?: string; parent?: { name?: string } | null };

const record = (info: ExecutorInfo | null, extra: Record<string, unknown> = {}) => ({
    executor: info?.executor ?? null,
    reason: info?.reason ?? null,
    ...extra,
});

const guildOf = (channel: AnyChannel | AnyThreadChannel): Guild | null => ('guild' in channel ? channel.guild : null);

// เทียบว่ากฎสิทธิ์ในช่องเปลี่ยนไปจริงไหม (จำนวน / allow / deny ของแต่ละ overwrite)
function permissionsChanged(oldPerms: PermissionOverwriteManager['cache'], newPerms: PermissionOverwriteManager['cache']): boolean {
    if (oldPerms.size !== newPerms.size) return true;
    for (const [id, oldOverwrite] of oldPerms) {
        const newOverwrite = newPerms.get(id);
        if (!newOverwrite) return true;
        if (oldOverwrite.allow.bitfield !== newOverwrite.allow.bitfield) return true;
        if (oldOverwrite.deny.bitfield !== newOverwrite.deny.bitfield) return true;
    }
    return false;
}

// ==========================================
// 🎧 LOG MANAGER — ดักจับเหตุการณ์ต่างๆ ใน Discord แล้วส่งต่อให้ LogDispatcher (ทุกเซิร์ฟเวอร์ที่บอทอยู่)
// เปิด/ปิด + เลือกห้อง + เลือกสี ได้จากหน้า Log Management ของแต่ละเซิร์ฟเวอร์
// ==========================================
@Injectable()
export class LogEventsListener {
    constructor(private readonly logs: LogDispatcher) {}

    // เก็บ audit entry ทุกอันที่ไหลเข้ามา + จัดการ log ที่รู้ได้จาก audit อย่างเดียว
    @OnDiscord(Events.GuildAuditLogEntryCreate)
    onAuditEntry(entry: GuildAuditLogsEntry, guild: Guild): void {
        this.logs.pushAuditEntry(entry, guild);
        this.handleAuditOnlyEvents(entry, guild);
    }

    // --- สมาชิกเข้า / ออก / ถูกเตะ ---
    @OnDiscord(Events.GuildMemberAdd)
    onMemberJoin(member: GuildMember): void {
        if (!this.logs.isActive(member.guild, 'memberJoin')) return;
        const createdAt = unixSeconds(member.user.createdTimestamp);
        void this.logs.sendLog(member.guild, 'memberJoin', {
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
    }

    @OnDiscord(Events.GuildMemberRemove)
    async onMemberLeave(member: GuildMember | PartialGuildMember): Promise<void> {
        // แยกให้ออกว่า "ออกเอง" หรือ "ถูกเตะ" — ดูจาก audit log MemberKick
        const kickActive = this.logs.isActive(member.guild, 'memberKick');
        const leaveActive = this.logs.isActive(member.guild, 'memberLeave');
        if (!kickActive && !leaveActive) return;

        const context = { userId: member.id, isBot: member.user.bot, member };
        const kickInfo = kickActive ? await this.logs.fetchExecutor(member.guild, AuditLogEvent.MemberKick, member.id, 8000) : null;

        if (kickInfo) {
            void this.logs.sendLog(member.guild, 'memberKick', {
                record: record(kickInfo),
                title: '👢 เตะสมาชิกแล้ว',
                context,
                description: `${userLine(member.user)} ถูกเตะออกจากเซิร์ฟเวอร์`,
                thumbnail: member.user.displayAvatarURL({ size: 128 }),
                fields: [
                    field('👤 สมาชิก', `<@${member.id}>`),
                    field('🛡️ ผู้ดำเนินการ', executorLine(kickInfo)),
                    field('📝 เหตุผล', kickInfo.reason || 'ไม่ได้ระบุ', false),
                ],
            });
            return;
        }

        if (!leaveActive) return;
        const roles = member.roles?.cache
            ? member.roles.cache.filter((r) => r.id !== member.guild.id).map((r) => `<@&${r.id}>`).join(' ')
            : '';
        void this.logs.sendLog(member.guild, 'memberLeave', {
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
    }

    // --- แบน / ปลดแบน ---
    @OnDiscord(Events.GuildBanAdd)
    async onBan(ban: GuildBan): Promise<void> {
        if (!this.logs.isActive(ban.guild, 'memberBan')) return;
        const info = await this.logs.fetchExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
        void this.logs.sendLog(ban.guild, 'memberBan', {
            record: record(info),
            title: '🔨 แบนสมาชิก',
            context: { userId: ban.user.id, isBot: ban.user.bot },
            description: `${userLine(ban.user)} ถูกแบนออกจากเซิร์ฟเวอร์`,
            thumbnail: ban.user.displayAvatarURL({ size: 128 }),
            fields: [
                field('👤 สมาชิก', `<@${ban.user.id}>`),
                field('🛡️ ผู้ดำเนินการ', executorLine(info)),
                field('📝 เหตุผล', info?.reason || ban.reason || 'ไม่ได้ระบุ', false),
            ],
        });
    }

    @OnDiscord(Events.GuildBanRemove)
    async onUnban(ban: GuildBan): Promise<void> {
        if (!this.logs.isActive(ban.guild, 'memberUnban')) return;
        const info = await this.logs.fetchExecutor(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
        void this.logs.sendLog(ban.guild, 'memberUnban', {
            record: record(info),
            title: '🕊️ ปลดแบนสมาชิก',
            context: { userId: ban.user.id, isBot: ban.user.bot },
            description: `${userLine(ban.user)} ถูกปลดแบนแล้ว`,
            thumbnail: ban.user.displayAvatarURL({ size: 128 }),
            fields: [field('👤 สมาชิก', `<@${ban.user.id}>`), field('🛡️ ผู้ดำเนินการ', executorLine(info))],
        });
    }

    // --- อัปเดตสมาชิก: ชื่อเล่น / บทบาท / timeout ---
    @OnDiscord(Events.GuildMemberUpdate)
    async onMemberUpdate(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember): Promise<void> {
        const context = { userId: newMember.id, isBot: newMember.user.bot, member: newMember };
        const avatar = newMember.user.displayAvatarURL({ size: 128 });

        // 1) เปลี่ยนชื่อเล่น
        if (oldMember.nickname !== newMember.nickname && this.logs.isActive(newMember.guild, 'nicknameUpdate')) {
            const info = await this.logs.fetchExecutor(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
            void this.logs.sendLog(newMember.guild, 'nicknameUpdate', {
                record: record(info),
                title: '✏️ เปลี่ยนชื่อเล่นแล้ว',
                context,
                description: `${userLine(newMember.user)} ถูกเปลี่ยนชื่อเล่น`,
                thumbnail: avatar,
                fields: [
                    field('👤 สมาชิก', `<@${newMember.id}>`),
                    field('🛡️ ผู้ดำเนินการ', executorLine(info)),
                    field('❌ ชื่อเดิม', oldMember.nickname || oldMember.user?.username),
                    field('✅ ชื่อใหม่', newMember.nickname || newMember.user.username),
                ],
            });
        }

        // 2) ให้ / ลบ บทบาท
        const oldRoles = oldMember.roles.cache;
        const newRoles = newMember.roles.cache;
        const added = newRoles.filter((r) => !oldRoles.has(r.id));
        const removed = oldRoles.filter((r) => !newRoles.has(r.id));

        if (added.size > 0 && this.logs.isActive(newMember.guild, 'roleGiven')) {
            const info = await this.logs.fetchExecutor(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
            void this.logs.sendLog(newMember.guild, 'roleGiven', {
                record: record(info),
                title: '🎭 ให้บทบาท',
                context,
                description: `${userLine(newMember.user)} ได้รับบทบาทใหม่`,
                thumbnail: avatar,
                fields: [
                    field('👤 สมาชิก', `<@${newMember.id}>`),
                    field('🛡️ ผู้ดำเนินการ', executorLine(info)),
                    field('✅ บทบาทที่ได้รับ', added.map((r) => `<@&${r.id}>`).join(' '), false),
                ],
            });
        }

        if (removed.size > 0 && this.logs.isActive(newMember.guild, 'roleRemoved')) {
            const info = await this.logs.fetchExecutor(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
            void this.logs.sendLog(newMember.guild, 'roleRemoved', {
                record: record(info),
                title: '🎭 ลบบทบาท',
                context,
                description: `${userLine(newMember.user)} ถูกถอดบทบาท`,
                thumbnail: avatar,
                fields: [
                    field('👤 สมาชิก', `<@${newMember.id}>`),
                    field('🛡️ ผู้ดำเนินการ', executorLine(info)),
                    field('❌ บทบาทที่ถูกถอด', removed.map((r) => `<@&${r.id}>`).join(' '), false),
                ],
            });
        }

        // 3) Timeout (ให้ / ลบ)
        const oldTimeout = oldMember.communicationDisabledUntilTimestamp || 0;
        const newTimeout = newMember.communicationDisabledUntilTimestamp || 0;
        if (oldTimeout !== newTimeout && this.logs.isActive(newMember.guild, 'memberTimeout')) {
            const info = await this.logs.fetchExecutor(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
            const isGiven = newTimeout > Date.now();
            void this.logs.sendLog(newMember.guild, 'memberTimeout', {
                record: record(info),
                title: isGiven ? '⏳ จำกัดการสื่อสาร (Timeout)' : '⌛ ยกเลิก Timeout',
                context,
                description: `${userLine(newMember.user)} ${isGiven ? 'ถูกสั่งหมดเวลาพูดคุย' : 'ถูกปลดสถานะหมดเวลา'}`,
                thumbnail: avatar,
                fields: [
                    field('👤 สมาชิก', `<@${newMember.id}>`),
                    field('🛡️ ผู้ดำเนินการ', executorLine(info)),
                    isGiven ? field('⏰ หมดเวลาเมื่อ', `<t:${unixSeconds(newTimeout)}:F>\n(<t:${unixSeconds(newTimeout)}:R>)`, false) : null,
                    field('📝 เหตุผล', info?.reason || 'ไม่ได้ระบุ', false),
                ],
            });
        }
    }

    // --- เปลี่ยนชื่อผู้ใช้ / รูปโปรไฟล์ (ระดับบัญชี ไม่ใช่ชื่อเล่นในเซิร์ฟเวอร์) ---
    // เป็นเหตุการณ์ของบัญชี ไม่ผูกกับเซิร์ฟเวอร์ไหน → ส่งให้ทุกเซิร์ฟเวอร์ที่ผู้ใช้คนนี้เป็นสมาชิกอยู่
    @OnDiscord(Events.UserUpdate)
    onUserUpdate(oldUser: User | PartialUser, newUser: User): void {
        const changes: (LogField | null)[] = [];
        if (oldUser.username !== newUser.username) changes.push(field('🏷️ ชื่อผู้ใช้', `${oldUser.username} → ${newUser.username}`, false));
        if (oldUser.globalName !== newUser.globalName) changes.push(field('📛 ชื่อที่แสดง', `${oldUser.globalName || '(ไม่มี)'} → ${newUser.globalName || '(ไม่มี)'}`, false));
        if (oldUser.avatar !== newUser.avatar) changes.push(field('🖼️ รูปโปรไฟล์', 'มีการเปลี่ยนรูปโปรไฟล์', false));
        if (changes.length === 0) return;

        for (const guild of newUser.client.guilds.cache.values()) {
            if (!guild.members.cache.has(newUser.id) || !this.logs.isActive(guild, 'userProfileUpdate')) continue;
            void this.logs.sendLog(guild, 'userProfileUpdate', {
                title: '👤 เปลี่ยนชื่อผู้ใช้ / รูปโปรไฟล์',
                context: { userId: newUser.id, isBot: newUser.bot, member: guild.members.cache.get(newUser.id) },
                description: `${userLine(newUser)} แก้ไขโปรไฟล์`,
                thumbnail: newUser.displayAvatarURL({ size: 128 }),
                fields: changes,
            });
        }
    }

    // --- ข้อความ ---
    @OnDiscord(Events.MessageDelete)
    async onMessageDelete(message: AnyMessage): Promise<void> {
        if (!this.logs.isActive(message.guild, 'messageDelete') || !message.guild) return;

        const info = await this.logs.fetchExecutor(message.guild, AuditLogEvent.MessageDelete, message.author?.id ?? null, 6000);
        void this.logs.sendLog(message.guild, 'messageDelete', {
            record: record(info),
            title: '🗑️ ลบข้อความ',
            context: {
                userId: message.author?.id,
                isBot: message.author?.bot,
                channelId: message.channelId,
                parentId: 'parentId' in message.channel ? message.channel.parentId : null,
                member: message.member,
            },
            description: `ข้อความใน <#${message.channelId}> ถูกลบ`,
            fields: [
                field('👤 ผู้เขียน', message.author ? `<@${message.author.id}>` : 'ไม่ทราบ'),
                field('📺 ช่อง', `<#${message.channelId}>`),
                field('🛡️ ผู้ลบ', info ? executorLine(info) : 'ผู้เขียนเอง / ไม่ทราบ'),
                field('💬 เนื้อหา', message.content || '*(ไม่มีข้อความ — อาจเป็นรูปหรือ embed)*', false),
                message.attachments?.size ? field('📎 ไฟล์แนบ', message.attachments.map((a) => a.name).join(', '), false) : null,
            ],
        });
    }

    @OnDiscord(Events.MessageUpdate)
    onMessageUpdate(oldMessage: AnyMessage, newMessage: AnyMessage): void {
        if (!this.logs.isActive(newMessage.guild, 'messageUpdate') || !newMessage.guild) return;
        // ข้ามกรณี embed โหลดทีหลัง (เนื้อหาไม่ได้เปลี่ยนจริง)
        if (oldMessage.content === newMessage.content) return;

        void this.logs.sendLog(newMessage.guild, 'messageUpdate', {
            title: '📝 แก้ไขข้อความ',
            context: {
                userId: newMessage.author?.id,
                isBot: newMessage.author?.bot,
                channelId: newMessage.channelId,
                parentId: 'parentId' in newMessage.channel ? newMessage.channel.parentId : null,
                member: newMessage.member,
            },
            description: `ข้อความใน <#${newMessage.channelId}> ถูกแก้ไข — [ไปที่ข้อความ](${newMessage.url})`,
            fields: [
                field('👤 ผู้เขียน', newMessage.author ? `<@${newMessage.author.id}>` : 'ไม่ทราบ'),
                field('📺 ช่อง', `<#${newMessage.channelId}>`),
                field('ก่อนแก้ไข', oldMessage.content || '*(ไม่ทราบ — ข้อความเก่าเกินแคช)*', false),
                field('หลังแก้ไข', newMessage.content || '*(ว่าง)*', false),
            ],
        });
    }

    // --- ลบข้อความจำนวนมาก (Purge) พร้อมแนบไฟล์เก็บข้อความที่หายไป ---
    @OnDiscord(Events.MessageBulkDelete)
    async onBulkDelete(messages: Collection<string, AnyMessage>, channel: GuildTextBasedChannel): Promise<void> {
        if (!this.logs.isActive(channel?.guild, 'messageBulkDelete') || !channel?.guild) return;

        const cached = [...messages.values()].filter((m) => m.content || m.attachments?.size);
        let files: AttachmentBuilder[] | undefined;
        if (cached.length) {
            const lines = cached
                .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
                .map((m) => {
                    const time = new Date(m.createdTimestamp).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
                    const attached = m.attachments?.size ? ` [ไฟล์แนบ: ${m.attachments.map((a) => a.name).join(', ')}]` : '';
                    return `[${time}] ${m.author?.tag || 'ไม่ทราบ'}: ${m.content || ''}${attached}`;
                });
            files = [new AttachmentBuilder(Buffer.from(lines.join('\n'), 'utf8'), { name: `purged-${Date.now()}.txt` })];
        }

        const info = await this.logs.fetchExecutor(channel.guild, AuditLogEvent.MessageBulkDelete, channel.id, 8000);
        const parentId = 'parentId' in channel ? channel.parentId : null;
        void this.logs.sendLog(channel?.guild, 'messageBulkDelete', {
            record: record(info, { channelId: channel.id, channelName: channel.name }),
            title: '🧹 ลบข้อความจำนวนมาก (Purge)',
            context: { channelId: channel.id, parentId },
            description: `มีการลบข้อความหลายรายการใน <#${channel.id}>`,
            files,
            fields: [
                field('📺 ช่อง', `<#${channel.id}>`),
                field('🔢 จำนวนที่ถูกลบ', `${messages.size} ข้อความ`),
                field('🛡️ ผู้ดำเนินการ', executorLine(info)),
                field('💾 ข้อความที่กู้จากแคชได้', `${cached.length} ข้อความ`),
            ],
        });
    }

    // --- ช่อง ---
    @OnDiscord(Events.ChannelCreate)
    async onChannelCreate(channel: NonThreadGuildBasedChannel): Promise<void> {
        if (!this.logs.isActive(channel.guild, 'channelCreate')) return;
        const info = await this.logs.fetchExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
        void this.logs.sendLog(channel.guild, 'channelCreate', {
            record: record(info, { channelId: channel.id, channelName: channel.name }),
            title: '🏠 สร้างช่องแล้ว',
            description: `สร้างช่องใหม่: <#${channel.id}>`,
            fields: [
                field('📺 ช่อง', `<#${channel.id}>`),
                field('🏷️ ชื่อ', channel.name),
                field('🛡️ ผู้ดำเนินการ', executorLine(info)),
                field('📂 หมวดหมู่', channel.parent?.name || 'ไม่มี'),
            ],
        });
    }

    @OnDiscord(Events.ChannelDelete)
    async onChannelDelete(channel: AnyChannel): Promise<void> {
        if (!this.logs.isActive(guildOf(channel), 'channelDelete') || !('guild' in channel)) return;
        const info = await this.logs.fetchExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
        void this.logs.sendLog(guildOf(channel), 'channelDelete', {
            record: record(info, { channelId: channel.id, channelName: channel.name }),
            title: '🗑️ ลบช่องแล้ว',
            description: `ช่อง **${channel.name}** ถูกลบ`,
            fields: [
                field('🏷️ ชื่อช่อง', channel.name),
                field('🆔 Channel ID', channel.id),
                field('🛡️ ผู้ดำเนินการ', executorLine(info)),
                field('📂 หมวดหมู่', channel.parent?.name || 'ไม่มี'),
            ],
        });
    }

    @OnDiscord(Events.ChannelUpdate)
    async onChannelUpdate(oldChannel: AnyChannel, newChannel: AnyChannel): Promise<void> {
        if (!('guild' in newChannel) || !('guild' in oldChannel)) return;
        const guild = newChannel.guild;

        // 1) สิทธิของช่องเปลี่ยน
        if (this.logs.isActive(guild, 'channelPermissionUpdate')) {
            const oldPerms = oldChannel.permissionOverwrites?.cache;
            const newPerms = newChannel.permissionOverwrites?.cache;
            if (oldPerms && newPerms && permissionsChanged(oldPerms, newPerms)) {
                const info =
                    (await this.logs.fetchExecutor(guild, AuditLogEvent.ChannelOverwriteUpdate, newChannel.id)) ||
                    this.logs.findInAuditBuffer(guild.id, AuditLogEvent.ChannelOverwriteCreate, newChannel.id, 10000) ||
                    this.logs.findInAuditBuffer(guild.id, AuditLogEvent.ChannelOverwriteDelete, newChannel.id, 10000);
                void this.logs.sendLog(guild, 'channelPermissionUpdate', {
                    record: record(info, { channelId: newChannel.id, channelName: newChannel.name }),
                    title: '🔐 สิทธิของช่องอัพเดทแล้ว',
                    description: `สิทธิ์ในช่อง <#${newChannel.id}> ถูกแก้ไข`,
                    fields: [
                        field('📺 ช่อง', `<#${newChannel.id}>`),
                        field('🛡️ ผู้ดำเนินการ', executorLine(info)),
                        field('👥 จำนวนกฎสิทธิ์', `${oldPerms.size} → ${newPerms.size}`),
                    ],
                });
            }
        }

        // 2) รายละเอียดช่องเปลี่ยน (ชื่อ / หัวข้อ / bitrate / ฯลฯ)
        if (!this.logs.isActive(guild, 'channelUpdate')) return;
        const o = oldChannel as unknown as Loose;
        const n = newChannel as unknown as Loose;
        const changes: (LogField | null)[] = [];
        if (o.name !== n.name) changes.push(field('🏷️ ชื่อ', `${o.name} → ${n.name}`, false));
        if (o.topic !== n.topic) changes.push(field('📌 หัวข้อ', `${o.topic || '(ว่าง)'} → ${n.topic || '(ว่าง)'}`, false));
        if (o.nsfw !== n.nsfw) changes.push(field('🔞 NSFW', `${o.nsfw} → ${n.nsfw}`));
        if (o.bitrate !== n.bitrate) changes.push(field('🎚️ Bitrate', `${Number(o.bitrate) / 1000} → ${Number(n.bitrate) / 1000} kbps`));
        if (o.userLimit !== n.userLimit) changes.push(field('👥 จำกัดคน', `${o.userLimit || 'ไม่จำกัด'} → ${n.userLimit || 'ไม่จำกัด'}`));
        if (o.rateLimitPerUser !== n.rateLimitPerUser) changes.push(field('🐌 Slowmode', `${o.rateLimitPerUser || 0} → ${n.rateLimitPerUser || 0} วิ`));
        if (o.rtcRegion !== n.rtcRegion) changes.push(field('🌍 Region', `${o.rtcRegion || 'อัตโนมัติ'} → ${n.rtcRegion || 'อัตโนมัติ'}`));
        if (o.parentId !== n.parentId) changes.push(field('📂 หมวดหมู่', `${o.parent?.name || 'ไม่มี'} → ${n.parent?.name || 'ไม่มี'}`));
        if (changes.length === 0) return;

        const info = await this.logs.fetchExecutor(guild, AuditLogEvent.ChannelUpdate, newChannel.id);
        void this.logs.sendLog(guild, 'channelUpdate', {
            record: record(info, { channelId: newChannel.id, channelName: newChannel.name }),
            title: '🏠 อัปเดตช่องแล้ว',
            description: `ช่อง <#${newChannel.id}> ถูกแก้ไข`,
            fields: [field('🛡️ ผู้ดำเนินการ', executorLine(info), false), ...changes],
        });
    }

    // --- เธรด ---
    @OnDiscord(Events.ThreadCreate)
    async onThreadCreate(thread: AnyThreadChannel): Promise<void> {
        if (!this.logs.isActive(thread.guild, 'threadCreate')) return;
        const info = await this.logs.fetchExecutor(thread.guild, AuditLogEvent.ThreadCreate, thread.id);
        void this.logs.sendLog(thread.guild, 'threadCreate', {
            record: record(info, { channelId: thread.id, channelName: thread.name }),
            title: '🧵 สร้างเธรด',
            context: { channelId: thread.parentId },
            description: `สร้างเธรดใหม่: <#${thread.id}>`,
            fields: [
                field('🧵 เธรด', `<#${thread.id}>`),
                field('📺 อยู่ในช่อง', thread.parentId ? `<#${thread.parentId}>` : 'ไม่ทราบ'),
                field('🛡️ ผู้สร้าง', info ? executorLine(info) : thread.ownerId ? `<@${thread.ownerId}>` : 'ไม่ทราบ'),
            ],
        });
    }

    @OnDiscord(Events.ThreadDelete)
    async onThreadDelete(thread: AnyThreadChannel): Promise<void> {
        if (!this.logs.isActive(thread.guild, 'threadDelete')) return;
        const info = await this.logs.fetchExecutor(thread.guild, AuditLogEvent.ThreadDelete, thread.id);
        void this.logs.sendLog(thread.guild, 'threadDelete', {
            record: record(info, { channelId: thread.id, channelName: thread.name }),
            title: '🗑️ ลบเธรด',
            context: { channelId: thread.parentId },
            description: `เธรด **${thread.name}** ถูกลบ`,
            fields: [
                field('🏷️ ชื่อเธรด', thread.name),
                field('📺 อยู่ในช่อง', thread.parentId ? `<#${thread.parentId}>` : 'ไม่ทราบ'),
                field('🛡️ ผู้ดำเนินการ', executorLine(info)),
            ],
        });
    }

    @OnDiscord(Events.ThreadUpdate)
    async onThreadUpdate(oldThread: AnyThreadChannel, newThread: AnyThreadChannel): Promise<void> {
        if (!this.logs.isActive(newThread.guild, 'threadUpdate')) return;
        const changes: (LogField | null)[] = [];
        if (oldThread.name !== newThread.name) changes.push(field('🏷️ ชื่อ', `${oldThread.name} → ${newThread.name}`, false));
        if (oldThread.archived !== newThread.archived) changes.push(field('📦 เก็บถาวร', `${oldThread.archived} → ${newThread.archived}`));
        if (oldThread.locked !== newThread.locked) changes.push(field('🔒 ล็อก', `${oldThread.locked} → ${newThread.locked}`));
        if (oldThread.rateLimitPerUser !== newThread.rateLimitPerUser) {
            changes.push(field('🐌 Slowmode', `${oldThread.rateLimitPerUser || 0} → ${newThread.rateLimitPerUser || 0} วิ`));
        }
        if (changes.length === 0) return;

        const info = await this.logs.fetchExecutor(newThread.guild, AuditLogEvent.ThreadUpdate, newThread.id);
        void this.logs.sendLog(newThread.guild, 'threadUpdate', {
            record: record(info, { channelId: newThread.id, channelName: newThread.name }),
            title: '🧵 อัปเดตเธรดแล้ว',
            context: { channelId: newThread.parentId },
            description: `เธรด <#${newThread.id}> ถูกแก้ไข`,
            fields: [field('🛡️ ผู้ดำเนินการ', executorLine(info), false), ...changes],
        });
    }

    // --- บทบาท ---
    @OnDiscord(Events.GuildRoleCreate)
    async onRoleCreate(role: Role): Promise<void> {
        if (!this.logs.isActive(role.guild, 'roleCreate')) return;
        const info = await this.logs.fetchExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
        void this.logs.sendLog(role.guild, 'roleCreate', {
            record: record(info),
            title: '🎭 สร้างบทบาทแล้ว',
            description: `สร้างบทบาทใหม่: <@&${role.id}>`,
            fields: [
                field('🎭 บทบาท', `<@&${role.id}>`),
                field('🏷️ ชื่อ', role.name),
                field('🛡️ ผู้ดำเนินการ', executorLine(info)),
                field('🎨 สี', role.hexColor),
            ],
        });
    }

    @OnDiscord(Events.GuildRoleDelete)
    async onRoleDelete(role: Role): Promise<void> {
        if (!this.logs.isActive(role.guild, 'roleDelete')) return;
        const info = await this.logs.fetchExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
        void this.logs.sendLog(role.guild, 'roleDelete', {
            record: record(info),
            title: '🗑️ ลบบทบาทแล้ว',
            description: `บทบาท **${role.name}** ถูกลบ`,
            fields: [field('🏷️ ชื่อบทบาท', role.name), field('🆔 Role ID', role.id), field('🛡️ ผู้ดำเนินการ', executorLine(info))],
        });
    }

    @OnDiscord(Events.GuildRoleUpdate)
    async onRoleUpdate(oldRole: Role, newRole: Role): Promise<void> {
        if (!this.logs.isActive(newRole.guild, 'roleUpdate')) return;
        const changes: (LogField | null)[] = [];
        if (oldRole.name !== newRole.name) changes.push(field('🏷️ ชื่อ', `${oldRole.name} → ${newRole.name}`, false));
        if (oldRole.hexColor !== newRole.hexColor) changes.push(field('🎨 สี', `${oldRole.hexColor} → ${newRole.hexColor}`));
        if (oldRole.hoist !== newRole.hoist) changes.push(field('📌 แสดงแยกกลุ่ม', `${oldRole.hoist} → ${newRole.hoist}`));
        if (oldRole.mentionable !== newRole.mentionable) changes.push(field('📣 แท็กได้', `${oldRole.mentionable} → ${newRole.mentionable}`));
        if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
            const addedPerms = newRole.permissions.toArray().filter((p) => !oldRole.permissions.has(p));
            const removedPerms = oldRole.permissions.toArray().filter((p) => !newRole.permissions.has(p));
            if (addedPerms.length) changes.push(field('✅ สิทธิ์ที่เพิ่ม', addedPerms.join(', '), false));
            if (removedPerms.length) changes.push(field('❌ สิทธิ์ที่ถอด', removedPerms.join(', '), false));
        }
        if (changes.length === 0) return;

        const info = await this.logs.fetchExecutor(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
        void this.logs.sendLog(newRole.guild, 'roleUpdate', {
            record: record(info),
            title: '🎭 อัพเดทบทบาทแล้ว',
            description: `บทบาท <@&${newRole.id}> ถูกแก้ไข`,
            fields: [field('🛡️ ผู้ดำเนินการ', executorLine(info), false), ...changes],
        });
    }

    // --- เซิร์ฟเวอร์ ---
    @OnDiscord(Events.GuildUpdate)
    async onGuildUpdate(oldGuild: Guild, newGuild: Guild): Promise<void> {
        if (!this.logs.isActive(newGuild, 'guildUpdate')) return;
        const changes: (LogField | null)[] = [];
        if (oldGuild.name !== newGuild.name) changes.push(field('🏷️ ชื่อเซิร์ฟเวอร์', `${oldGuild.name} → ${newGuild.name}`, false));
        if (oldGuild.iconURL() !== newGuild.iconURL()) changes.push(field('🖼️ ไอคอน', 'มีการเปลี่ยนไอคอนเซิร์ฟเวอร์', false));
        if (oldGuild.ownerId !== newGuild.ownerId) changes.push(field('👑 เจ้าของ', `<@${oldGuild.ownerId}> → <@${newGuild.ownerId}>`, false));
        if (oldGuild.verificationLevel !== newGuild.verificationLevel) {
            changes.push(field('🛡️ ระดับการยืนยัน', `${oldGuild.verificationLevel} → ${newGuild.verificationLevel}`));
        }
        if (oldGuild.afkChannelId !== newGuild.afkChannelId) {
            changes.push(field('💤 ห้อง AFK', `${oldGuild.afkChannel?.name || 'ไม่มี'} → ${newGuild.afkChannel?.name || 'ไม่มี'}`));
        }
        if (changes.length === 0) return;

        const info = await this.logs.fetchExecutor(newGuild, AuditLogEvent.GuildUpdate);
        void this.logs.sendLog(newGuild, 'guildUpdate', {
            record: record(info),
            title: '🏰 อัปเดตเซิร์ฟเวอร์',
            description: `ตั้งค่าเซิร์ฟเวอร์ **${newGuild.name}** ถูกแก้ไข`,
            fields: [field('🛡️ ผู้ดำเนินการ', executorLine(info), false), ...changes],
        });
    }

    // --- คำเชิญ ---
    @OnDiscord(Events.InviteCreate)
    onInviteCreate(invite: Invite): void {
        if (!this.logs.isActive(invite.guild?.id, 'inviteCreate')) return;
        void this.logs.sendLog(invite.guild?.id, 'inviteCreate', {
            title: '📨 สร้างคำเชิญของเซิร์ฟเวอร์',
            context: { userId: invite.inviter?.id, isBot: invite.inviter?.bot, channelId: invite.channelId },
            description: 'มีการสร้างลิงก์เชิญใหม่',
            fields: [
                field('🔗 โค้ด', invite.code),
                field('📺 ช่องปลายทาง', invite.channelId ? `<#${invite.channelId}>` : 'ไม่ทราบ'),
                field('👤 ผู้สร้าง', invite.inviter ? `<@${invite.inviter.id}>` : 'ไม่ทราบ'),
                field('⏳ หมดอายุ', invite.maxAge ? `<t:${unixSeconds(Date.now() + invite.maxAge * 1000)}:R>` : 'ไม่มีวันหมดอายุ'),
                field('🔢 ใช้ได้สูงสุด', invite.maxUses ? `${invite.maxUses} ครั้ง` : 'ไม่จำกัด'),
            ],
        });
    }

    @OnDiscord(Events.InviteDelete)
    onInviteDelete(invite: Invite): void {
        if (!this.logs.isActive(invite.guild?.id, 'inviteCreate')) return;
        void this.logs.sendLog(invite.guild?.id, 'inviteCreate', {
            title: '🗑️ ลบคำเชิญของเซิร์ฟเวอร์',
            description: 'ลิงก์เชิญถูกลบหรือหมดอายุ',
            fields: [field('🔗 โค้ด', invite.code), field('📺 ช่องปลายทาง', invite.channelId ? `<#${invite.channelId}>` : 'ไม่ทราบ')],
        });
    }

    // --- อีโมจิ / สติกเกอร์ (รวมเป็นการ์ดเดียว เพราะเป็นของประดับเซิร์ฟเวอร์เหมือนกัน) ---
    private async expressionLog(
        eventKey: 'emojiUpdate' | 'stickerUpdate',
        action: string,
        auditType: AuditLogEvent,
        item: GuildEmoji | Sticker,
        updated?: GuildEmoji | Sticker,
    ): Promise<void> {
        if (!this.logs.isActive((updated ?? item).guild, eventKey)) return;
        const [icon, typeLabel] = eventKey === 'emojiUpdate' ? ['😀', 'อีโมจิ'] : ['🏷️', 'สติกเกอร์'];
        const target = updated ?? item;
        const info = await this.logs.fetchExecutor(target.guild, auditType, target.id);
        const changes = updated && item.name !== updated.name ? [field('🏷️ ชื่อ', `${item.name} → ${updated.name}`, false)] : [];
        void this.logs.sendLog((updated ?? item).guild, eventKey, {
            title: `${icon} ${action} ${typeLabel}`,
            description: `${typeLabel} **${target.name}**`,
            thumbnail: 'imageURL' in target ? target.imageURL() : target.url,
            fields: [field('🏷️ ชื่อ', target.name), field('🆔 ID', target.id), field('🛡️ ผู้ดำเนินการ', executorLine(info)), ...changes],
        });
    }

    @OnDiscord(Events.GuildEmojiCreate)
    onEmojiCreate(emoji: GuildEmoji) {
        return this.expressionLog('emojiUpdate', 'เพิ่ม', AuditLogEvent.EmojiCreate, emoji);
    }

    @OnDiscord(Events.GuildEmojiDelete)
    onEmojiDelete(emoji: GuildEmoji) {
        return this.expressionLog('emojiUpdate', 'ลบ', AuditLogEvent.EmojiDelete, emoji);
    }

    @OnDiscord(Events.GuildEmojiUpdate)
    onEmojiUpdate(oldEmoji: GuildEmoji, newEmoji: GuildEmoji) {
        return this.expressionLog('emojiUpdate', 'แก้ไข', AuditLogEvent.EmojiUpdate, oldEmoji, newEmoji);
    }

    @OnDiscord(Events.GuildStickerCreate)
    onStickerCreate(sticker: Sticker) {
        return this.expressionLog('stickerUpdate', 'เพิ่ม', AuditLogEvent.StickerCreate, sticker);
    }

    @OnDiscord(Events.GuildStickerDelete)
    onStickerDelete(sticker: Sticker) {
        return this.expressionLog('stickerUpdate', 'ลบ', AuditLogEvent.StickerDelete, sticker);
    }

    @OnDiscord(Events.GuildStickerUpdate)
    onStickerUpdate(oldSticker: Sticker, newSticker: Sticker) {
        return this.expressionLog('stickerUpdate', 'แก้ไข', AuditLogEvent.StickerUpdate, oldSticker, newSticker);
    }

    // --- กิจกรรมของเซิร์ฟเวอร์ (Scheduled Events) ---
    private scheduledEventLog(action: string, icon: string, target: GuildScheduledEvent | PartialGuildScheduledEvent): void {
        if (!this.logs.isActive(target.guildId, 'scheduledEvent')) return;
        const startAt = target.scheduledStartTimestamp ? unixSeconds(target.scheduledStartTimestamp) : null;
        void this.logs.sendLog(target.guildId, 'scheduledEvent', {
            title: `${icon} ${action}กิจกรรมของเซิร์ฟเวอร์`,
            context: { userId: target.creatorId, channelId: target.channelId },
            description: `กิจกรรม **${target.name}**`,
            fields: [
                field('🏷️ ชื่อกิจกรรม', target.name),
                field('👤 ผู้สร้าง', target.creatorId ? `<@${target.creatorId}>` : 'ไม่ทราบ'),
                field('📍 สถานที่', target.channelId ? `<#${target.channelId}>` : target.entityMetadata?.location || 'ไม่ระบุ'),
                startAt ? field('🕒 เริ่ม', `<t:${startAt}:F>\n(<t:${startAt}:R>)`, false) : null,
            ],
        });
    }

    @OnDiscord(Events.GuildScheduledEventCreate)
    onScheduledEventCreate(event: GuildScheduledEvent) {
        this.scheduledEventLog('สร้าง', '📅', event);
    }

    @OnDiscord(Events.GuildScheduledEventUpdate)
    onScheduledEventUpdate(_old: GuildScheduledEvent | null, event: GuildScheduledEvent) {
        this.scheduledEventLog('แก้ไข', '📅', event);
    }

    @OnDiscord(Events.GuildScheduledEventDelete)
    onScheduledEventDelete(event: GuildScheduledEvent | PartialGuildScheduledEvent) {
        this.scheduledEventLog('ลบ', '🗑️', event);
    }

    // --- เวทีเสียง (Stage) ---
    private stageLog(action: string, icon: string, target: StageInstance): void {
        if (!this.logs.isActive(target.guildId, 'stageInstance')) return;
        void this.logs.sendLog(target.guildId, 'stageInstance', {
            title: `${icon} ${action}เวทีเสียง (Stage)`,
            context: { channelId: target.channelId },
            description: `หัวข้อ: **${target.topic}**`,
            fields: [field('🔊 ห้อง', target.channelId ? `<#${target.channelId}>` : 'ไม่ทราบ'), field('📌 หัวข้อ', target.topic)],
        });
    }

    @OnDiscord(Events.StageInstanceCreate)
    onStageCreate(stage: StageInstance) {
        this.stageLog('เริ่ม', '🎤', stage);
    }

    @OnDiscord(Events.StageInstanceUpdate)
    onStageUpdate(_old: StageInstance | null, stage: StageInstance) {
        this.stageLog('แก้ไข', '🎤', stage);
    }

    @OnDiscord(Events.StageInstanceDelete)
    onStageDelete(stage: StageInstance) {
        this.stageLog('จบ', '🔚', stage);
    }

    // --- AutoMod ของ Discord ---
    @OnDiscord(Events.AutoModerationActionExecution)
    onAutoModAction(execution: AutoModerationActionExecution): void {
        if (!this.logs.isActive(execution.guild, 'autoModAction')) return;
        void this.logs.sendLog(execution.guild, 'autoModAction', {
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
    }

    private autoModRuleLog(action: string, icon: string, target: AutoModerationRule): void {
        if (!this.logs.isActive(target.guild, 'autoModRule')) return;
        void this.logs.sendLog(target.guild, 'autoModRule', {
            title: `${icon} ${action}กฎ AutoMod`,
            description: `กฎ **${target.name}**`,
            fields: [
                field('🏷️ ชื่อกฎ', target.name),
                field('👤 ผู้สร้างกฎ', target.creatorId ? `<@${target.creatorId}>` : 'ไม่ทราบ'),
                field('⚙️ สถานะ', target.enabled ? 'เปิดใช้งาน' : 'ปิดอยู่'),
            ],
        });
    }

    @OnDiscord(Events.AutoModerationRuleCreate)
    onAutoModRuleCreate(rule: AutoModerationRule) {
        this.autoModRuleLog('สร้าง', '🛡️', rule);
    }

    @OnDiscord(Events.AutoModerationRuleUpdate)
    onAutoModRuleUpdate(_old: AutoModerationRule | null, rule: AutoModerationRule) {
        this.autoModRuleLog('แก้ไข', '🛡️', rule);
    }

    @OnDiscord(Events.AutoModerationRuleDelete)
    onAutoModRuleDelete(rule: AutoModerationRule) {
        this.autoModRuleLog('ลบ', '🗑️', rule);
    }

    // --- ห้องเสียง ---
    @OnDiscord(Events.VoiceStateUpdate)
    async onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
        const member = newState.member || oldState.member;
        if (!member) return;
        const guild = newState.guild || oldState.guild;
        const context = { userId: member.id, isBot: member.user.bot, member };

        // เข้าห้องเสียง
        if (!oldState.channelId && newState.channelId) {
            if (!this.logs.isActive(guild, 'voiceJoin')) return;
            void this.logs.sendLog(guild, 'voiceJoin', {
                title: '🔊 สมาชิกเข้าร่วมช่องเสียง',
                context: { ...context, channelId: newState.channelId },
                description: `${userLine(member.user)} เข้าห้องเสียง <#${newState.channelId}>`,
                fields: [field('👤 สมาชิก', `<@${member.id}>`), field('🔊 ห้อง', `<#${newState.channelId}>`)],
            });
            return;
        }

        // ออกจากห้องเสียง (อาจถูกแอดมินตัดสาย)
        if (oldState.channelId && !newState.channelId) {
            const disconnectActive = this.logs.isActive(guild, 'voiceDisconnected');
            const leaveActive = this.logs.isActive(guild, 'voiceLeave');
            if (!disconnectActive && !leaveActive) return;

            // audit log MemberDisconnect ไม่มี target user (Discord รวมเป็นยอดรวม)
            // จึงเช็คแค่ว่ามี entry เกิดขึ้นในช่วงเวลาไล่เลี่ยกันไหม
            const kickInfo = disconnectActive ? await this.logs.fetchExecutor(guild, AuditLogEvent.MemberDisconnect, null, 5000) : null;

            if (kickInfo) {
                void this.logs.sendLog(guild, 'voiceDisconnected', {
                    record: record(kickInfo),
                    title: '⛔ สมาชิกถูกตัดออกจากช่องเสียง',
                    context: { ...context, channelId: oldState.channelId },
                    description: `${userLine(member.user)} ถูกตัดออกจาก <#${oldState.channelId}>`,
                    fields: [
                        field('👤 สมาชิก', `<@${member.id}>`),
                        field('🔊 ห้อง', `<#${oldState.channelId}>`),
                        field('🛡️ ผู้ดำเนินการ', executorLine(kickInfo)),
                    ],
                });
                return;
            }

            if (!leaveActive) return;
            void this.logs.sendLog(guild, 'voiceLeave', {
                title: '🔇 สมาชิกออกจากช่องเสียง',
                context: { ...context, channelId: oldState.channelId },
                description: `${userLine(member.user)} ออกจากห้องเสียง <#${oldState.channelId}>`,
                fields: [field('👤 สมาชิก', `<@${member.id}>`), field('🔊 ห้อง', `<#${oldState.channelId}>`)],
            });
            return;
        }

        // สลับห้อง (อาจถูกแอดมินลากย้าย)
        if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
            const movedActive = this.logs.isActive(guild, 'voiceMoved');
            const switchActive = this.logs.isActive(guild, 'voiceSwitch');
            if (!movedActive && !switchActive) return;

            const moveInfo = movedActive ? await this.logs.fetchExecutor(guild, AuditLogEvent.MemberMove, null, 5000) : null;

            if (moveInfo) {
                void this.logs.sendLog(guild, 'voiceMoved', {
                    record: record(moveInfo),
                    title: '↔️ สมาชิกถูกย้ายไปช่องเสียงอื่น',
                    context: { ...context, channelId: newState.channelId },
                    description: `${userLine(member.user)} ถูกย้ายห้องเสียง`,
                    fields: [
                        field('👤 สมาชิก', `<@${member.id}>`),
                        field('🛡️ ผู้ดำเนินการ', executorLine(moveInfo)),
                        field('❌ จาก', `<#${oldState.channelId}>`),
                        field('✅ ไป', `<#${newState.channelId}>`),
                    ],
                });
                return;
            }

            if (!switchActive) return;
            void this.logs.sendLog(guild, 'voiceSwitch', {
                title: '🔀 สมาชิกสลับห้องเสียง',
                context: { ...context, channelId: newState.channelId },
                description: `${userLine(member.user)} ย้ายห้องเสียง`,
                fields: [field('👤 สมาชิก', `<@${member.id}>`), field('❌ จาก', `<#${oldState.channelId}>`), field('✅ ไป', `<#${newState.channelId}>`)],
            });
            return;
        }

        // สถานะเสียงเปลี่ยน (ปิดไมค์ / ปิดหูฟัง / สตรีม / เปิดกล้อง)
        if (!this.logs.isActive(guild, 'voiceStateChange')) return;
        const changes: (LogField | null)[] = [];
        if (oldState.selfMute !== newState.selfMute) changes.push(field('🎙️ ปิดไมค์เอง', newState.selfMute ? 'เปิดใช้งาน' : 'ยกเลิก'));
        if (oldState.selfDeaf !== newState.selfDeaf) changes.push(field('🎧 ปิดหูฟังเอง', newState.selfDeaf ? 'เปิดใช้งาน' : 'ยกเลิก'));
        if (oldState.serverMute !== newState.serverMute) changes.push(field('🔇 ถูกปิดไมค์โดยแอดมิน', newState.serverMute ? 'ใช่' : 'ไม่ใช่'));
        if (oldState.serverDeaf !== newState.serverDeaf) changes.push(field('🔕 ถูกปิดหูฟังโดยแอดมิน', newState.serverDeaf ? 'ใช่' : 'ไม่ใช่'));
        if (oldState.streaming !== newState.streaming) changes.push(field('📺 สตรีมหน้าจอ', newState.streaming ? 'เริ่ม' : 'หยุด'));
        if (oldState.selfVideo !== newState.selfVideo) changes.push(field('📹 เปิดกล้อง', newState.selfVideo ? 'เริ่ม' : 'หยุด'));
        if (changes.length === 0) return;

        const channelId = newState.channelId || oldState.channelId;
        void this.logs.sendLog(guild, 'voiceStateChange', {
            title: '🎚️ สถานะเสียงเปลี่ยนแปลง',
            context: { ...context, channelId },
            description: `${userLine(member.user)} ใน <#${channelId}>`,
            fields: [field('👤 สมาชิก', `<@${member.id}>`, false), ...changes],
        });
    }

    // ==========================================
    // 🗂️ LOG ที่รู้ได้จาก Audit Log อย่างเดียว (Discord ไม่มี gateway event บอกรายละเอียดพวกนี้ตรงๆ)
    // ==========================================
    private handleAuditOnlyEvents(entry: GuildAuditLogsEntry, guild: Guild): void {
        const executor = entry.executorId ? `<@${entry.executorId}>` : 'ไม่ทราบ';
        const extra = (entry.extra ?? {}) as { removed?: number; days?: number; channel?: { id?: string }; channelId?: string; messageId?: string };

        switch (entry.action) {
            case AuditLogEvent.BotAdd:
                void this.logs.sendLog(guild, 'botAdd', {
                    title: '🤖 เพิ่มบอทเข้าเซิร์ฟเวอร์',
                    description: 'มีการเพิ่มบอทใหม่เข้ามาในเซิร์ฟเวอร์',
                    fields: [
                        field('🤖 บอท', entry.targetId ? `<@${entry.targetId}>` : 'ไม่ทราบ'),
                        field('🛡️ ผู้เพิ่ม', executor),
                        field('📝 เหตุผล', entry.reason || 'ไม่ได้ระบุ', false),
                    ],
                });
                break;

            case AuditLogEvent.MemberPrune:
                void this.logs.sendLog(guild, 'memberPrune', {
                    title: '🧹 ล้างสมาชิกที่ไม่เคลื่อนไหว (Prune)',
                    description: 'มีการล้างสมาชิกที่ไม่เคลื่อนไหวออกจากเซิร์ฟเวอร์',
                    fields: [
                        field('🛡️ ผู้ดำเนินการ', executor),
                        field('🔢 จำนวนที่ถูกล้าง', `${extra.removed ?? 'ไม่ทราบ'} คน`),
                        field('📅 ไม่เคลื่อนไหวเกิน', `${extra.days ?? 'ไม่ทราบ'} วัน`),
                    ],
                });
                break;

            case AuditLogEvent.MessagePin:
            case AuditLogEvent.MessageUnpin: {
                const isPin = entry.action === AuditLogEvent.MessagePin;
                const channelId = extra.channel?.id || extra.channelId;
                void this.logs.sendLog(guild, 'messagePin', {
                    title: isPin ? '📌 ปักหมุดข้อความ' : '📍 เลิกปักหมุดข้อความ',
                    context: { userId: entry.executorId, channelId },
                    description: channelId ? `ข้อความใน <#${channelId}>` : 'มีการเปลี่ยนแปลงข้อความที่ปักหมุด',
                    fields: [
                        field('🛡️ ผู้ดำเนินการ', executor),
                        field('📺 ช่อง', channelId ? `<#${channelId}>` : 'ไม่ทราบ'),
                        field('👤 เจ้าของข้อความ', entry.targetId ? `<@${entry.targetId}>` : 'ไม่ทราบ'),
                        extra.messageId && channelId
                            ? field('🔗 ลิงก์', `[ไปที่ข้อความ](https://discord.com/channels/${guild.id}/${channelId}/${extra.messageId})`, false)
                            : null,
                    ],
                });
                break;
            }

            case AuditLogEvent.WebhookCreate:
            case AuditLogEvent.WebhookUpdate:
            case AuditLogEvent.WebhookDelete: {
                const actionLabel =
                    entry.action === AuditLogEvent.WebhookCreate ? 'สร้าง' : entry.action === AuditLogEvent.WebhookDelete ? 'ลบ' : 'แก้ไข';
                void this.logs.sendLog(guild, 'webhookUpdate', {
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
}
