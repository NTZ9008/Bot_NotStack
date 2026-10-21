import { Injectable } from '@nestjs/common';
import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { SlashCommand } from '../../discord/decorators/slash-command.decorator';
import { DiscordExplorer } from '../../discord/discord.explorer';
import { DiscordService } from '../../discord/discord.service';
import type { SlashCommandHandler } from '../../discord/interfaces/slash-command.interface';

// /gethelp — รายการคำสั่งที่ใช้ได้ในเซิร์ฟเวอร์นี้ (สร้างจากคำสั่งที่ลงทะเบียนจริง ไม่ต้องแก้มือเมื่อเพิ่มคำสั่งใหม่)
@SlashCommand()
@Injectable()
export class HelpCommand implements SlashCommandHandler {
    static readonly data = new SlashCommandBuilder().setName('gethelp').setDescription('ดูรายการคำสั่งทั้งหมดของบอท');

    constructor(
        private readonly explorer: DiscordExplorer,
        private readonly discord: DiscordService,
    ) {}

    async execute(interaction: ChatInputCommandInteraction) {
        const home = this.discord.isHome(interaction.guildId);
        const commands = [...this.explorer.commands.values()]
            .filter((command) => home || !command.homeGuildOnly)
            .map((command) => command.data.toJSON())
            .sort((a, b) => a.name.localeCompare(b.name));
        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('📌 Help Me!')
            .setDescription('คำสั่งของบอทที่ใช้ได้ในเซิร์ฟเวอร์นี้')
            .addFields(commands.slice(0, 25).map((command) => ({ name: `/${command.name}`, value: command.description || '-' })))
            .setFooter({ text: `Requested by ${interaction.user.username}` })
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }
}
