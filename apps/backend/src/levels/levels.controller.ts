import { Controller, Get } from '@nestjs/common';
import type { LevelRow } from '@notstack/shared';
import { GuildId } from '../guilds/decorators/guild-id.decorator';
import { GuildRoute } from '../guilds/decorators/guild-route.decorator';
import { LevelsService } from './levels.service';

// อันดับของเซิร์ฟเวอร์ — สมาชิกทุกคนของเซิร์ฟเวอร์ดูได้
@GuildRoute('view')
@Controller('guilds/:guildId/levels')
export class LevelsController {
    constructor(private readonly levels: LevelsService) {}

    @Get()
    list(@GuildId() guildId: string): Promise<LevelRow[]> {
        return this.levels.list(guildId);
    }
}
