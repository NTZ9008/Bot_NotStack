import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import type { SuccessResponse, UptimeOverviewResponse, UptimeTargetDetailResponse, UptimeTargetSummary } from '@notstack/shared';
import { Audit, AuditCtx } from '../common/decorators/audit.decorator';
import type { AuditContext } from '../common/interfaces/app-request.interface';
import { requireId } from '../common/utils/parse.util';
import { GuildId } from '../guilds/decorators/guild-id.decorator';
import { GuildRoute } from '../guilds/decorators/guild-route.decorator';
import { RequirePlugin } from '../plugins/decorators/require-plugin.decorator';
import { CreateUptimeTargetDto, UpdateUptimeTargetDto } from './dto/uptime-target.dto';
import { UptimeService } from './uptime.service';

@GuildRoute()
@RequirePlugin('uptime-monitor')
@Controller('guilds/:guildId/uptime')
export class UptimeController {
    constructor(private readonly uptime: UptimeService) {}

    @Get()
    list(@GuildId() guildId: string): Promise<UptimeOverviewResponse> {
        return this.uptime.list(guildId);
    }

    @Get(':id')
    detail(@GuildId() guildId: string, @Param('id') idParam: string): Promise<UptimeTargetDetailResponse> {
        return this.uptime.detail(guildId, requireId(idParam, 'ไม่พบรายการตรวจสอบนี้'));
    }

    @Audit('uptime.target_create')
    @Post()
    async create(
        @GuildId() guildId: string,
        @Body() body: CreateUptimeTargetDto,
        @AuditCtx() audit: AuditContext,
    ): Promise<UptimeTargetSummary> {
        const created = await this.uptime.create(guildId, body);
        audit.targetId = created.id;
        audit.extra = { name: created.name, url: created.url, intervalMinutes: created.intervalMinutes };
        return created;
    }

    @Audit('uptime.target_update')
    @Patch(':id')
    async update(
        @GuildId() guildId: string,
        @Param('id') idParam: string,
        @Body() body: UpdateUptimeTargetDto,
        @AuditCtx() audit: AuditContext,
    ): Promise<UptimeTargetSummary> {
        const id = requireId(idParam, 'ไม่พบรายการตรวจสอบนี้');
        audit.targetId = id;
        return this.uptime.update(guildId, id, body);
    }

    @Audit('uptime.target_delete')
    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    remove(@GuildId() guildId: string, @Param('id') idParam: string, @AuditCtx() audit: AuditContext): Promise<SuccessResponse> {
        return this.deleteTarget(guildId, idParam, audit);
    }

    @Audit('uptime.target_delete')
    @Post(':id/delete')
    @HttpCode(HttpStatus.OK)
    removePost(@GuildId() guildId: string, @Param('id') idParam: string, @AuditCtx() audit: AuditContext): Promise<SuccessResponse> {
        return this.deleteTarget(guildId, idParam, audit);
    }

    private async deleteTarget(guildId: string, idParam: string, audit: AuditContext): Promise<SuccessResponse> {
        const id = requireId(idParam, 'ไม่พบรายการตรวจสอบนี้');
        audit.targetId = id;
        await this.uptime.remove(guildId, id);
        return { success: true };
    }

    @Audit('uptime.target_check')
    @Post(':id/check')
    @HttpCode(HttpStatus.OK)
    async checkNow(@GuildId() guildId: string, @Param('id') idParam: string, @AuditCtx() audit: AuditContext): Promise<UptimeTargetSummary> {
        const id = requireId(idParam, 'ไม่พบรายการตรวจสอบนี้');
        audit.targetId = id;
        return this.uptime.checkNow(guildId, id);
    }
}
