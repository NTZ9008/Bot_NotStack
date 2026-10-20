import { Injectable } from '@nestjs/common';
import { AuditLogEvent, Events, type Guild, type GuildAuditLogsEntry } from 'discord.js';
import { OnDiscord } from '../../discord/decorators/on-discord.decorator';
import { LogDispatcher } from '../services/log-dispatcher.service';
import { field } from '../utils/log-format.util';

// ==========================================
// 🗂️ LOG จาก Audit Log — เก็บทุก entry ไว้ให้ listener อื่นหาผู้ดำเนินการ + ส่ง log ที่รู้ได้จาก audit อย่างเดียว
// (เพิ่มบอท / Prune / ปักหมุดข้อความ / Webhook)
// ==========================================
@Injectable()
export class AuditLogListener {
    constructor(private readonly logs: LogDispatcher) {}

    @OnDiscord(Events.GuildAuditLogEntryCreate)
    onAuditEntry(entry: GuildAuditLogsEntry, guild: Guild): void {
        this.logs.pushAuditEntry(entry, guild);
        this.handleAuditOnlyEvents(entry, guild);
    }

    // log ที่รู้ได้จาก audit log อย่างเดียว (Discord ไม่มี gateway event บอกรายละเอียดพวกนี้ตรงๆ)
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
                const actionLabel = entry.action === AuditLogEvent.WebhookCreate ? 'สร้าง' : entry.action === AuditLogEvent.WebhookDelete ? 'ลบ' : 'แก้ไข';
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
