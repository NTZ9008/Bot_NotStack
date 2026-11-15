import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { GuildId } from '../guilds/decorators/guild-id.decorator';
import { GuildRoute } from '../guilds/decorators/guild-route.decorator';
import { GrafanaService } from './grafana.service';
import { GrafanaStatsQueryDto, UpdateGrafanaSettingsDto } from './dto/grafana-settings.dto';

@GuildRoute()
@Controller('guilds/:guildId/grafana')
export class GrafanaSettingsController {
    constructor(private readonly grafana: GrafanaService) {}

    @Get('settings')
    readSettings(@GuildId() guildId: string) {
        return this.grafana.readSettings(guildId);
    }

    @Post('settings')
    @HttpCode(HttpStatus.OK)
    updateSettings(@GuildId() guildId: string, @Body() body: UpdateGrafanaSettingsDto) {
        return this.grafana.updateSettings(guildId, body);
    }

    @Post('secret')
    @HttpCode(HttpStatus.OK)
    async rotateSecret(@GuildId() guildId: string) {
        return { success: true, webhookSecret: await this.grafana.rotateSecret(guildId) };
    }

    @Get('stats')
    readStats(@GuildId() guildId: string, @Query() query: GrafanaStatsQueryDto) {
        return this.grafana.readStats(guildId, query.days);
    }

    @Post('test')
    @HttpCode(HttpStatus.OK)
    async sendTest(@GuildId() guildId: string) {
        await this.grafana.sendTest(guildId);
        return { success: true };
    }
}
