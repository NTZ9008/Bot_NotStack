import { Injectable, Logger } from '@nestjs/common';
import { Events, type GuildMember, type PartialGuildMember } from 'discord.js';
import { BotConfigService } from '../../bot-config/bot-config.service';
import { OnDiscord } from '../../discord/decorators/on-discord.decorator';

// ==========================================
// 👋 WELCOME / GOODBYE (ข้อความธรรมดา) — ห้อง WELCOME_CHANNEL_ID / GOODBYE_CHANNEL_ID ของแต่ละเซิร์ฟเวอร์
// ทำงานคู่กับการ์ดต้อนรับแบบรูปภาพ (โมดูล welcome) ได้
// ==========================================
@Injectable()
export class MemberGreetingListener {
    private readonly logger = new Logger('Greeting');

    constructor(private readonly config: BotConfigService) {}

    @OnDiscord(Events.GuildMemberAdd)
    async onJoin(member: GuildMember): Promise<void> {
        try {
            const channelId = await this.config.get(member.guild.id, 'WELCOME_CHANNEL_ID');
            if (!channelId) return;
            const channel = await member.guild.channels.fetch(channelId).catch(() => null);
            // ใช้ <@id> เพื่อให้บอทแท็กเรียกคนนั้นเลย
            if (channel?.isSendable()) await channel.send(`🎉 ยินดีต้อนรับ <@${member.id}> เข้าสู่เซิร์ฟเวอร์! ขอให้สนุกนะครับ 🥳`);
        } catch (err) {
            this.logger.error(`❌ ไม่พบห้อง Welcome (${member.guild.name}): ${(err as Error).message}`);
        }
    }

    @OnDiscord(Events.GuildMemberRemove)
    async onLeave(member: GuildMember | PartialGuildMember): Promise<void> {
        try {
            const channelId = await this.config.get(member.guild.id, 'GOODBYE_CHANNEL_ID');
            if (!channelId) return;
            const channel = await member.guild.channels.fetch(channelId).catch(() => null);
            if (channel?.isSendable()) await channel.send(`📤 คุณ **${member.user.username}** ได้ออกจากเซิร์ฟเวอร์แล้ว โชคดีนะ! 👋`);
        } catch (err) {
            this.logger.error(`❌ ไม่พบห้อง Goodbye (${member.guild.name}): ${(err as Error).message}`);
        }
    }
}
