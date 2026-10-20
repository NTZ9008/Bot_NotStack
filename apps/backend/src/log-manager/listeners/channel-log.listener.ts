import { Injectable } from '@nestjs/common';
import { AuditLogEvent, Events, type AnyThreadChannel, type Guild, type NonThreadGuildBasedChannel } from 'discord.js';
import { OnDiscord } from '../../discord/decorators/on-discord.decorator';
import type { LogField } from '../interfaces/log-payload.interface';
import { LogDispatcher } from '../services/log-dispatcher.service';
import { executorLine, field } from '../utils/log-format.util';
import { auditRecord, guildOf, permissionsChanged, type AnyChannel, type LooseChannel } from './log-listener.util';

// ==========================================
// 🏠 LOG ช่องและเธรด — สร้าง / ลบ / แก้ไข / สิทธิ์ของช่อง
// ==========================================
@Injectable()
export class ChannelLogListener {
    constructor(private readonly logs: LogDispatcher) {}

    // --- ช่อง ---
    @OnDiscord(Events.ChannelCreate)
    async onChannelCreate(channel: NonThreadGuildBasedChannel): Promise<void> {
        if (!this.logs.isActive(channel.guild, 'channelCreate')) return;
        const info = await this.logs.fetchExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
        void this.logs.sendLog(channel.guild, 'channelCreate', {
            record: auditRecord(info, { channelId: channel.id, channelName: channel.name }),
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
        void this.logs.sendLog(channel.guild, 'channelDelete', {
            record: auditRecord(info, { channelId: channel.id, channelName: channel.name }),
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
        await this.logPermissionChange(oldChannel, newChannel);
        await this.logDetailChange(oldChannel, newChannel);
    }

    private async logPermissionChange(oldChannel: NonThreadGuildBasedChannel, newChannel: NonThreadGuildBasedChannel): Promise<void> {
        const guild = newChannel.guild;
        if (!this.logs.isActive(guild, 'channelPermissionUpdate')) return;
        const oldPerms = oldChannel.permissionOverwrites?.cache;
        const newPerms = newChannel.permissionOverwrites?.cache;
        if (!oldPerms || !newPerms || !permissionsChanged(oldPerms, newPerms)) return;

        const info =
            (await this.logs.fetchExecutor(guild, AuditLogEvent.ChannelOverwriteUpdate, newChannel.id)) ||
            this.logs.findInAuditBuffer(guild.id, AuditLogEvent.ChannelOverwriteCreate, newChannel.id, 10000) ||
            this.logs.findInAuditBuffer(guild.id, AuditLogEvent.ChannelOverwriteDelete, newChannel.id, 10000);
        void this.logs.sendLog(guild, 'channelPermissionUpdate', {
            record: auditRecord(info, { channelId: newChannel.id, channelName: newChannel.name }),
            title: '🔐 สิทธิของช่องอัพเดทแล้ว',
            description: `สิทธิ์ในช่อง <#${newChannel.id}> ถูกแก้ไข`,
            fields: [
                field('📺 ช่อง', `<#${newChannel.id}>`),
                field('🛡️ ผู้ดำเนินการ', executorLine(info)),
                field('👥 จำนวนกฎสิทธิ์', `${oldPerms.size} → ${newPerms.size}`),
            ],
        });
    }

    // รายละเอียดช่องเปลี่ยน (ชื่อ / หัวข้อ / bitrate / ฯลฯ)
    private async logDetailChange(oldChannel: NonThreadGuildBasedChannel, newChannel: NonThreadGuildBasedChannel): Promise<void> {
        const guild: Guild = newChannel.guild;
        if (!this.logs.isActive(guild, 'channelUpdate')) return;
        const o = oldChannel as unknown as LooseChannel;
        const n = newChannel as unknown as LooseChannel;
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
            record: auditRecord(info, { channelId: newChannel.id, channelName: newChannel.name }),
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
            record: auditRecord(info, { channelId: thread.id, channelName: thread.name }),
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
            record: auditRecord(info, { channelId: thread.id, channelName: thread.name }),
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
            record: auditRecord(info, { channelId: newThread.id, channelName: newThread.name }),
            title: '🧵 อัปเดตเธรดแล้ว',
            context: { channelId: newThread.parentId },
            description: `เธรด <#${newThread.id}> ถูกแก้ไข`,
            fields: [field('🛡️ ผู้ดำเนินการ', executorLine(info), false), ...changes],
        });
    }
}
