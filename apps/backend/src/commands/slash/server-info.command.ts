import { Injectable } from '@nestjs/common';
import { EmbedBuilder, MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { DiscordService } from '../../discord/discord.service';
import { SlashCommand } from '../../discord/decorators/slash-command.decorator';
import type { SlashCommandHandler } from '../../discord/interfaces/slash-command.interface';

// /serverinfo — ข้อมูลของเซิร์ฟเวอร์ที่ใช้คำสั่ง (ชื่อ / วันที่สร้าง / เจ้าของ / จำนวนสมาชิก)
// เซิร์ฟเวอร์หลักมีคำอธิบายวัตถุประสงค์ของ NotStack ต่อท้ายเหมือนเดิม
@SlashCommand()
@Injectable()
export class ServerInfoCommand implements SlashCommandHandler {
    static readonly data = new SlashCommandBuilder().setName('serverinfo').setDescription('คำสั่งใช้เพื่อดูข้อมูลserver');

    constructor(private readonly discord: DiscordService) {}

    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.guild) return interaction.reply({ content: 'ใช้คำสั่งนี้ได้ในเซิร์ฟเวอร์เท่านั้น', flags: MessageFlags.Ephemeral });
        const guild = interaction.guild;
        const createdAt = Math.floor(guild.createdTimestamp / 1000);
        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('Server Info')
            .setDescription('นี่คือข้อมูลของServer')
            .setThumbnail(guild.iconURL({ size: 256 }))
            .addFields(
                { name: '🛜 Name', value: guild.name, inline: true },
                { name: '🗓️ Created on', value: `<t:${createdAt}:D>`, inline: true },
                ...(this.discord.isHome(guild.id) ? [{ name: '💻 objective', value: 'Tutoring - Chatting - Playing Games - Asking Questions' }] : []),
                { name: '👤 creator', value: `<@${guild.ownerId}>`, inline: true },
                { name: '👥 total number of members', value: `${guild.memberCount}`, inline: true },
            )
            .setFooter({ text: `Requested by ${interaction.user.username}` })
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }
}
