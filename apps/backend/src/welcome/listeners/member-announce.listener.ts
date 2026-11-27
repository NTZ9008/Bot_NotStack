import { Injectable } from '@nestjs/common';
import { Events, type GuildMember, type PartialGuildMember } from 'discord.js';
import { OnDiscord } from '../../discord/decorators/on-discord.decorator';
import { WelcomeService } from '../welcome.service';

// สมาชิกเข้าเซิร์ฟเวอร์ → การ์ดต้อนรับ, ออก (ออกเอง / ถูกเตะ / ถูกแบน) → การ์ดอำลา
@Injectable()
export class MemberAnnounceListener {
    constructor(private readonly welcome: WelcomeService) {}

    @OnDiscord(Events.GuildMemberAdd)
    onMemberJoin(member: GuildMember): Promise<void> {
        return this.welcome.announce(member, 'join');
    }

    @OnDiscord(Events.GuildMemberRemove)
    onMemberLeave(member: GuildMember | PartialGuildMember): Promise<void> {
        return this.welcome.announce(member, 'leave');
    }
}
