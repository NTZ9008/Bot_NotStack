import { Injectable, Logger } from '@nestjs/common';
import { Events, type GuildMember, type PartialGuildMember } from 'discord.js';
import { OnDiscord } from '../../discord/decorators/on-discord.decorator';
import { WelcomeService } from '../welcome.service';
import { WelcomeStore } from '../welcome.store';

// สมาชิกออกจากเซิร์ฟเวอร์ (ออกเอง / ถูกเตะ / ถูกแบน) → ส่งการ์ดอำลาทุกใบที่เปิดอยู่ของเซิร์ฟเวอร์นั้น
@Injectable()
export class MemberLeaveListener {
    private readonly logger = new Logger('Welcome');

    constructor(
        private readonly store: WelcomeStore,
        private readonly welcome: WelcomeService,
    ) {}

    @OnDiscord(Events.GuildMemberRemove)
    async onMemberLeave(member: GuildMember | PartialGuildMember): Promise<void> {
        // บอทถูกเอาออกไม่ต้องมีการ์ดอำลา
        if (member.user.bot) return;

        for (const card of await this.store.listEnabledCards(member.guild.id, 'leave')) {
            try {
                const { channel, error } = await this.welcome.resolveTargetChannel(member.guild, card.channelId);
                if (!channel) {
                    this.logger.warn(`ข้ามการ์ดอำลา "${card.name}" (${member.guild.name}): ${error}`);
                    continue;
                }
                await channel.send(await this.welcome.buildPayload(card, { member }));
            } catch (err) {
                this.logger.error(`ส่งการ์ดอำลา "${card.name}" ของ ${member.user.tag} ไม่สำเร็จ: ${(err as Error).message}`);
            }
        }
    }
}
