import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isSnowflake, type PluginId } from '@notstack/shared';
import { notFound } from '../../common/exceptions/api.exception';
import type { AppRequest } from '../../common/interfaces/app-request.interface';
import { DiscordService } from '../../discord/discord.service';
import { REQUIRE_PLUGIN_KEY } from '../decorators/require-plugin.decorator';
import { PluginsService } from '../plugins.service';

@Injectable()
export class PluginGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly plugins: PluginsService,
        private readonly discord: DiscordService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const pluginId = this.reflector.getAllAndOverride<PluginId | undefined>(REQUIRE_PLUGIN_KEY, [context.getHandler(), context.getClass()]);
        if (!pluginId) return true;

        const req = context.switchToHttp().getRequest<AppRequest>();
        const paramGuildId = req.params.guildId;
        if (paramGuildId !== undefined && !isSnowflake(paramGuildId)) {
            throw notFound('ไม่พบเซิร์ฟเวอร์นี้');
        }
        const guildId = paramGuildId ?? this.discord.homeGuildId;
        await this.plugins.assertInstalled(guildId, pluginId);
        return true;
    }
}
