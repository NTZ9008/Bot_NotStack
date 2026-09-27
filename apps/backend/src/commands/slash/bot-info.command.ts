import os from 'node:os';
import { Injectable } from '@nestjs/common';
import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { APP_VERSION } from '../../config/paths';
import { SlashCommand } from '../../discord/decorators/slash-command.decorator';
import type { SlashCommandHandler } from '../../discord/interfaces/slash-command.interface';

// /botinfo — ข้อมูลและสถานะของบอท (จำนวนเซิร์ฟเวอร์ / ผู้ใช้ / สเปกเครื่อง)
@SlashCommand()
@Injectable()
export class BotInfoCommand implements SlashCommandHandler {
    static readonly data = new SlashCommandBuilder().setName('botinfo').setDescription('แสดงข้อมูลของบอทและสถานะเซิร์ฟเวอร์');

    async execute(interaction: ChatInputCommandInteraction) {
        const { client } = interaction;
        const totalUsers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
        const totalGuilds = client.guilds.cache.size;

        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);

        // RAM (MB), CPU, OS ของเครื่องที่รันบอท
        const totalMem = Math.round(os.totalmem() / 1024 / 1024);
        const usedMem = totalMem - Math.round(os.freemem() / 1024 / 1024);
        const memPercentage = Math.floor((usedMem / totalMem) * 100);
        const cpus = os.cpus();
        const cpuModel = cpus[0]?.model ?? 'Unknown CPU';

        const embed = new EmbedBuilder()
            .setTitle('🤖 ข้อมูลและสถานะของบอท')
            .setColor(0x00ae86)
            .setThumbnail(client.user.displayAvatarURL())
            .addFields(
                { name: '🏷️ BotName', value: client.user.tag, inline: true },
                { name: '🛠️ Version', value: APP_VERSION, inline: true },
                { name: '⏱️ Startup', value: `${hours} ชม. ${minutes} น. ${seconds} วินาที`, inline: true },
                { name: '🏘️ เซิร์ฟเวอร์', value: `${totalGuilds} Guilds`, inline: true },
                { name: '👥 ผู้ใช้งาน', value: `${totalUsers} Users`, inline: true },
                { name: '🟢 ปิง (Ping)', value: `${client.ws.ping} ms`, inline: true },
                {
                    name: "🖥️ Server Specs (Arlifzs's Server)",
                    value: `\`\`\`yml
OS:    ${os.type()} (${os.arch()})
CPU:   ${cpuModel}
Cores: ${cpus.length} Core(s)
RAM:   ${usedMem}MB / ${totalMem}MB (${memPercentage}%)
Node:  ${process.version}
\`\`\``,
                    inline: false,
                },
            )
            .setFooter({ text: 'พัฒนาด้วย AT Tech | รันบน Oracle Cloud Always Free' });

        await interaction.reply({ embeds: [embed] });
    }
}
