import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ChannelType } from 'discord.js';
import { DiscordService } from '../../discord/discord.service';
import { LevelsService } from '../levels.service';

const VOICE_XP_INTERVAL_MS = 60000;

// XP จากห้องเสียง: สุ่ม 5-10 XP ทุก 1 นาที (ทุกเซิร์ฟเวอร์) — บอท / คนที่ปิดไมค์ / ปิดหูฟัง จะไม่ได้ XP
@Injectable()
export class VoiceXpTask {
    constructor(
        private readonly discord: DiscordService,
        private readonly levels: LevelsService,
    ) {}

    @Interval(VOICE_XP_INTERVAL_MS)
    award(): void {
        const client = this.discord.ready;
        if (!client || !this.levels.isLoaded()) return;
        for (const guild of client.guilds.cache.values()) {
            for (const channel of guild.channels.cache.values()) {
                if (channel.type !== ChannelType.GuildVoice || channel.members.size === 0) continue;
                for (const member of channel.members.values()) {
                    const isMuted = member.voice.selfMute || member.voice.serverMute;
                    const isDeaf = member.voice.selfDeaf || member.voice.serverDeaf;
                    if (member.user.bot || isDeaf || isMuted) continue;
                    this.levels.addXp(guild.id, member.id, Math.floor(Math.random() * 6) + 5);
                }
            }
        }
    }
}
