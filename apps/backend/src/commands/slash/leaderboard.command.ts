import { Injectable, Logger } from '@nestjs/common';
import {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
} from 'discord.js';
import { SlashCommand } from '../../discord/decorators/slash-command.decorator';
import type { ComponentInteraction, SlashCommandHandler } from '../../discord/interfaces/slash-command.interface';
import { RankCardService } from '../../rank/rank-card.service';

const PAGE_PREFIX = 'leaderboard:page:';
// กดเปลี่ยนหน้าได้คนละครั้งต่อ 3 วินาที (ทุกครั้งต้องวาดรูปใหม่ + โหลด avatar 10 คน)
const COOLDOWN_MS = 3000;

// ปุ่ม ◀ / หน้า x/y / ▶ — customId เก็บหน้าปลายทางไว้ ไม่ต้องจำสถานะใน memory (ปุ่มยังใช้ได้หลังบอทรีสตาร์ท)
export function leaderboardButtons(page: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`${PAGE_PREFIX}${page - 1}`)
            .setEmoji('◀️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 1),
        new ButtonBuilder().setCustomId('leaderboard:current').setLabel(`หน้า ${page}/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`${PAGE_PREFIX}${page + 1}`)
            .setEmoji('▶️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages),
    );
}

// /leaderboard — ตารางอันดับ XP ของเซิร์ฟเวอร์เป็นรูปภาพ (หน้าละ 10 คน) พร้อมปุ่มเลื่อนหน้า
@SlashCommand()
@Injectable()
export class LeaderboardCommand implements SlashCommandHandler {
    static readonly data = new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('ตารางอันดับ XP ของเซิร์ฟเวอร์')
        .addIntegerOption((option) => option.setName('page').setDescription('หน้าที่ต้องการดู (หน้าละ 10 คน)').setMinValue(1).setMaxValue(10000));

    private readonly logger = new Logger('Leaderboard');
    private readonly lastClick = new Map<string, number>();

    constructor(private readonly cards: RankCardService) {}

    private async payload(guildId: string, page: number) {
        const result = await this.cards.renderLeaderboard(guildId, page);
        return {
            files: [new AttachmentBuilder(result.image, { name: 'leaderboard.png' })],
            components: result.total ? [leaderboardButtons(result.page, result.totalPages)] : [],
        };
    }

    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.inCachedGuild()) return interaction.reply({ content: 'ใช้คำสั่งนี้ได้ในเซิร์ฟเวอร์เท่านั้น', flags: MessageFlags.Ephemeral });
        await interaction.deferReply();
        try {
            return interaction.editReply(await this.payload(interaction.guildId, interaction.options.getInteger('page') ?? 1));
        } catch (err) {
            this.logger.error(`/leaderboard: ${err instanceof Error ? err.stack : String(err)}`);
            return interaction.editReply({ content: '❌ สร้างตารางอันดับไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' });
        }
    }

    async handleComponent(interaction: ComponentInteraction) {
        if (!interaction.isButton() || !interaction.customId.startsWith(PAGE_PREFIX) || !interaction.inCachedGuild()) return;
        const page = Number.parseInt(interaction.customId.slice(PAGE_PREFIX.length), 10);
        if (!Number.isInteger(page) || page < 1) return;

        const now = Date.now();
        const readyAt = (this.lastClick.get(interaction.user.id) ?? 0) + COOLDOWN_MS;
        if (now < readyAt) return interaction.reply({ content: '⏳ ใจเย็นๆ นะ ลองกดใหม่อีกแป๊บ', flags: MessageFlags.Ephemeral });
        this.lastClick.set(interaction.user.id, now);
        if (this.lastClick.size > 1000) for (const [id, at] of this.lastClick) if (now - at >= COOLDOWN_MS) this.lastClick.delete(id);

        await interaction.deferUpdate();
        try {
            // แทนรูปเดิมด้วยรูปหน้าใหม่ (attachments: [] = ลบไฟล์แนบเดิม)
            await interaction.editReply({ ...(await this.payload(interaction.guildId, page)), attachments: [] });
        } catch (err) {
            this.logger.error(`/leaderboard page ${page}: ${err instanceof Error ? err.stack : String(err)}`);
            await interaction.followUp({ content: '❌ เปลี่ยนหน้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    }
}
