import { Injectable } from '@nestjs/common';
import { EmbedBuilder, MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { SlashCommand } from '../../discord/decorators/slash-command.decorator';
import type { SlashCommandHandler } from '../../discord/interfaces/slash-command.interface';

// /userinfo — ข้อมูลของสมาชิก
@SlashCommand()
@Injectable()
export class UserInfoCommand implements SlashCommandHandler {
    static readonly data = new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('แสดงข้อมูลของผู้ใช้')
        .addUserOption((option) => option.setName('target').setDescription('เลือกผู้ใช้ (ถ้าไม่ใส่จะแสดงของตัวเอง)').setRequired(false));

    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.guild) return interaction.reply({ content: 'ใช้คำสั่งนี้ได้ในเซิร์ฟเวอร์เท่านั้น', flags: MessageFlags.Ephemeral });
        const user = interaction.options.getUser('target') || interaction.user;
        const member = await interaction.guild.members.fetch(user.id);

        const embed = new EmbedBuilder()
            .setColor('#00b0f4')
            .setThumbnail(user.displayAvatarURL({ size: 1024 }))
            .setTitle(`ข้อมูลผู้ใช้: ${user.tag}`)
            .addFields(
                { name: '🆔 User ID', value: user.id, inline: true },
                { name: '📅 สร้างบัญชี', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`, inline: true },
                { name: '📥 เข้าร่วมเซิร์ฟเวอร์', value: `<t:${Math.floor((member.joinedTimestamp ?? 0) / 1000)}:F>`, inline: false },
                {
                    name: '🎭 Roles',
                    value:
                        member.roles.cache
                            .filter((r) => r.id !== interaction.guild!.id)
                            .map((r) => r.toString())
                            .join(', ') || 'ไม่มี',
                    inline: false,
                },
            )
            .setFooter({ text: `Requested by ${interaction.user.tag}` })
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }
}
