import { Injectable, Logger } from '@nestjs/common';
import { AttachmentBuilder, MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { SlashCommand } from '../../discord/decorators/slash-command.decorator';
import type { SlashCommandHandler } from '../../discord/interfaces/slash-command.interface';
import { RankCardService } from '../../rank/rank-card.service';

// /rank — การ์ดรูปภาพ Level / XP / อันดับ ของตัวเองหรือสมาชิกคนอื่น (หน้าตาตามธีมของเซิร์ฟเวอร์ + ที่เจ้าของการ์ดแต่งเอง)
// ตารางอันดับย้ายไปที่ /leaderboard
@SlashCommand()
@Injectable()
export class RankCommand implements SlashCommandHandler {
    static readonly data = new SlashCommandBuilder()
        .setName('rank')
        .setDescription('ดูการ์ด Level และอันดับของคุณหรือสมาชิกคนอื่น')
        .addUserOption((option) => option.setName('target').setDescription('สมาชิกที่คุณต้องการดู (เว้นว่างไว้เพื่อดูของตัวเอง)').setRequired(false));

    private readonly logger = new Logger('Rank');

    constructor(private readonly cards: RankCardService) {}

    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.inCachedGuild()) return interaction.reply({ content: 'ใช้คำสั่งนี้ได้ในเซิร์ฟเวอร์เท่านั้น', flags: MessageFlags.Ephemeral });
        const target = interaction.options.getUser('target') || interaction.user;
        // ถ้าเป็นบอทจะไม่มี Level
        if (target.bot) return interaction.reply({ content: '🤖 บอทไม่มีเลเวลนะคร้าบ!', flags: MessageFlags.Ephemeral });

        // วาดรูป + ดึง avatar ใช้เวลาเกิน 3 วินาทีที่ Discord รอคำตอบแรกได้
        await interaction.deferReply();
        try {
            const member = interaction.options.getMember('target') ?? (target.id === interaction.user.id ? interaction.member : null);
            const { image, data } = await this.cards.renderRank(interaction.guildId, target, member);
            const content = data.rank ? undefined : `🤷 **${data.displayName}** ยังไม่มี XP ในเซิร์ฟเวอร์นี้ — พิมพ์แชทหรือเข้าห้องเสียงเพื่อเริ่มสะสม!`;
            return interaction.editReply({ content, files: [new AttachmentBuilder(image, { name: 'rank.png' })], allowedMentions: { parse: [] } });
        } catch (err) {
            this.logger.error(`/rank ${target.id}: ${err instanceof Error ? err.stack : String(err)}`);
            return interaction.editReply({ content: '❌ สร้างการ์ดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' });
        }
    }
}
