import { Injectable } from '@nestjs/common';
import { AuditLogEvent, Events, type GuildBan, type GuildMember, type PartialGuildMember, type PartialUser, type User } from 'discord.js';
import { OnDiscord } from '../../discord/decorators/on-discord.decorator';
import type { LogField } from '../interfaces/log-payload.interface';
import { LogDispatcher } from '../services/log-dispatcher.service';
import { executorLine, field, fullTimestamp, userLine } from '../utils/log-format.util';
import { auditRecord } from './log-listener.util';

type MemberContext = { userId: string; isBot: boolean; member: GuildMember };

// ==========================================
// 👥 LOG สมาชิก — เข้า / ออก / ถูกเตะ / แบน / ชื่อเล่น / บทบาท / timeout / โปรไฟล์
// ==========================================
@Injectable()
export class MemberLogListener {
    constructor(private readonly logs: LogDispatcher) {}

    // --- สมาชิกเข้า / ออก / ถูกเตะ ---
    @OnDiscord(Events.GuildMemberAdd)
    onMemberJoin(member: GuildMember): void {
        if (!this.logs.isActive(member.guild, 'memberJoin')) return;
        void this.logs.sendLog(member.guild, 'memberJoin', {
            title: '📥 สมาชิกเข้า',
            context: { userId: member.id, isBot: member.user.bot, member },
            description: `${userLine(member.user)} เข้าร่วมเซิร์ฟเวอร์`,
            thumbnail: member.user.displayAvatarURL({ size: 128 }),
            fields: [
                field('👤 ผู้ใช้', `<@${member.id}>`),
                field('🆔 User ID', member.id),
                field('📅 สร้างบัญชีเมื่อ', fullTimestamp(member.user.createdTimestamp), false),
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
                record: auditRecord(kickInfo),
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
            ? member.roles.cache
                  .filter((r) => r.id !== member.guild.id)
                  .map((r) => `<@&${r.id}>`)
                  .join(' ')
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
            record: auditRecord(info),
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
            record: auditRecord(info),
            title: '🕊️ ปลดแบนสมาชิก',
            context: { userId: ban.user.id, isBot: ban.user.bot },
            description: `${userLine(ban.user)} ถูกปลดแบนแล้ว`,
            thumbnail: ban.user.displayAvatarURL({ size: 128 }),
            fields: [field('👤 สมาชิก', `<@${ban.user.id}>`), field('🛡️ ผู้ดำเนินการ', executorLine(info))],
        });
    }

    // --- อัปเดตสมาชิก: ชื่อเล่น / บทบาท / timeout (หนึ่ง event อาจเปลี่ยนหลายอย่างพร้อมกัน) ---
    @OnDiscord(Events.GuildMemberUpdate)
    async onMemberUpdate(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember): Promise<void> {
        const context: MemberContext = { userId: newMember.id, isBot: newMember.user.bot, member: newMember };
        await this.logNickname(oldMember, newMember, context);
        await this.logRoles(oldMember, newMember, context);
        await this.logTimeout(oldMember, newMember, context);
    }

    private async logNickname(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember, context: MemberContext): Promise<void> {
        if (oldMember.nickname === newMember.nickname || !this.logs.isActive(newMember.guild, 'nicknameUpdate')) return;
        const info = await this.logs.fetchExecutor(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
        void this.logs.sendLog(newMember.guild, 'nicknameUpdate', {
            record: auditRecord(info),
            title: '✏️ เปลี่ยนชื่อเล่นแล้ว',
            context,
            description: `${userLine(newMember.user)} ถูกเปลี่ยนชื่อเล่น`,
            thumbnail: newMember.user.displayAvatarURL({ size: 128 }),
            fields: [
                field('👤 สมาชิก', `<@${newMember.id}>`),
                field('🛡️ ผู้ดำเนินการ', executorLine(info)),
                field('❌ ชื่อเดิม', oldMember.nickname || oldMember.user?.username),
                field('✅ ชื่อใหม่', newMember.nickname || newMember.user.username),
            ],
        });
    }

    private async logRoles(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember, context: MemberContext): Promise<void> {
        const oldRoles = oldMember.roles.cache;
        const newRoles = newMember.roles.cache;
        const changes = [
            {
                key: 'roleGiven',
                roles: newRoles.filter((r) => !oldRoles.has(r.id)),
                title: '🎭 ให้บทบาท',
                action: 'ได้รับบทบาทใหม่',
                label: '✅ บทบาทที่ได้รับ',
            },
            { key: 'roleRemoved', roles: oldRoles.filter((r) => !newRoles.has(r.id)), title: '🎭 ลบบทบาท', action: 'ถูกถอดบทบาท', label: '❌ บทบาทที่ถูกถอด' },
        ] as const;

        for (const change of changes) {
            if (change.roles.size === 0 || !this.logs.isActive(newMember.guild, change.key)) continue;
            const info = await this.logs.fetchExecutor(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
            void this.logs.sendLog(newMember.guild, change.key, {
                record: auditRecord(info),
                title: change.title,
                context,
                description: `${userLine(newMember.user)} ${change.action}`,
                thumbnail: newMember.user.displayAvatarURL({ size: 128 }),
                fields: [
                    field('👤 สมาชิก', `<@${newMember.id}>`),
                    field('🛡️ ผู้ดำเนินการ', executorLine(info)),
                    field(change.label, change.roles.map((r) => `<@&${r.id}>`).join(' '), false),
                ],
            });
        }
    }

    private async logTimeout(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember, context: MemberContext): Promise<void> {
        const oldTimeout = oldMember.communicationDisabledUntilTimestamp || 0;
        const newTimeout = newMember.communicationDisabledUntilTimestamp || 0;
        if (oldTimeout === newTimeout || !this.logs.isActive(newMember.guild, 'memberTimeout')) return;

        const info = await this.logs.fetchExecutor(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
        const isGiven = newTimeout > Date.now();
        void this.logs.sendLog(newMember.guild, 'memberTimeout', {
            record: auditRecord(info),
            title: isGiven ? '⏳ จำกัดการสื่อสาร (Timeout)' : '⌛ ยกเลิก Timeout',
            context,
            description: `${userLine(newMember.user)} ${isGiven ? 'ถูกสั่งหมดเวลาพูดคุย' : 'ถูกปลดสถานะหมดเวลา'}`,
            thumbnail: newMember.user.displayAvatarURL({ size: 128 }),
            fields: [
                field('👤 สมาชิก', `<@${newMember.id}>`),
                field('🛡️ ผู้ดำเนินการ', executorLine(info)),
                isGiven ? field('⏰ หมดเวลาเมื่อ', fullTimestamp(newTimeout), false) : null,
                field('📝 เหตุผล', info?.reason || 'ไม่ได้ระบุ', false),
            ],
        });
    }

    // --- เปลี่ยนชื่อผู้ใช้ / รูปโปรไฟล์ (ระดับบัญชี ไม่ใช่ชื่อเล่นในเซิร์ฟเวอร์) ---
    // เป็นเหตุการณ์ของบัญชี ไม่ผูกกับเซิร์ฟเวอร์ไหน → ส่งให้ทุกเซิร์ฟเวอร์ที่ผู้ใช้คนนี้เป็นสมาชิกอยู่
    @OnDiscord(Events.UserUpdate)
    onUserUpdate(oldUser: User | PartialUser, newUser: User): void {
        const changes: (LogField | null)[] = [];
        if (oldUser.username !== newUser.username) changes.push(field('🏷️ ชื่อผู้ใช้', `${oldUser.username} → ${newUser.username}`, false));
        if (oldUser.globalName !== newUser.globalName)
            changes.push(field('📛 ชื่อที่แสดง', `${oldUser.globalName || '(ไม่มี)'} → ${newUser.globalName || '(ไม่มี)'}`, false));
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
}
