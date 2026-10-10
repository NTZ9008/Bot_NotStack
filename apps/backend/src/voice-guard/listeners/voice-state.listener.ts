import { Injectable, Logger } from '@nestjs/common';
import { Events, type VoiceState } from 'discord.js';
import { BotConfigService } from '../../bot-config/bot-config.service';
import { thaiTimestamp } from '../../common/utils/parse.util';
import { OnDiscord } from '../../discord/decorators/on-discord.decorator';
import { DiscordService } from '../../discord/discord.service';
import { LogFilesService } from '../../log-files/log-files.service';
import { LogDispatcher } from '../../log-manager/services/log-dispatcher.service';
import { VoiceGuardService } from '../voice-guard.service';

// event ของ Log Manager ที่แจ้งเรื่องเดียวกับ log ห้องเสียงแบบเดิม — ถ้าตั้งให้ส่งเข้า Discord อยู่ ไม่ต้องส่งแบบเดิมซ้ำ
const LOG_MANAGER_EVENTS = {
    join: ['voiceJoin'],
    leave: ['voiceLeave', 'voiceDisconnected'],
    move: ['voiceSwitch', 'voiceMoved'],
} as const;

// ==========================================
// 🎙️ VOICE STATE — บังคับ Whitelist/Blacklist ตอนเข้า/ย้ายห้อง แล้วค่อยบันทึกประวัติเข้า/ออก/ย้ายห้อง
// (ไฟล์ logs/*_history.log ของเซิร์ฟเวอร์หลัก + ข้อความเข้าห้อง LOG_CHANNEL_ID ของเซิร์ฟเวอร์นั้น
//  — ข้ามข้อความ LOG_CHANNEL_ID ถ้า Log Manager ส่ง event เดียวกันเข้า Discord อยู่แล้ว)
// ==========================================
@Injectable()
export class VoiceStateListener {
    private readonly logger = new Logger('VoiceGuard');

    constructor(
        private readonly guard: VoiceGuardService,
        private readonly discord: DiscordService,
        private readonly config: BotConfigService,
        private readonly logFiles: LogFilesService,
        private readonly logs: LogDispatcher,
    ) {}

    // เตะออกถ้าไม่อยู่ใน whitelist / อยู่ใน blacklist — คืน true ถ้าถูกเตะ
    private async enforce(newState: VoiceState): Promise<boolean> {
        const member = newState.member;
        const channelId = newState.channelId;
        if (!member || !channelId) return false;
        const roomName = newState.channel?.name || 'ห้องเสียง';
        const { whitelist, blacklist } = await this.guard.rules(channelId);

        if (whitelist?.enabled && !whitelist.userIds.has(member.id)) {
            await member.voice.disconnect().catch(() => {});
            if (whitelist.notify) {
                await member.send(`❌ คุณไม่ได้อยู่ใน whitelist ของห้อง **${roomName}** จึงไม่สามารถเข้าได้`).catch(() => {});
            }
            return true;
        }

        if (blacklist?.enabled && blacklist.userIds.has(member.id)) {
            await member.voice.disconnect().catch(() => {});
            if (blacklist.notify) {
                await member.send(`🚫 คุณถูกแบนจากห้อง **${roomName}** จึงไม่สามารถเข้าได้`).catch(() => {});
            }
            return true;
        }
        return false;
    }

    @OnDiscord(Events.VoiceStateUpdate)
    async onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
        const member = newState.member;
        if (!member || member.user.bot) return;
        // เปิด/ปิดไมค์ แชร์จอ ฯลฯ ไม่ใช่การเข้าห้อง — ไม่ต้องเช็คกติกาหรือบันทึกอะไร
        if (oldState.channelId === newState.channelId) return;
        if (await this.enforce(newState)) return;

        let action = '';
        let kind: keyof typeof LOG_MANAGER_EVENTS | null = null;
        if (!oldState.channel && newState.channel) {
            action = `✅ ${member.user.username} เข้าห้อง ${newState.channel.name}`;
            kind = 'join';
        } else if (oldState.channel && !newState.channel) {
            action = `❌ ${member.user.username} ออกจากห้อง ${oldState.channel.name}`;
            kind = 'leave';
        } else if (oldState.channel && newState.channel) {
            action = `🔄 ${member.user.username} ย้ายจากห้อง ${oldState.channel.name} ไปยัง ${newState.channel.name}`;
            kind = 'move';
        }
        if (!action || !kind) return;

        const timestamp = thaiTimestamp();
        const guild = newState.guild;
        // ไฟล์ log เก็บเฉพาะเซิร์ฟเวอร์หลัก (เซิร์ฟเวอร์อื่นดูได้จาก Activity Log ของ Log Manager)
        if (this.discord.isHome(guild.id)) this.logFiles.appendVoiceHistory(`${timestamp} ⏰ ${action}\n`);
        try {
            const logChannelId = await this.config.get(guild.id, 'LOG_CHANNEL_ID');
            if (!logChannelId) return;
            if (await this.logs.sendsToDiscord(guild.id, [...LOG_MANAGER_EVENTS[kind]])) return;
            const channel = await this.discord.fetchGuildChannel(guild.id, logChannelId);
            if (channel?.isSendable()) await channel.send({ content: `📢 ${timestamp} ⏰ ${action}`, allowedMentions: { parse: [] } });
        } catch (err) {
            this.logger.error(`Send Log Error: ${(err as Error).message}`);
        }
    }
}
