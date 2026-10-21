import { Injectable } from '@nestjs/common';
import { AuditLogEvent, Events, type Guild, type GuildMember, type VoiceState } from 'discord.js';
import { OnDiscord } from '../../discord/decorators/on-discord.decorator';
import type { LogField } from '../interfaces/log-payload.interface';
import { LogDispatcher } from '../services/log-dispatcher.service';
import { executorLine, field, userLine } from '../utils/log-format.util';
import { auditRecord } from './log-listener.util';

interface VoiceChange {
    guild: Guild;
    member: GuildMember;
    context: { userId: string; isBot: boolean; member: GuildMember };
}

// ==========================================
// 🔊 LOG ห้องเสียง — เข้า / ออก (หรือถูกตัดสาย) / สลับห้อง (หรือถูกย้าย) / ปิดไมค์-หูฟัง-สตรีม-กล้อง
// ==========================================
@Injectable()
export class VoiceLogListener {
    constructor(private readonly logs: LogDispatcher) {}

    @OnDiscord(Events.VoiceStateUpdate)
    async onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
        const member = newState.member || oldState.member;
        if (!member) return;
        const change: VoiceChange = { guild: newState.guild || oldState.guild, member, context: { userId: member.id, isBot: member.user.bot, member } };

        if (!oldState.channelId && newState.channelId) return this.logJoin(change, newState.channelId);
        if (oldState.channelId && !newState.channelId) return this.logLeave(change, oldState.channelId);
        if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
            return this.logSwitch(change, oldState.channelId, newState.channelId);
        }
        this.logStateChange(change, oldState, newState);
    }

    private logJoin({ guild, member, context }: VoiceChange, channelId: string): void {
        if (!this.logs.isActive(guild, 'voiceJoin')) return;
        void this.logs.sendLog(guild, 'voiceJoin', {
            title: '🔊 สมาชิกเข้าร่วมช่องเสียง',
            context: { ...context, channelId },
            description: `${userLine(member.user)} เข้าห้องเสียง <#${channelId}>`,
            fields: [field('👤 สมาชิก', `<@${member.id}>`), field('🔊 ห้อง', `<#${channelId}>`)],
        });
    }

    // ออกจากห้องเสียง (อาจถูกแอดมินตัดสาย)
    private async logLeave({ guild, member, context }: VoiceChange, channelId: string): Promise<void> {
        const disconnectActive = this.logs.isActive(guild, 'voiceDisconnected');
        const leaveActive = this.logs.isActive(guild, 'voiceLeave');
        if (!disconnectActive && !leaveActive) return;

        // audit log MemberDisconnect ไม่มี target user (Discord รวมเป็นยอดรวม)
        // จึงเช็คแค่ว่ามี entry เกิดขึ้นในช่วงเวลาไล่เลี่ยกันไหม
        const kickInfo = disconnectActive ? await this.logs.fetchExecutor(guild, AuditLogEvent.MemberDisconnect, null, 5000) : null;
        if (kickInfo) {
            void this.logs.sendLog(guild, 'voiceDisconnected', {
                record: auditRecord(kickInfo),
                title: '⛔ สมาชิกถูกตัดออกจากช่องเสียง',
                context: { ...context, channelId },
                description: `${userLine(member.user)} ถูกตัดออกจาก <#${channelId}>`,
                fields: [field('👤 สมาชิก', `<@${member.id}>`), field('🔊 ห้อง', `<#${channelId}>`), field('🛡️ ผู้ดำเนินการ', executorLine(kickInfo))],
            });
            return;
        }

        if (!leaveActive) return;
        void this.logs.sendLog(guild, 'voiceLeave', {
            title: '🔇 สมาชิกออกจากช่องเสียง',
            context: { ...context, channelId },
            description: `${userLine(member.user)} ออกจากห้องเสียง <#${channelId}>`,
            fields: [field('👤 สมาชิก', `<@${member.id}>`), field('🔊 ห้อง', `<#${channelId}>`)],
        });
    }

    // สลับห้อง (อาจถูกแอดมินลากย้าย)
    private async logSwitch({ guild, member, context }: VoiceChange, fromId: string, toId: string): Promise<void> {
        const movedActive = this.logs.isActive(guild, 'voiceMoved');
        const switchActive = this.logs.isActive(guild, 'voiceSwitch');
        if (!movedActive && !switchActive) return;

        const moveInfo = movedActive ? await this.logs.fetchExecutor(guild, AuditLogEvent.MemberMove, null, 5000) : null;
        if (moveInfo) {
            void this.logs.sendLog(guild, 'voiceMoved', {
                record: auditRecord(moveInfo),
                title: '↔️ สมาชิกถูกย้ายไปช่องเสียงอื่น',
                context: { ...context, channelId: toId },
                description: `${userLine(member.user)} ถูกย้ายห้องเสียง`,
                fields: [
                    field('👤 สมาชิก', `<@${member.id}>`),
                    field('🛡️ ผู้ดำเนินการ', executorLine(moveInfo)),
                    field('❌ จาก', `<#${fromId}>`),
                    field('✅ ไป', `<#${toId}>`),
                ],
            });
            return;
        }

        if (!switchActive) return;
        void this.logs.sendLog(guild, 'voiceSwitch', {
            title: '🔀 สมาชิกสลับห้องเสียง',
            context: { ...context, channelId: toId },
            description: `${userLine(member.user)} ย้ายห้องเสียง`,
            fields: [field('👤 สมาชิก', `<@${member.id}>`), field('❌ จาก', `<#${fromId}>`), field('✅ ไป', `<#${toId}>`)],
        });
    }

    // สถานะเสียงเปลี่ยน (ปิดไมค์ / ปิดหูฟัง / สตรีม / เปิดกล้อง)
    private logStateChange({ guild, member, context }: VoiceChange, oldState: VoiceState, newState: VoiceState): void {
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
}
