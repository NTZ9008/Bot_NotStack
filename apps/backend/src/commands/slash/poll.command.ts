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

// ==========================================
// /poll — โพลแบบไม่แสดงชื่อผู้โหวต (เปิดรับโหวต 60 วินาที แล้วประกาศผล)
// ==========================================
// /poll — โพลแบบไม่แสดงชื่อผู้โหวต (เปิดรับโหวต 60 วินาที แล้วประกาศผล)
@SlashCommand()
@Injectable()
export class PollCommand implements SlashCommandHandler {
    static readonly data = new SlashCommandBuilder()
        .setName('poll')
        .setDescription('สร้างโพลแบบไม่แสดงชื่อผู้โหวต')
        .addStringOption((option) => option.setName('question').setDescription('คำถามสำหรับโพล').setRequired(true))
        .addStringOption((option) => option.setName('choices').setDescription('ตัวเลือกคั่นด้วยจุลภาค เช่น A,B,C').setRequired(true));

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
            .setFooter({ text: `สร้างโดย ${interaction.user.username}` })
            .setTimestamp();
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            choices.map((_, i) => new ButtonBuilder().setCustomId(`poll_${i}`).setLabel(`${i + 1}`).setStyle(ButtonStyle.Primary)),
        );
        const response = await interaction.reply({ embeds: [embed], components: [row], withResponse: true });
        const message = response.resource?.message;
        if (!message) return;

        // เก็บผลโหวตไว้ใน memory (แค่ชั่วคราว)
        const votes = new Array<number>(choices.length).fill(0);
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: (i) => i.customId.startsWith('poll_'),
            time: 60000,
        });
        collector.on('collect', async (i) => {
            const index = Number.parseInt(i.customId.split('_')[1] ?? '', 10);
            if (!Number.isInteger(index) || index < 0 || index >= votes.length) return;
            votes[index]!++;
            await i.reply({ content: `✅ คุณโหวต "${choices[index]}" แล้ว`, flags: ephemeral }).catch(() => {});
        });
        collector.on('end', async () => {
            const results = choices.map((choice, i) => `**${choice}** — ${votes[i]} โหวต`).join('\n');
            await interaction
                .followUp({ embeds: [new EmbedBuilder().setTitle(`📊 ผลโหวต: ${question}`).setDescription(results).setColor(0x00ff7f)] })
                .catch(() => {});
        });
    }
}
