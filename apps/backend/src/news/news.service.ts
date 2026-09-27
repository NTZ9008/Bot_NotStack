import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { HEX_COLOR_RE, isHttpUrl, NEWS_DEFAULT_FOOTER, NEWS_LIMITS, NEWS_PRESETS } from '@notstack/shared';
import { EmbedBuilder } from 'discord.js';
import { BotConfigService } from '../bot-config/bot-config.service';
import { ApiException, badRequest } from '../common/exceptions/api.exception';
import { DiscordService } from '../discord/discord.service';
import type { SendNewsDto } from './dto/send-news.dto';

// ==========================================
// 📰 NEWS — ส่งประกาศเป็น embed เข้าห้อง NEWS_CHANNEL_ID ของเซิร์ฟเวอร์
// ==========================================
@Injectable()
export class NewsService {
    private readonly logger = new Logger('News');

    constructor(
        private readonly discord: DiscordService,
        private readonly config: BotConfigService,
    ) {}

    async send(guildId: string, body: SendNewsDto): Promise<void> {
        const newsChannelId = await this.config.get(guildId, 'NEWS_CHANNEL_ID');
        if (!newsChannelId) throw badRequest('ยังไม่ได้เลือกห้องประกาศข่าวสารในหน้า Configuration');

        this.discord.requireReady();
        const channel = await this.discord.fetchGuildChannel(guildId, newsChannelId);
        if (!channel || !channel.isSendable()) {
            throw new ApiException(HttpStatus.NOT_FOUND, 'หาห้องดิสคอร์ดปลายทางไม่พบ กรุณาเช็คห้องประกาศในหน้า Configuration อีกครั้ง');
        }

        const preset = NEWS_PRESETS[body.type];
        const embed = new EmbedBuilder()
            .setColor((HEX_COLOR_RE.test(body.color ?? '') ? body.color : preset.color) as `#${string}`)
            .setTitle(`${preset.prefix} ${body.title}`)
            .setDescription(body.content)
            .setFooter({ text: String(body.footer || NEWS_DEFAULT_FOOTER).slice(0, NEWS_LIMITS.footer) })
            .setTimestamp();
        if (isHttpUrl(body.imageUrl)) embed.setImage(body.imageUrl);

        try {
            await channel.send({ embeds: [embed] });
        } catch (err) {
            this.logger.error(`Error sending news: ${(err as Error).message}`);
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, (err as Error).message);
        }
    }
}
