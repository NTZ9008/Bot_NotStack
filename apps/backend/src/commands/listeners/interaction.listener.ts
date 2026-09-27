import { Injectable, Logger } from '@nestjs/common';
import { Events, MessageFlags, type Interaction } from 'discord.js';
import { OnDiscord } from '../../discord/decorators/on-discord.decorator';
import { DiscordExplorer } from '../../discord/discord.explorer';
import { DiscordService } from '../../discord/discord.service';
import { LogDispatcher } from '../../log-manager/services/log-dispatcher.service';

// ==========================================
// ⌨️ INTERACTIONS — ส่งคำสั่ง / ไปยังคลาส @SlashCommand ที่ตรงชื่อ
// ส่วนปุ่ม / เมนู / pop-up ส่งให้ทุกคำสั่งที่มี handleComponent (แต่ละคำสั่งเช็ค customId ของตัวเอง)
// คำสั่งเฉพาะเซิร์ฟเวอร์หลัก (homeGuildOnly) ใช้ในเซิร์ฟเวอร์อื่นไม่ได้ แม้จะถูกลงทะเบียนค้างไว้
// ==========================================
@Injectable()
export class InteractionListener {
    private readonly logger = new Logger('Commands');

    constructor(
        private readonly explorer: DiscordExplorer,
        private readonly discord: DiscordService,
        private readonly logs: LogDispatcher,
    ) {}

    @OnDiscord(Events.InteractionCreate)
    async onInteraction(interaction: Interaction): Promise<void> {
        try {
            if (interaction.isChatInputCommand()) {
                const command = this.explorer.commands.get(interaction.commandName);
                if (!command) return;
                if (command.homeGuildOnly && !this.discord.isHome(interaction.guildId)) {
                    await interaction.reply({ content: '❌ คำสั่งนี้ใช้ได้เฉพาะในเซิร์ฟเวอร์ NotStack', flags: MessageFlags.Ephemeral });
                    return;
                }
                // บันทึกการใช้คำสั่งลง Activity Log (ใช้ดูว่าใครใช้บอทบ่อยแค่ไหนในหน้า Dashboard)
                this.logs.recordActivity(interaction.guildId, 'commandUsed', {
                    title: '⌨️ ใช้คำสั่งบอท',
                    context: {
                        userId: interaction.user.id,
                        isBot: interaction.user.bot,
                        channelId: interaction.channelId,
                        parentId: interaction.channel && 'parentId' in interaction.channel ? interaction.channel.parentId : null,
                        member: interaction.inCachedGuild() ? interaction.member : null,
                    },
                    record: {
                        user: interaction.user,
                        channelName: interaction.channel && 'name' in interaction.channel ? interaction.channel.name : null,
                        metadata: { command: interaction.commandName },
                    },
                    description: `${interaction.user.username} ใช้คำสั่ง /${interaction.commandName}`,
                });
                await command.handler.execute(interaction);
                return;
            }

            if (interaction.isStringSelectMenu() || interaction.isModalSubmit() || interaction.isButton()) {
                for (const command of this.explorer.commands.values()) {
                    if (command.homeGuildOnly && !this.discord.isHome(interaction.guildId)) continue;
                    if (command.handler.handleComponent) await command.handler.handleComponent(interaction);
                }
            }
        } catch (err) {
            this.logger.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
            if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ มีบางอย่างผิดพลาด', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    }
}
