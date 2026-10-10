import { Injectable, Logger } from '@nestjs/common';
import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { SlashCommand } from '../../discord/decorators/slash-command.decorator';
import type { SlashCommandHandler } from '../../discord/interfaces/slash-command.interface';
import { WeatherException } from '../../weather/exceptions/weather.exception';
import { toMessagePayload } from '../../weather/report/weather-report.builder';
import { WeatherService } from '../../weather/weather.service';

// /weather — รายงานสภาพอากาศแบบเดียวกับรายงานประจำวันของเซิร์ฟเวอร์ (ช่องข้อมูล / กราฟ / เรดาร์ ตามที่ตั้งไว้ในหน้า Weather)
// ไม่ระบุสถานที่ = สถานที่ของรายงานประจำวัน

// ต่อคน (ทุกเซิร์ฟเวอร์รวมกัน) นับตั้งแต่สั่ง ไม่ว่าผลจะเป็นอย่างไร — สถานที่ใหม่ต้องวาด GIF เรดาร์ใหม่ (กิน CPU หลายวินาที)
// และทุกครั้งยิง OpenWeatherMap ซึ่ง key ฟรีมีโควตาต่อนาที
const COOLDOWN_MS = 30 * 1000;

@SlashCommand()
@Injectable()
export class WeatherCommand implements SlashCommandHandler {
    static readonly data = new SlashCommandBuilder()
        .setName('weather')
        .setDescription('ดูรายงานสภาพอากาศ พร้อมกราฟพยากรณ์และเรดาร์ฝน')
        .addStringOption((option) =>
            option.setName('city').setDescription('ชื่อเมือง/สถานที่ หรือพิกัด (เว้นว่าง = สถานที่ในรายงานประจำวันของเซิร์ฟเวอร์)').setMaxLength(100),
        );

    private readonly logger = new Logger('Weather');
    // userId → เวลาที่สั่งครั้งล่าสุด
    private readonly lastUsed = new Map<string, number>();

    constructor(private readonly weather: WeatherService) {}

    async execute(interaction: ChatInputCommandInteraction) {
        const now = Date.now();
        const readyAt = (this.lastUsed.get(interaction.user.id) ?? 0) + COOLDOWN_MS;
        if (now < readyAt) {
            return interaction.reply({ content: `⏳ ใช้ /weather ได้อีกครั้ง <t:${Math.ceil(readyAt / 1000)}:R>`, flags: MessageFlags.Ephemeral });
        }
        this.lastUsed.set(interaction.user.id, now);
        if (this.lastUsed.size > 1000) {
            for (const [id, at] of this.lastUsed) if (now - at >= COOLDOWN_MS) this.lastUsed.delete(id);
        }

        const city = interaction.options.getString('city')?.trim() || null;
        // วาดกราฟ + เรดาร์ใช้เวลาหลายวินาที เกิน 3 วินาทีที่ Discord รอคำตอบแรก
        await interaction.deferReply();
        try {
            const report = await this.weather.commandReport(interaction.guildId, city);
            if (!report) return interaction.editReply({ content: `❌ ไม่พบสถานที่ **${city}**`, allowedMentions: { parse: [] } });
            const { embeds, files } = toMessagePayload(report);
            await interaction.editReply({ embeds, files });
        } catch (err) {
            // error จาก OpenWeatherMap มีข้อความภาษาไทยที่อ่านเข้าใจได้อยู่แล้ว
            if (!(err instanceof WeatherException)) this.logger.error(`/weather ${city ?? ''}: ${err instanceof Error ? err.stack : String(err)}`);
            const message = err instanceof WeatherException ? err.message : 'ดึงข้อมูลสภาพอากาศไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
            await interaction.editReply({ content: `❌ ${message}`, embeds: [], files: [] });
        }
    }
}
