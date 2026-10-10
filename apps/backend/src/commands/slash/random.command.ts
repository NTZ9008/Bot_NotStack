import { Injectable } from '@nestjs/common';
import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { SlashCommand } from '../../discord/decorators/slash-command.decorator';
import type { SlashCommandHandler } from '../../discord/interfaces/slash-command.interface';

// /random — สุ่มจากรายการที่พิมพ์มา
@SlashCommand()
@Injectable()
export class RandomCommand implements SlashCommandHandler {
    static readonly data = new SlashCommandBuilder()
        .setName('random')
        .setDescription('สุ่มเลือก 1 อย่างจากรายการที่พิมพ์มา')
        .addStringOption((option) =>
            option.setName('items').setDescription('พิมพ์สิ่งที่ต้องการสุ่ม คั่นด้วยจุลภาค เช่น A,B,C').setRequired(true).setMaxLength(1500),
        );

    async execute(interaction: ChatInputCommandInteraction) {
        const items = interaction.options
            .getString('items', true)
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
        if (items.length < 2) {
            return interaction.reply({ content: '⚠️ ต้องมีอย่างน้อย 2 ตัวเลือก เช่น `/random items: A,B,C`', flags: MessageFlags.Ephemeral });
        }
        await interaction.reply('🎡 กำลังหมุนวงล้อ...');
        await new Promise((resolve) => setTimeout(resolve, 2500));
        const winner = items[Math.floor(Math.random() * items.length)];
        // ตัวเลือกมาจากผู้ใช้ — ห้ามแท็กใคร
        await interaction.editReply({ content: `🎯 ผลลัพธ์คือ... **${winner}!** 🎉`, allowedMentions: { parse: [] } });
    }
}
