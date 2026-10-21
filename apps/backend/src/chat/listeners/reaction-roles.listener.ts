import { Injectable, Logger } from '@nestjs/common';
import { Events, type MessageReaction, type PartialMessageReaction, type PartialUser, type User } from 'discord.js';
import { OnDiscord } from '../../discord/decorators/on-discord.decorator';
import { DiscordService } from '../../discord/discord.service';
import { REACTION_ROLES, REACTION_ROLES_TITLE } from '../reaction-roles.constants';

// ==========================================
// 🎭 REACTION ROLES (Carl-bot Style) — กด reaction บนข้อความของบอทเพื่อรับ/เอาออกยศ
// ยศเป็นของเซิร์ฟเวอร์หลัก (DST04 ...) จึงทำงานเฉพาะเซิร์ฟเวอร์หลัก และเฉพาะข้อความรับยศจาก /setuproles
// ==========================================
@Injectable()
export class ReactionRolesListener {
    private readonly logger = new Logger('ReactionRoles');

    constructor(private readonly discord: DiscordService) {}

    private async apply(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser, add: boolean): Promise<void> {
        if (user.bot) return;
        try {
            if (reaction.partial) await reaction.fetch();
            if (reaction.message.partial) await reaction.message.fetch();
        } catch {
            return;
        }

        const message = reaction.message;
        if (!message.guild || !this.discord.isHome(message.guild.id) || message.author?.id !== this.discord.client.user?.id) return;
        if (message.embeds[0]?.title !== REACTION_ROLES_TITLE) return;

        const roleName = REACTION_ROLES[reaction.emoji.name ?? ''];
        if (!roleName) return;
        const role = message.guild.roles.cache.find((r) => r.name === roleName);
        if (!role) return;

        const member = await message.guild.members.fetch(user.id).catch(() => null);
        if (!member) return;
        const change = add ? member.roles.add(role) : member.roles.remove(role);
        await change.catch((err: Error) => this.logger.error(err.message));
    }

    @OnDiscord(Events.MessageReactionAdd)
    onAdd(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
        return this.apply(reaction, user, true);
    }

    @OnDiscord(Events.MessageReactionRemove)
    onRemove(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
        return this.apply(reaction, user, false);
    }
}
