import { Injectable } from '@nestjs/common';
import { EmbedBuilder, MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { SlashCommand } from '../../discord/decorators/slash-command.decorator';
import type { SlashCommandHandler } from '../../discord/interfaces/slash-command.interface';
import { GrafanaService } from '../../grafana/grafana.service';

@SlashCommand()
@Injectable()
export class GrafanaCommand implements SlashCommandHandler {
    static readonly data = new SlashCommandBuilder().setName('grafana').setDescription('ตรวจสอบสถานะ Grafana');

    constructor(private readonly grafana: GrafanaService) {}

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
            const health = await this.grafana.getHealth();
            const embed = new EmbedBuilder().setColor(0x2f9e44).setTitle('🟢 Grafana is healthy').addFields(
                { name: 'Status', value: health.status, inline: true },
                ...(health.version ? [{ name: 'Version', value: health.version, inline: true }] : []),
                ...(health.commit ? [{ name: 'Commit', value: health.commit, inline: true }] : []),
            );
            await interaction.editReply({ embeds: [embed] });
        } catch {
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xe03131).setTitle('🔴 Grafana is unavailable').setDescription('ตรวจสอบการเชื่อมต่อหรือการตั้งค่า Grafana API แล้วลองอีกครั้ง')] });
        }
    }
}
