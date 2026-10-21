import { Injectable } from '@nestjs/common';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    EmbedBuilder,
    MessageFlags,
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
} from 'discord.js';
import { SlashCommand } from '../../discord/decorators/slash-command.decorator';
import type { SlashCommandHandler } from '../../discord/interfaces/slash-command.interface';

const ephemeral = MessageFlags.Ephemeral;
const POLL_DURATION_MS = 60000;

// ==========================================
// /poll — โพลแบบไม่แสดงชื่อผู้โหวต (เปิดรับโหวต 60 วินาที แล้วประกาศผล)
// 1 คน = 1 โหวต (กดตัวเลือกอื่นเพื่อเปลี่ยนได้) — เก็บผลไว้ใน memory เท่านั้น
// ==========================================
@SlashCommand()
@Injectable()
export class PollCommand implements SlashCommandHandler {
    static readonly data = new SlashCommandBuilder()
        .setName('poll')
        .setDescription('สร้างโพลแบบไม่แสดงชื่อผู้โหวต')
        // ชื่อ embed ยาวได้ 256 ตัว — เผื่อคำนำหน้า "📊 ผลโหวต: "
        .addStringOption((option) => option.setName('question').setDescription('คำถามสำหรับโพล').setRequired(true).setMaxLength(200))
        .addStringOption((option) =>
            option.setName('choices').setDescription('ตัวเลือกคั่นด้วยจุลภาค เช่น A,B,C').setRequired(true).setMaxLength(1000),
        );

    async execute(interaction: ChatInputCommandInteraction) {
        const question = interaction.options.getString('question', true);
        const choices = interaction.options
            .getString('choices', true)
            .split(',')
            .map((choice) => choice.trim())
            .filter(Boolean);
        if (choices.length < 2 || choices.length > 5) {
            return interaction.reply({ content: '❌ ต้องมีอย่างน้อย 2 ตัวเลือก และไม่เกิน 5 ตัวเลือก', flags: ephemeral });
        }

        const embed = new EmbedBuilder()
            .setTitle(`📊 ${question}`)
            .setDescription(choices.map((choice, i) => `**${i + 1}.** ${choice}`).join('\n'))
            .setColor(0x00bfff)
            .setFooter({ text: `สร้างโดย ${interaction.user.username} • ปิดโหวต` })
            .setTimestamp(Date.now() + POLL_DURATION_MS);
        const buttons = (disabled: boolean) =>
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                choices.map((_, i) =>
                    new ButtonBuilder()
                        .setCustomId(`poll_${i}`)
                        .setLabel(`${i + 1}`)
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(disabled),
                ),
            );
        const response = await interaction.reply({ embeds: [embed], components: [buttons(false)], withResponse: true });
        const message = response.resource?.message;
        if (!message) return;

        // userId → ตัวเลือกที่โหวต (กดใหม่ = เปลี่ยนโหวต ไม่นับซ้ำ)
        const votes = new Map<string, number>();
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: (i) => i.customId.startsWith('poll_'),
            time: POLL_DURATION_MS,
        });
        collector.on('collect', async (i) => {
            const index = Number.parseInt(i.customId.split('_')[1] ?? '', 10);
            if (!Number.isInteger(index) || index < 0 || index >= choices.length) return;
            const previous = votes.get(i.user.id);
            votes.set(i.user.id, index);
            const content =
                previous === undefined
                    ? `✅ คุณโหวต "${choices[index]}" แล้ว`
                    : previous === index
                      ? `ℹ️ คุณโหวต "${choices[index]}" ไว้แล้ว`
                      : `🔄 เปลี่ยนโหวตจาก "${choices[previous]}" เป็น "${choices[index]}" แล้ว`;
            await i.reply({ content, flags: ephemeral, allowedMentions: { parse: [] } }).catch(() => {});
        });
        collector.on('end', async () => {
            const counts = new Array<number>(choices.length).fill(0);
            for (const index of votes.values()) counts[index]!++;
            const results = choices.map((choice, i) => `**${choice}** — ${counts[i]} โหวต`).join('\n');
            // ปิดปุ่มของโพลที่หมดเวลาแล้ว (กดต่อจะได้ไม่ขึ้น "interaction failed")
            await interaction.editReply({ components: [buttons(true)] }).catch(() => {});
            await interaction
                .followUp({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(`📊 ผลโหวต: ${question}`)
                            .setDescription(results)
                            .setFooter({ text: `ผู้โหวตทั้งหมด ${votes.size} คน` })
                            .setColor(0x00ff7f),
                    ],
                })
                .catch(() => {});
        });
    }
}
