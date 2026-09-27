import { Injectable } from '@nestjs/common';
import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { SlashCommand } from '../../discord/decorators/slash-command.decorator';
import type { SlashCommandHandler } from '../../discord/interfaces/slash-command.interface';
import { OpenWeatherClient } from '../../weather/clients/openweather.client';

// /weather — อากาศตอนนี้ของเมืองที่ต้องการ (OpenWeatherMap)
@SlashCommand()
@Injectable()
export class WeatherCommand implements SlashCommandHandler {
    static readonly data = new SlashCommandBuilder()
        .setName('weather')
        .setDescription('ดูสภาพอากาศของเมืองที่ต้องการ')
        .addStringOption((option) => option.setName('city').setDescription('ชื่อเมือง').setRequired(true));

    constructor(private readonly weather: OpenWeatherClient) {}

    async execute(interaction: ChatInputCommandInteraction) {
        const city = interaction.options.getString('city', true);
        await interaction.deferReply();
        const embed = await this.weather.cityEmbed(city);
        if (!embed) return interaction.editReply(`❌ ไม่พบข้อมูลเมือง **${city}**`);
        await interaction.editReply({ embeds: [embed] });
    }
}
