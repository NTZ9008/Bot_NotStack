import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import type {
    PublishReactionRolePanelResponse,
    ReactionRoleItemDto,
    ReactionRolePanelDto,
    ReactionRolePanelsResponse,
    SuccessResponse,
} from '@notstack/shared';
import { Audit, AuditCtx } from '../common/decorators/audit.decorator';
import type { AuditContext } from '../common/interfaces/app-request.interface';
import { requireId } from '../common/utils/parse.util';
import { GuildId } from '../guilds/decorators/guild-id.decorator';
import { GuildRoute } from '../guilds/decorators/guild-route.decorator';
import { RequirePlugin } from '../plugins/decorators/require-plugin.decorator';
import {
    CreateReactionRoleItemDto,
    CreateReactionRolePanelDto,
    UpdateReactionRoleItemDto,
    UpdateReactionRolePanelDto,
} from './dto/reaction-roles.dto';
import { ReactionRolesService } from './reaction-roles.service';

@GuildRoute()
@RequirePlugin('reaction-roles')
@Controller('guilds/:guildId/reaction-roles')
export class ReactionRolesController {
    constructor(private readonly service: ReactionRolesService) {}

    @Get()
    list(@GuildId() guildId: string): Promise<ReactionRolePanelsResponse> {
        return this.service.list(guildId);
    }

    @Get(':id')
    detail(@GuildId() guildId: string, @Param('id') idParam: string): Promise<ReactionRolePanelDto> {
        return this.service.detail(guildId, requireId(idParam, 'ไม่พบแผงรับยศนี้'));
    }

    @Audit('reaction_roles.panel_create')
    @Post()
    async createPanel(
        @GuildId() guildId: string,
        @Body() body: CreateReactionRolePanelDto,
        @AuditCtx() audit: AuditContext,
    ): Promise<ReactionRolePanelDto> {
        const created = await this.service.createPanel(guildId, body);
        audit.targetId = created.id;
        audit.extra = { title: created.title, channelId: created.channelId, mode: created.mode };
        return created;
    }

    @Audit('reaction_roles.panel_update')
    @Patch(':id')
    async updatePanel(
        @GuildId() guildId: string,
        @Param('id') idParam: string,
        @Body() body: UpdateReactionRolePanelDto,
        @AuditCtx() audit: AuditContext,
    ): Promise<ReactionRolePanelDto> {
        const id = requireId(idParam, 'ไม่พบแผงรับยศนี้');
        audit.targetId = id;
        return this.service.updatePanel(guildId, id, body);
    }

    @Audit('reaction_roles.panel_delete')
    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    removePanel(@GuildId() guildId: string, @Param('id') idParam: string, @AuditCtx() audit: AuditContext): Promise<SuccessResponse> {
        return this.deletePanel(guildId, idParam, audit);
    }

    @Audit('reaction_roles.panel_delete')
    @Post(':id/delete')
    @HttpCode(HttpStatus.OK)
    removePanelPost(@GuildId() guildId: string, @Param('id') idParam: string, @AuditCtx() audit: AuditContext): Promise<SuccessResponse> {
        return this.deletePanel(guildId, idParam, audit);
    }

    private async deletePanel(guildId: string, idParam: string, audit: AuditContext): Promise<SuccessResponse> {
        const id = requireId(idParam, 'ไม่พบแผงรับยศนี้');
        audit.targetId = id;
        await this.service.removePanel(guildId, id);
        return { success: true };
    }

    @Audit('reaction_roles.panel_publish')
    @Post(':id/publish')
    @HttpCode(HttpStatus.OK)
    async publishPanel(
        @GuildId() guildId: string,
        @Param('id') idParam: string,
        @AuditCtx() audit: AuditContext,
    ): Promise<PublishReactionRolePanelResponse> {
        const id = requireId(idParam, 'ไม่พบแผงรับยศนี้');
        audit.targetId = id;
        const result = await this.service.publishPanel(guildId, id);
        audit.extra = { channelName: result.channelName, edited: result.edited, messageId: result.panel.messageId };
        return result;
    }

    @Audit('reaction_roles.item_create')
    @Post(':id/items')
    async addItem(
        @GuildId() guildId: string,
        @Param('id') idParam: string,
        @Body() body: CreateReactionRoleItemDto,
        @AuditCtx() audit: AuditContext,
    ): Promise<ReactionRoleItemDto> {
        const panelId = requireId(idParam, 'ไม่พบแผงรับยศนี้');
        const created = await this.service.addItem(guildId, panelId, body);
        audit.targetId = created.id;
        audit.extra = { panelId, roleId: created.roleId, label: created.label };
        return created;
    }

    @Audit('reaction_roles.item_update')
    @Patch(':id/items/:itemId')
    async updateItem(
        @GuildId() guildId: string,
        @Param('id') idParam: string,
        @Param('itemId') itemIdParam: string,
        @Body() body: UpdateReactionRoleItemDto,
        @AuditCtx() audit: AuditContext,
    ): Promise<ReactionRoleItemDto> {
        const panelId = requireId(idParam, 'ไม่พบแผงรับยศนี้');
        const itemId = requireId(itemIdParam, 'ไม่พบรายการยศนี้');
        audit.targetId = itemId;
        audit.extra = { panelId };
        return this.service.updateItem(guildId, panelId, itemId, body);
    }

    @Audit('reaction_roles.item_delete')
    @Delete(':id/items/:itemId')
    @HttpCode(HttpStatus.OK)
    removeItem(
        @GuildId() guildId: string,
        @Param('id') idParam: string,
        @Param('itemId') itemIdParam: string,
        @AuditCtx() audit: AuditContext,
    ): Promise<SuccessResponse> {
        return this.deleteItem(guildId, idParam, itemIdParam, audit);
    }

    @Audit('reaction_roles.item_delete')
    @Post(':id/items/:itemId/delete')
    @HttpCode(HttpStatus.OK)
    removeItemPost(
        @GuildId() guildId: string,
        @Param('id') idParam: string,
        @Param('itemId') itemIdParam: string,
        @AuditCtx() audit: AuditContext,
    ): Promise<SuccessResponse> {
        return this.deleteItem(guildId, idParam, itemIdParam, audit);
    }

    private async deleteItem(guildId: string, idParam: string, itemIdParam: string, audit: AuditContext): Promise<SuccessResponse> {
        const panelId = requireId(idParam, 'ไม่พบแผงรับยศนี้');
        const itemId = requireId(itemIdParam, 'ไม่พบรายการยศนี้');
        audit.targetId = itemId;
        audit.extra = { panelId };
        await this.service.removeItem(guildId, panelId, itemId);
        return { success: true };
    }
}
