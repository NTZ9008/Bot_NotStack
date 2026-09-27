import { Injectable, Logger } from '@nestjs/common';
import { Events, type VoiceState } from 'discord.js';
import { BotConfigService } from '../../bot-config/bot-config.service';
import { thaiTimestamp } from '../../common/utils/parse.util';
import { OnDiscord } from '../../discord/decorators/on-discord.decorator';
import { DiscordService } from '../../discord/discord.service';
import { LogFilesService } from '../../log-files/log-files.service';
import { VoiceGuardService } from '../voice-guard.service';

// ==========================================
// 🎙️ VOICE STATE — บังคับ Whitelist/Blacklist ก่อน แล้วค่อยบันทึกประวัติเข้า/ออก/ย้ายห้อง
// (ไฟล์ logs/*_history.log + ข้อความเข้าห้อง LOG_CHANNEL_ID ของเซิร์ฟเวอร์นั้น)
// ==========================================
@Injectable()
export class VoiceStateListener {
    private readonly logger = new Logger('VoiceGuard');

    constructor(
        private readonly guard: VoiceGuardService,
        private readonly discord: DiscordService,
        private readonly config: BotConfigService,
        private readonly logFiles: LogFilesService,
    ) {}

    // เตะออกถ้าไม่อยู่ใน whitelist / อยู่ใน blacklist — คืน true ถ้าถูกเตะ
    private async enforce(newState: VoiceState): Promise<boolean> {
        const member = newState.member;
        const channelId = newState.channelId;
        if (!member || !channelId) return false;
        const roomName = newState.channel?.name || 'ห้องเสียง';

        const whitelist = await this.guard.getChannel('whitelist', channelId);
        if (whitelist?.enabled) {
            const allowed = await this.guard.getUsers('whitelist', channelId);
            if (!allowed.includes(member.id)) {
                await member.voice.disconnect().catch(() => {});
                if (whitelist.notify) {
                    await member.send(`❌ คุณไม่ได้อยู่ใน whitelist ของห้อง **${roomName}** จึงไม่สามารถเข้าได้`).catch(() => {});
                }
                return true;
            }
        }

        const blacklist = await this.guard.getChannel('blacklist', channelId);
        if (blacklist?.enabled) {
            const banned = await this.guard.getUsers('blacklist', channelId);
            if (banned.includes(member.id)) {
                await member.voice.disconnect().catch(() => {});
                if (blacklist.notify) {
                    await member.send(`🚫 คุณถูกแบนจากห้อง **${roomName}** จึงไม่สามารถเข้าได้`).catch(() => {});
                }
                return true;
            }
        }
        return false;
    }

    @OnDiscord(Events.VoiceStateUpdate)
    async onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
        const member = newState.member;
        if (!member || member.user.bot) return;
        if (await this.enforce(newState)) return;

        let action = '';
        if (!oldState.channel && newState.channel) {
            action = `✅ ${member.user.username} เข้าห้อง ${newState.channel.name}`;
        } else if (oldState.channel && !newState.channel) {
            action = `❌ ${member.user.username} ออกจากห้อง ${oldState.channel.name}`;
        } else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
            action = `🔄 ${member.user.username} ย้ายจากห้อง ${oldState.channel.name} ไปยัง ${newState.channel.name}`;
        }
        if (!action) return;

        const timestamp = thaiTimestamp();
        const guild = newState.guild;
        // ไฟล์ log รวมทุกเซิร์ฟเวอร์ — เซิร์ฟเวอร์อื่นนอกจากเซิร์ฟเวอร์หลักมีชื่อเซิร์ฟเวอร์กำกับ
        const prefix = this.discord.isHome(guild.id) ? '' : `[${guild.name}] `;
        this.logFiles.appendVoiceHistory(`${timestamp} ⏰ ${prefix}${action}\n`);
        try {
            const logChannelId = await this.config.get(guild.id, 'LOG_CHANNEL_ID');
            if (!logChannelId) return;
            const channel = await this.discord.fetchGuildChannel(guild.id, logChannelId);
            if (channel?.isSendable()) await channel.send(`📢 ${timestamp} ⏰ ${action}`);
        } catch (err) {
            this.logger.error(`Send Log Error: ${(err as Error).message}`);
        }
    }
}
