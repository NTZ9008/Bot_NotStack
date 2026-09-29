import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ChannelType } from 'discord.js';
import { DiscordService } from '../../discord/discord.service';
import { LevelsService } from '../levels.service';

// Poll every 15s; each rule's persisted cooldown controls its award interval.
@Injectable()
export class VoiceXpTask {
    private readonly logger = new Logger('VoiceXp');
    private running = false;
    constructor(
        private readonly discord: DiscordService,
        private readonly levels: LevelsService,
    ) {}
    @Interval(15000)
    async award(): Promise<void> {
        const client = this.discord.ready;
        if (!client || !this.levels.isLoaded() || this.running) return;
        this.running = true;
        try {
            for (const guild of client.guilds.cache.values()) {
                for (const channel of guild.channels.cache.values()) {
                    if (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice) continue;
                    const humans = channel.members.filter((m) => !m.user.bot);
                    for (const member of humans.values()) {
                        try {
                            await this.levels.award(guild.id, member.id, {
                                source: 'voice',
                                channelId: channel.id,
                                parentId: channel.parentId,
                                roleIds: [...member.roles.cache.keys()],
                                muted: Boolean(member.voice.mute || member.voice.suppress),
                                deafened: Boolean(member.voice.deaf),
                                afk: guild.afkChannelId === channel.id,
                                voiceMembers: humans.size,
                            });
                        } catch (err) {
                            this.logger.error(`Voice XP ${guild.id}/${member.id}: ${(err as Error).message}`);
                        }
                    }
                }
            }
        } finally {
            this.running = false;
        }
    }
}
