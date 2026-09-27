import { Injectable, Logger } from '@nestjs/common';
import { AuditLogEvent, ChannelType, Events, type APIEmbed, type DMChannel, type NonThreadGuildBasedChannel } from 'discord.js';
import { BotConfigService } from '../../bot-config/bot-config.service';
import { sleep } from '../../common/utils/parse.util';
import { OnDiscord } from '../../discord/decorators/on-discord.decorator';
import { DiscordService } from '../../discord/discord.service';

type AnyChannel = DMChannel | NonThreadGuildBasedChannel;

// ==========================================
// 🛡️ SECURITY MONITOR — แจ้งเตือนห้อง ALERT_CHANNEL_ID ของเซิร์ฟเวอร์ เมื่อมีคนแอบปรับ Bitrate / Region ของห้องเสียง
// (ช่วยป้องกันการก่อกวนหรือทำให้เซิร์ฟเวอร์แลค) — ปิดได้ที่หน้า Configuration (SECURITY_MONITOR_ENABLED)
// ==========================================
@Injectable()
export class SecurityMonitorListener {
    private readonly logger = new Logger('Security');

    constructor(
        private readonly discord: DiscordService,
        private readonly config: BotConfigService,
    ) {}

    // ใครเป็นคนแก้ห้องนี้ — ดูจาก audit log ChannelUpdate ล่าสุด (ต้องเกิดภายใน 10 วินาที)
    private async executorOf(channel: NonThreadGuildBasedChannel): Promise<string> {
        await sleep(1000);
        const logs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelUpdate });
        const log = logs.entries.first();
        const target = log?.target as { id?: string } | null | undefined;
        if (log && target?.id === channel.id && Date.now() - log.createdTimestamp < 10000) return log.executor?.tag ?? 'ไม่ทราบ';
        return 'ไม่ทราบ';
    }

    private async shouldAlert(guildId: string): Promise<string | null> {
        if (!(await this.config.isEnabled(guildId, 'SECURITY_MONITOR_ENABLED'))) return null;
        return this.config.get(guildId, 'ALERT_CHANNEL_ID');
    }

    private async alert(guildId: string, alertChannelId: string, embed: APIEmbed): Promise<void> {
        const channel = await this.discord.fetchGuildChannel(guildId, alertChannelId);
        if (channel?.isSendable()) await channel.send({ embeds: [embed] });
    }

    @OnDiscord(Events.ChannelUpdate)
    async onBitrateChange(oldChannel: AnyChannel, newChannel: AnyChannel): Promise<void> {
        if (oldChannel.type !== ChannelType.GuildVoice || newChannel.type !== ChannelType.GuildVoice) return;
        if (oldChannel.bitrate === newChannel.bitrate) return;
        try {
            const alertChannelId = await this.shouldAlert(newChannel.guildId);
            if (!alertChannelId) return;
            const executor = await this.executorOf(newChannel);
            await this.alert(newChannel.guildId, alertChannelId, {
                color: 0xffa500,
                title: '⚠️ มีการเปลี่ยนแปลง Bitrate ห้องเสียง!',
                fields: [
                    { name: '🔊 ห้อง', value: `${newChannel.name}`, inline: true },
                    { name: '👤 ผู้ปรับเปลี่ยน', value: executor, inline: true },
                    { name: '📉 เดิม', value: `${oldChannel.bitrate / 1000} kbps`, inline: true },
                    { name: '📈 ใหม่', value: `${newChannel.bitrate / 1000} kbps`, inline: true },
                ],
                timestamp: new Date().toISOString(),
                footer: { text: 'Security Monitor' },
            });
        } catch (err) {
            this.logger.error(`❌ Error Bitrate Monitor: ${(err as Error).message}`);
        }
    }

    @OnDiscord(Events.ChannelUpdate)
    async onRegionChange(oldChannel: AnyChannel, newChannel: AnyChannel): Promise<void> {
        if (oldChannel.type !== ChannelType.GuildVoice || newChannel.type !== ChannelType.GuildVoice) return;
        if (oldChannel.rtcRegion === newChannel.rtcRegion) return;
        this.logger.log(`🌍 Channel Region Changed (${newChannel.guild.name}): ${oldChannel.rtcRegion} -> ${newChannel.rtcRegion}`);
        try {
            const alertChannelId = await this.shouldAlert(newChannel.guildId);
            if (!alertChannelId) return;
            const executor = await this.executorOf(newChannel);
            await this.alert(newChannel.guildId, alertChannelId, {
                color: 0xff4500,
                title: '🌍 มีการเปลี่ยน Region ห้องเสียง!',
                description: `ห้อง **${newChannel.name}** ถูกเปลี่ยนโซนสัญญาณ`,
                fields: [
                    { name: '🔊 ห้อง', value: `<#${newChannel.id}>`, inline: true },
                    { name: '👤 ผู้เปลี่ยน', value: executor, inline: true },
                    { name: '❌ เดิม', value: oldChannel.rtcRegion || 'Automatic (อัตโนมัติ)', inline: true },
                    { name: '✅ ใหม่', value: newChannel.rtcRegion || 'Automatic (อัตโนมัติ)', inline: true },
                ],
                timestamp: new Date().toISOString(),
                footer: { text: 'Security Monitor' },
            });
        } catch (err) {
            this.logger.error(`❌ Error Channel Region: ${(err as Error).message}`);
        }
    }
}
