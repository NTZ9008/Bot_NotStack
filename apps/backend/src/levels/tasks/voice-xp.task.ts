import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ChannelType } from 'discord.js';
import type { XpContext } from '@notstack/shared';
import { DiscordService } from '../../discord/discord.service';
import { LevelsService } from '../levels.service';

// Members awarded at the same time — each award locks only its own member, so a few can run together.
const CONCURRENCY = 4;

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
        if (!client || this.running) return;
        this.running = true;
        try {
            const jobs: { guildId: string; userId: string; context: XpContext }[] = [];
            for (const guild of client.guilds.cache.values()) {
                for (const channel of guild.channels.cache.values()) {
                    if (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice) continue;
                    const humans = channel.members.filter((m) => !m.user.bot);
                    for (const member of humans.values()) {
                        jobs.push({
                            guildId: guild.id,
                            userId: member.id,
                            context: {
                                source: 'voice',
                                channelId: channel.id,
                                parentId: channel.parentId,
                                roleIds: [...member.roles.cache.keys()],
                                muted: Boolean(member.voice.mute || member.voice.suppress),
                                deafened: Boolean(member.voice.deaf),
                                afk: guild.afkChannelId === channel.id,
                                voiceMembers: humans.size,
                            },
                        });
                    }
                }
            }
            let next = 0;
            const worker = async () => {
                while (next < jobs.length) {
                    const { guildId, userId, context } = jobs[next++]!;
                    try {
                        await this.levels.award(guildId, userId, context);
                    } catch (err) {
                        this.logger.error(`Voice XP ${guildId}/${userId}: ${(err as Error).message}`);
                    }
                }
            };
            await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
        } finally {
            this.running = false;
        }
    }
}
