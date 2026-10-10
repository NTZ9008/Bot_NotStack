import { Injectable } from '@nestjs/common';
import { xpAtLevel, xpForNextLevel } from '@notstack/shared';
import { EmbedBuilder, MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { SlashCommand } from '../../discord/decorators/slash-command.decorator';
import type { SlashCommandHandler } from '../../discord/interfaces/slash-command.interface';
import { LevelsService } from '../../levels/levels.service';

// /rank — Level & XP ของตัวเอง/คนอื่น หรือ Top 10 ของเซิร์ฟเวอร์นี้
@SlashCommand()
@Injectable()
export class RankCommand implements SlashCommandHandler {
    static readonly data = new SlashCommandBuilder()
        .setName('rank')
        .setDescription('ดูข้อมูล Level และ Rank ของคุณหรือสมาชิกคนอื่น')
        .addUserOption((option) => option.setName('target').setDescription('สมาชิกที่คุณต้องการดู (เว้นว่างไว้เพื่อดูของตัวเอง)').setRequired(false))
        .addBooleanOption((option) => option.setName('leaderboard').setDescription('ดูตารางจัดอันดับ (Top 10 ของเซิร์ฟเวอร์)').setRequired(false));

    constructor(private readonly levels: LevelsService) {}

    async execute(interaction: ChatInputCommandInteraction) {
        const target = interaction.options.getUser('target') || interaction.user;
        // ถ้าเป็นบอทจะไม่มี Level
        if (target.bot) return interaction.reply({ content: '🤖 บอทไม่มีเลเวลนะคร้าบ!', flags: MessageFlags.Ephemeral });

        if (!interaction.guildId) return interaction.reply({ content: 'ใช้คำสั่งนี้ได้ในเซิร์ฟเวอร์เท่านั้น', flags: MessageFlags.Ephemeral });
        await interaction.deferReply();
        if (interaction.options.getBoolean('leaderboard')) {
            const { items: top } = await this.levels.list(interaction.guildId, { page: 1, pageSize: 10 });
            if (top.length === 0) return interaction.editReply({ content: '📉 ยังไม่มีใครมี XP ในเซิร์ฟเวอร์เลยครับ' });
            const lines = top.map((stats, i) => {
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `\`#${i + 1}\``;
                return `${medal} <@${stats.userId}> — **Lvl ${stats.level}** (${stats.xp} XP)`;
            });
            const embed = new EmbedBuilder()
                .setColor(0xffd700)
                .setTitle('🏆 Leaderboard (Top 10)')
                .setThumbnail(interaction.guild?.iconURL() ?? null)
                .setDescription(lines.join('\n'))
                .setFooter({ text: 'พิมพ์แชทหรือเข้าห้องเสียงบ่อยๆ เพื่อไต่อันดับนะ!' })
                .setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        }

        // รายบุคคล
        const result = await this.levels.list(interaction.guildId, { page: 1, pageSize: 1, userId: target.id });
        const userData = result.items[0];
        if (!userData) {
            return interaction.editReply({
                content: `🤷‍♂️ ${target.username} ยังไม่มีประวัติการแชทเลยครับ พิมพ์อะไรสักหน่อยเพื่อให้ได้ XP สิ!`,
            });
        }

        const { xp, level } = userData;
        const nextLevelXp = xpForNextLevel(level, result.settings);
        const rank = userData.rank;
        // ฐานของเลเวลปัจจุบันคือ XP ที่ใช้อัปเลเวลที่แล้ว (เลเวล 0 คือ 0)
        const prevLevelXp = xpAtLevel(level, result.settings);
        const percent = Math.max(0, Math.min(100, Math.floor(((xp - prevLevelXp) / (nextLevelXp - prevLevelXp)) * 100)));
        const barLength = 15;
        const filled = Math.floor((percent / 100) * barLength);
        const progressBar = '🟩'.repeat(filled) + '⬛'.repeat(barLength - filled);

        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setAuthor({ name: target.tag, iconURL: target.displayAvatarURL() })
            .setTitle('🏆 สถิติ Level & XP')
            .addFields(
                { name: '🥇 ลำดับ (Rank)', value: `#${rank}`, inline: true },
                { name: '📈 เลเวล (Level)', value: `${level}`, inline: true },
                { name: '✨ ประสบการณ์ (XP)', value: `${xp} XP`, inline: true },
                { name: `ความคืบหน้า (${percent}%)`, value: `${progressBar} [${xp}/${nextLevelXp}]` },
            )
            .setFooter({ text: 'พิมพ์แชทบ่อยๆ เพื่อให้ Level ขึ้นนะ!' })
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    }
}
