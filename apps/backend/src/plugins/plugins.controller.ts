import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import type { GuildPluginsResponse } from '@notstack/shared';
import { Audit, AuditCtx } from '../common/decorators/audit.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuditContext } from '../common/interfaces/app-request.interface';
import type { User } from '../generated/prisma/client';
import { GuildId } from '../guilds/decorators/guild-id.decorator';
import { GuildAccess, GuildRoute } from '../guilds/decorators/guild-route.decorator';
import { PluginsService } from './plugins.service';

@GuildRoute()
@Controller('guilds/:guildId/plugins')
export class PluginsController {
    constructor(private readonly plugins: PluginsService) {}

    @GuildAccess('view')
    @Get()
    list(@GuildId() guildId: string): Promise<GuildPluginsResponse> {
        return this.plugins.list(guildId);
    }

    @Audit('plugin.install')
    @Post(':pluginId/install')
    @HttpCode(HttpStatus.OK)
    install(
        @GuildId() guildId: string,
        @Param('pluginId') pluginId: string,
        @CurrentUser() user: User | undefined,
        @AuditCtx() audit: AuditContext,
    ): Promise<GuildPluginsResponse> {
        audit.targetId = pluginId;
        const installedBy = user?.displayName || user?.discordUsername || user?.username || null;
        return this.plugins.install(guildId, pluginId, installedBy);
    }

    @Audit('plugin.uninstall')
    @Post(':pluginId/uninstall')
    @HttpCode(HttpStatus.OK)
    uninstall(
        @GuildId() guildId: string,
        @Param('pluginId') pluginId: string,
        @AuditCtx() audit: AuditContext,
    ): Promise<GuildPluginsResponse> {
        audit.targetId = pluginId;
        return this.plugins.uninstall(guildId, pluginId);
    }
}
