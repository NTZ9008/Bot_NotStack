import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { levelQuerySchema, xpHistoryQuerySchema, xpMemberMutationSchema, xpResetGuildSchema, xpSettingsUpdateSchema } from '@notstack/shared';
import { Audit } from '../common/decorators/audit.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { createZodDto } from '../common/dto/create-zod-dto';
import type { User } from '../generated/prisma/client';
import { GuildId } from '../guilds/decorators/guild-id.decorator';
import { GuildAccess, GuildRoute } from '../guilds/decorators/guild-route.decorator';
import { LevelsService } from './levels.service';

class LevelQueryDto extends createZodDto(levelQuerySchema) {}
class SettingsDto extends createZodDto(xpSettingsUpdateSchema) {}
class MemberDto extends createZodDto(xpMemberMutationSchema) {}
class ResetDto extends createZodDto(xpResetGuildSchema) {}
class HistoryDto extends createZodDto(xpHistoryQuerySchema) {}

@GuildRoute()
@Controller('guilds/:guildId/levels')
export class LevelsController {
    constructor(private readonly levels: LevelsService) {}
    @Get()
    @GuildAccess('view')
    list(@GuildId() guildId: string, @Query() query: LevelQueryDto) {
        return this.levels.list(guildId, query);
    }

    @Get('settings')
    settings(@GuildId() guildId: string) {
        return this.levels.settings(guildId);
    }

    @Post('settings')
    @HttpCode(200)
    @Audit('xp.settings_update')
    update(@GuildId() guildId: string, @Body() input: SettingsDto) {
        return this.levels.updateSettings(guildId, input);
    }

    @Post('members')
    @HttpCode(200)
    @Audit('xp.member_update')
    member(@GuildId() guildId: string, @Body() input: MemberDto, @CurrentUser() user: User) {
        return this.levels.mutateMember(guildId, input, user.id);
    }

    @Post('reset')
    @HttpCode(200)
    @Audit('xp.guild_reset')
    reset(@GuildId() guildId: string, @Body() input: ResetDto, @CurrentUser() user: User) {
        return this.levels.resetGuild(guildId, input.reason, user.id);
    }

    @Get('history')
    history(@GuildId() guildId: string, @Query() query: HistoryDto) {
        return this.levels.history(guildId, query);
    }
}
