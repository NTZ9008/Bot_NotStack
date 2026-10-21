import { Injectable } from '@nestjs/common';
import { AttachmentBuilder, AuditLogEvent, Events, type Collection, type GuildTextBasedChannel } from 'discord.js';
import { OnDiscord } from '../../discord/decorators/on-discord.decorator';
import { LogDispatcher } from '../services/log-dispatcher.service';
import { executorLine, field } from '../utils/log-format.util';
import { auditRecord, type AnyMessage } from './log-listener.util';

// ห้องหลักของข้อความ (หมวดหมู่ของห้อง / ห้องแม่ของเธรด) — ใช้กรองตามหมวดหมู่ใน Log Manager
const parentIdOf = (message: AnyMessage) => ('parentId' in message.channel ? message.channel.parentId : null);

// ==========================================
// 💬 LOG ข้อความ — ลบ / แก้ไข / ลบจำนวนมาก (Purge)
// ==========================================
@Injectable()
export class MessageLogListener {
    constructor(private readonly logs: LogDispatcher) {}

    @OnDiscord(Events.MessageDelete)
    async onMessageDelete(message: AnyMessage): Promise<void> {
        if (!this.logs.isActive(message.guild, 'messageDelete') || !message.guild) return;

        const info = await this.logs.fetchExecutor(message.guild, AuditLogEvent.MessageDelete, message.author?.id ?? null, 6000);
        void this.logs.sendLog(message.guild, 'messageDelete', {
            record: auditRecord(info),
            title: '🗑️ ลบข้อความ',
            context: {
                userId: message.author?.id,
                isBot: message.author?.bot,
                channelId: message.channelId,
                parentId: parentIdOf(message),
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
                parentId: parentIdOf(newMessage),
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
        const files = cached.length ? [purgedTranscript(cached)] : undefined;
        const info = await this.logs.fetchExecutor(channel.guild, AuditLogEvent.MessageBulkDelete, channel.id, 8000);
        void this.logs.sendLog(channel.guild, 'messageBulkDelete', {
            record: auditRecord(info, { channelId: channel.id, channelName: channel.name }),
            title: '🧹 ลบข้อความจำนวนมาก (Purge)',
            context: { channelId: channel.id, parentId: 'parentId' in channel ? channel.parentId : null },
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
}

// ไฟล์ .txt รวมข้อความที่ถูกลบ (เรียงตามเวลา) จากแคชของบอท
function purgedTranscript(messages: AnyMessage[]): AttachmentBuilder {
    const lines = [...messages]
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
        .map((m) => {
            const time = new Date(m.createdTimestamp).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
            const attached = m.attachments?.size ? ` [ไฟล์แนบ: ${m.attachments.map((a) => a.name).join(', ')}]` : '';
            return `[${time}] ${m.author?.tag || 'ไม่ทราบ'}: ${m.content || ''}${attached}`;
        });
    return new AttachmentBuilder(Buffer.from(lines.join('\n'), 'utf8'), { name: `purged-${Date.now()}.txt` });
}
