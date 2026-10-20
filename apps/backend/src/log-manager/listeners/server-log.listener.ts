import { Injectable } from '@nestjs/common';
import {
    AuditLogEvent,
    Events,
    type AutoModerationActionExecution,
    type AutoModerationRule,
    type Guild,
    type GuildEmoji,
    type GuildScheduledEvent,
    type Invite,
    type PartialGuildScheduledEvent,
    type Role,
    type StageInstance,
    type Sticker,
} from 'discord.js';
import { OnDiscord } from '../../discord/decorators/on-discord.decorator';
import type { LogField } from '../interfaces/log-payload.interface';
import { LogDispatcher } from '../services/log-dispatcher.service';
import { executorLine, field, fullTimestamp, unixSeconds } from '../utils/log-format.util';
import { auditRecord } from './log-listener.util';

// ==========================================
// 🏰 LOG ระดับเซิร์ฟเวอร์ — บทบาท / ตั้งค่าเซิร์ฟเวอร์ / คำเชิญ / อีโมจิ-สติกเกอร์ / กิจกรรม / Stage / AutoMod
// ==========================================
@Injectable()
export class ServerLogListener {
    constructor(private readonly logs: LogDispatcher) {}

    // --- บทบาท ---
    @OnDiscord(Events.GuildRoleCreate)
    async onRoleCreate(role: Role): Promise<void> {
        if (!this.logs.isActive(role.guild, 'roleCreate')) return;
        const info = await this.logs.fetchExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
        void this.logs.sendLog(role.guild, 'roleCreate', {
            record: auditRecord(info),
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
            record: auditRecord(info),
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
            record: auditRecord(info),
            title: '🎭 อัพเดทบทบาทแล้ว',
            description: `บทบาท <@&${newRole.id}> ถูกแก้ไข`,
            fields: [field('🛡️ ผู้ดำเนินการ', executorLine(info), false), ...changes],
        });
    }

    // --- ตั้งค่าเซิร์ฟเวอร์ ---
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
            record: auditRecord(info),
            title: '🏰 อัปเดตเซิร์ฟเวอร์',
            description: `ตั้งค่าเซิร์ฟเวอร์ **${newGuild.name}** ถูกแก้ไข`,
            fields: [field('🛡️ ผู้ดำเนินการ', executorLine(info), false), ...changes],
        });
    }

    // --- คำเชิญ (สร้างและลบใช้สวิตช์เดียวกัน: inviteCreate = "คำเชิญของเซิร์ฟเวอร์") ---
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
        const target = updated ?? item;
        if (!this.logs.isActive(target.guild, eventKey)) return;
        const [icon, typeLabel] = eventKey === 'emojiUpdate' ? ['😀', 'อีโมจิ'] : ['🏷️', 'สติกเกอร์'];
        const info = await this.logs.fetchExecutor(target.guild, auditType, target.id);
        const changes = updated && item.name !== updated.name ? [field('🏷️ ชื่อ', `${item.name} → ${updated.name}`, false)] : [];
        void this.logs.sendLog(target.guild, eventKey, {
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
        void this.logs.sendLog(target.guildId, 'scheduledEvent', {
            title: `${icon} ${action}กิจกรรมของเซิร์ฟเวอร์`,
            context: { userId: target.creatorId, channelId: target.channelId },
            description: `กิจกรรม **${target.name}**`,
            fields: [
                field('🏷️ ชื่อกิจกรรม', target.name),
                field('👤 ผู้สร้าง', target.creatorId ? `<@${target.creatorId}>` : 'ไม่ทราบ'),
                field('📍 สถานที่', target.channelId ? `<#${target.channelId}>` : target.entityMetadata?.location || 'ไม่ระบุ'),
                target.scheduledStartTimestamp ? field('🕒 เริ่ม', fullTimestamp(target.scheduledStartTimestamp), false) : null,
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
}
