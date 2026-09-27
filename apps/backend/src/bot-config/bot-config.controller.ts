import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { ConfigRow, SuccessResponse } from '@notstack/shared';
import { Audit, AuditCtx } from '../common/decorators/audit.decorator';
import type { AuditContext } from '../common/interfaces/app-request.interface';
import { GuildId } from '../guilds/decorators/guild-id.decorator';
import { GuildRoute } from '../guilds/decorators/guild-route.decorator';
import { BotConfigService } from './bot-config.service';
import { UpdateConfigDto } from './dto/update-config.dto';

// ==========================================
// ⚙️ CONFIGURATION API — /api/guilds/:guildId/config
// ==========================================
@GuildRoute()
@Controller('guilds/:guildId/config')
export class BotConfigController {
    constructor(private readonly config: BotConfigService) {}

    @Get()
    list(@GuildId() guildId: string): Promise<ConfigRow[]> {
        return this.config.list(guildId);
    }

    @Audit('config.update')
    @Post()
    @HttpCode(HttpStatus.OK)
    async update(@GuildId() guildId: string, @Body() body: UpdateConfigDto, @AuditCtx() audit: AuditContext): Promise<SuccessResponse> {
        // เก็บค่าเดิมไว้ใน audit log (ดูได้ว่าเปลี่ยนจากอะไรเป็นอะไร)
        audit.extra = { before: await this.config.get(guildId, body.key) };
        await this.config.update(guildId, body.key, body.value);
        return { success: true, message: 'Config updated successfully' };
    }
}
