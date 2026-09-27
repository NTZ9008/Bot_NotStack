import { Injectable } from '@nestjs/common';
import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { SlashCommand } from '../../discord/decorators/slash-command.decorator';
import type { SlashCommandHandler } from '../../discord/interfaces/slash-command.interface';

// ==========================================
// คำสั่งทั่วไปที่ตอบกลับทันที (ไม่ต้องใช้ข้อมูลจากโมดูลอื่น)
// ==========================================
// /ping — ทดสอบการตอบสนองของบอท
@SlashCommand()
@Injectable()
export class PingCommand implements SlashCommandHandler {
    static readonly data = new SlashCommandBuilder().setName('ping').setDescription('ทดสอบการตอบสนองของบอท');

    async execute(interaction: ChatInputCommandInteraction) {
        const response = await interaction.reply({ content: 'Pinging...', withResponse: true });
        const sent = response.resource?.message;
        const roundTrip = sent ? sent.createdTimestamp - interaction.createdTimestamp : 0;
        const apiLatency = Math.round(interaction.client.ws.ping);
        await interaction.editReply(`⏱️ Round-trip: ${roundTrip} ms\n💓 API: ${apiLatency} ms`);
    }
}
