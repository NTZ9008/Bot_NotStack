import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type {
    PublishTicketPanelResponse,
    TicketConfigDto,
    TicketDetailDto,
    TicketItemDto,
    TicketListResponse,
    TicketSaveConfigResponse,
} from '@notstack/shared';
import type { Response } from 'express';
import { Audit, AuditCtx, SkipAudit } from '../common/decorators/audit.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuditContext } from '../common/interfaces/app-request.interface';
import { requireId } from '../common/utils/parse.util';
import type { User } from '../generated/prisma/client';
import { GuildId } from '../guilds/decorators/guild-id.decorator';
import { GuildRoute } from '../guilds/decorators/guild-route.decorator';
import { RequirePlugin } from '../plugins/decorators/require-plugin.decorator';
import { TicketListQueryDto, TicketTranscriptQueryDto, UpdateTicketConfigDto } from './dto/tickets.dto';
import { TicketsService } from './tickets.service';

@GuildRoute()
@RequirePlugin('ticket-system')
@Controller('guilds/:guildId/tickets')
export class TicketsController {
    constructor(private readonly tickets: TicketsService) {}

    @Get('config')
    getConfig(@GuildId() guildId: string): Promise<TicketConfigDto> {
        return this.tickets.getConfig(guildId);
    }

    @Audit('tickets.config_update')
    @Post('config')
    @HttpCode(HttpStatus.OK)
    saveConfigPost(
        @GuildId() guildId: string,
        @Body() body: UpdateTicketConfigDto,
        @AuditCtx() audit: AuditContext,
    ): Promise<TicketSaveConfigResponse> {
        return this.saveConfig(guildId, body, audit);
    }

    @Audit('tickets.config_update')
    @Patch('config')
    saveConfigPatch(
        @GuildId() guildId: string,
        @Body() body: UpdateTicketConfigDto,
        @AuditCtx() audit: AuditContext,
    ): Promise<TicketSaveConfigResponse> {
        return this.saveConfig(guildId, body, audit);
    }

    private async saveConfig(
        guildId: string,
        body: UpdateTicketConfigDto,
        audit: AuditContext,
    ): Promise<TicketSaveConfigResponse> {
        audit.extra = { before: await this.tickets.getConfig(guildId) };
        const { config, warning } = await this.tickets.updateConfig(guildId, body);
        return { success: true, config, warning };
    }

    @Audit('tickets.panel_publish')
    @Post('panel')
    @HttpCode(HttpStatus.OK)
    async publishPanel(@GuildId() guildId: string, @AuditCtx() audit: AuditContext): Promise<PublishTicketPanelResponse> {
        const result = await this.tickets.publishPanel(guildId);
        audit.extra = { channelName: result.channelName, edited: result.edited, messageId: result.messageId };
        return result;
    }

    @Get()
    listTickets(@GuildId() guildId: string, @Query() query: TicketListQueryDto): Promise<TicketListResponse> {
        return this.tickets.listTickets(guildId, query);
    }

    @Get(':id')
    getTicketDetail(@GuildId() guildId: string, @Param('id') idParam: string): Promise<TicketDetailDto> {
        const id = requireId(idParam, 'ไม่พบ Ticket นี้');
        return this.tickets.getTicketDetail(guildId, id);
    }

    @SkipAudit()
    @Get(':id/transcript')
    async downloadTranscript(
        @GuildId() guildId: string,
        @Param('id') idParam: string,
        @Query() query: TicketTranscriptQueryDto,
        @Res() res: Response,
    ): Promise<void> {
        const id = requireId(idParam, 'ไม่พบ Ticket นี้');
        const file = await this.tickets.getTranscriptFile(guildId, id, query.format ?? 'md');
        res.setHeader('Content-Type', file.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
        res.setHeader('Content-Length', String(file.buffer.length));
        res.setHeader('Cache-Control', 'no-store');
        res.send(file.buffer);
    }

    @Audit('tickets.ticket_close')
    @Post(':id/close')
    @HttpCode(HttpStatus.OK)
    async closeTicket(
        @GuildId() guildId: string,
        @Param('id') idParam: string,
        @CurrentUser() user: User | undefined,
        @AuditCtx() audit: AuditContext,
    ): Promise<TicketItemDto> {
        audit.targetId = idParam;
        const id = requireId(idParam, 'ไม่พบ Ticket นี้');
        const closedById = user?.discordId || user?.username || 'dashboard';
        return this.tickets.closeTicket(guildId, id, closedById, 'ปิด Ticket จากหน้า Dashboard');
    }
}
