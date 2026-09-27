import { Injectable, Logger } from '@nestjs/common';
import { Events, type GuildMember } from 'discord.js';
import { OnDiscord } from '../../discord/decorators/on-discord.decorator';
import { WelcomeService } from '../welcome.service';
import { WelcomeStore } from '../welcome.store';

// สมาชิกใหม่เข้าเซิร์ฟเวอร์ → ส่งการ์ดต้อนรับทุกใบที่เปิดอยู่ของเซิร์ฟเวอร์นั้น
@Injectable()
export class MemberJoinListener {
    private readonly logger = new Logger('Welcome');

    constructor(
        private readonly store: WelcomeStore,
        private readonly welcome: WelcomeService,
    ) {}

    @OnDiscord(Events.GuildMemberAdd)
    async onMemberJoin(member: GuildMember): Promise<void> {
        // บอทที่ถูกเชิญเข้ามาไม่ต้องได้การ์ดต้อนรับ
        if (member.user.bot) return;

        for (const card of await this.store.listEnabledCards(member.guild.id)) {
            try {
                const { channel, error } = await this.welcome.resolveTargetChannel(member.guild, card.channelId);
                if (!channel) {
                    this.logger.warn(`ข้ามการ์ด "${card.name}" (${member.guild.name}): ${error}`);
                    continue;
                }
                await channel.send(await this.welcome.buildPayload(card, { member }));
            } catch (err) {
                this.logger.error(`ส่งการ์ด "${card.name}" ให้ ${member.user.tag} ไม่สำเร็จ: ${(err as Error).message}`);
            }
        }
    }
}
