import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { SuccessResponse } from '@notstack/shared';
import { Audit } from '../common/decorators/audit.decorator';
import { GuildId } from '../guilds/decorators/guild-id.decorator';
import { GuildRoute } from '../guilds/decorators/guild-route.decorator';
import { SendNewsDto } from './dto/send-news.dto';
import { NewsService } from './news.service';

// POST /api/guilds/:guildId/news — ส่งประกาศข่าว
@GuildRoute()
@Controller('guilds/:guildId/news')
export class NewsController {
    constructor(private readonly news: NewsService) {}

    @Audit('news.send')
    @Post()
    @HttpCode(HttpStatus.OK)
    async send(@GuildId() guildId: string, @Body() body: SendNewsDto): Promise<SuccessResponse> {
        await this.news.send(guildId, body);
        return { success: true, message: 'ส่งข่าวสารสำเร็จ' };
    }
}
