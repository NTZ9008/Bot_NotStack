import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import type { RemindersListResponse, ScheduledReminderItem, SuccessResponse } from '@notstack/shared';
import { Audit, AuditCtx } from '../common/decorators/audit.decorator';
import type { AuditContext } from '../common/interfaces/app-request.interface';
import { requireId } from '../common/utils/parse.util';
import { GuildId } from '../guilds/decorators/guild-id.decorator';
import { GuildRoute } from '../guilds/decorators/guild-route.decorator';
import { RequirePlugin } from '../plugins/decorators/require-plugin.decorator';
import { CreateReminderDto, UpdateReminderDto } from './dto/reminder.dto';
import { RemindersService } from './reminders.service';

@GuildRoute()
@RequirePlugin('scheduled-reminders')
@Controller('guilds/:guildId/reminders')
export class RemindersController {
    constructor(private readonly reminders: RemindersService) {}

    @Get()
    list(@GuildId() guildId: string): Promise<RemindersListResponse> {
        return this.reminders.list(guildId);
    }

    @Audit('reminder.create')
    @Post()
    async create(
        @GuildId() guildId: string,
        @Body() body: CreateReminderDto,
        @AuditCtx() audit: AuditContext,
    ): Promise<ScheduledReminderItem> {
        const created = await this.reminders.create(guildId, body);
        audit.targetId = created.id;
        audit.extra = { title: created.title, scheduleType: created.scheduleType, channelId: created.channelId };
        return created;
    }

    @Audit('reminder.update')
    @Patch(':id')
    async update(
        @GuildId() guildId: string,
        @Param('id') idParam: string,
        @Body() body: UpdateReminderDto,
        @AuditCtx() audit: AuditContext,
    ): Promise<ScheduledReminderItem> {
        const id = requireId(idParam, 'ไม่พบรายการแจ้งเตือนนี้');
        audit.targetId = id;
        return this.reminders.update(guildId, id, body);
    }

    @Audit('reminder.delete')
    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    remove(@GuildId() guildId: string, @Param('id') idParam: string, @AuditCtx() audit: AuditContext): Promise<SuccessResponse> {
        return this.deleteReminder(guildId, idParam, audit);
    }

    @Audit('reminder.delete')
    @Post(':id/delete')
    @HttpCode(HttpStatus.OK)
    removePost(@GuildId() guildId: string, @Param('id') idParam: string, @AuditCtx() audit: AuditContext): Promise<SuccessResponse> {
        return this.deleteReminder(guildId, idParam, audit);
    }

    private async deleteReminder(guildId: string, idParam: string, audit: AuditContext): Promise<SuccessResponse> {
        const id = requireId(idParam, 'ไม่พบรายการแจ้งเตือนนี้');
        audit.targetId = id;
        await this.reminders.remove(guildId, id);
        return { success: true };
    }

    @Audit('reminder.test_send')
    @Post(':id/test')
    @HttpCode(HttpStatus.OK)
    async testSend(@GuildId() guildId: string, @Param('id') idParam: string, @AuditCtx() audit: AuditContext): Promise<ScheduledReminderItem> {
        const id = requireId(idParam, 'ไม่พบรายการแจ้งเตือนนี้');
        audit.targetId = id;
        return this.reminders.testSend(guildId, id);
    }
}
