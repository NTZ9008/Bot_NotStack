import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import type { JiraConnectionResult, JiraSaveResponse, JiraSettings, JiraTicket, JiraTicketPage, SuccessResponse } from '@notstack/shared';
import { Audit, AuditCtx, SkipAudit } from '../common/decorators/audit.decorator';
import type { AuditContext } from '../common/interfaces/app-request.interface';
import { requireId } from '../common/utils/parse.util';
import { GuildId } from '../guilds/decorators/guild-id.decorator';
import { GuildRoute } from '../guilds/decorators/guild-route.decorator';
import { JiraTicketQueryDto } from './dto/jira-ticket-query.dto';
import { TestJiraDto } from './dto/test-jira.dto';
import { UpdateJiraDto } from './dto/update-jira.dto';
import { JiraService } from './jira.service';

// ==========================================
// 🌐 JIRA API — /api/guilds/:guildId/jira/* (ผู้ที่จัดการเซิร์ฟเวอร์นั้นได้)
// GET  settings              การตั้งค่า (ไม่มี API token)
// POST settings              บันทึกเฉพาะฟิลด์ที่ส่งมา (apiToken ว่าง = ใช้ของเดิม)
// POST test                  ทดสอบเชื่อมต่อ Jira + ดึงประเภท issue ของโปรเจกต์
// POST panel                 ส่ง/อัปเดตข้อความแผง (ปุ่มเปิด card) เข้าห้องแผง
// GET  tickets               รายการห้อง / card ล่าสุด
// POST tickets/:id/close     ปิดห้องส่วนตัวจากหน้าเว็บ
// ==========================================
@GuildRoute()
@Controller('guilds/:guildId/jira')
export class JiraController {
    constructor(private readonly jira: JiraService) {}

    @Get('settings')
    async settings(@GuildId() guildId: string): Promise<JiraSettings> {
        return this.jira.view(await this.jira.getSettings(guildId));
    }

    @Audit('jira.settings_update')
    @Post('settings')
    @HttpCode(HttpStatus.OK)
    async save(@GuildId() guildId: string, @Body() body: UpdateJiraDto, @AuditCtx() audit: AuditContext): Promise<JiraSaveResponse> {
        audit.extra = { before: this.jira.view(await this.jira.getSettings(guildId)) };
        const { settings, warning } = await this.jira.updateSettings(guildId, body);
        return { success: true, settings: this.jira.view(settings), warning };
    }

    // แค่อ่านข้อมูลจาก Jira ไม่ได้แก้อะไร
    @SkipAudit()
    @Post('test')
    @HttpCode(HttpStatus.OK)
    test(@GuildId() guildId: string, @Body() body: TestJiraDto): Promise<JiraConnectionResult> {
        return this.jira.testConnection(guildId, body);
    }

    @Audit('jira.panel_send')
    @Post('panel')
    @HttpCode(HttpStatus.OK)
    async panel(@GuildId() guildId: string): Promise<SuccessResponse> {
        const { channelName, edited } = await this.jira.sendPanel(guildId);
        return { success: true, message: edited ? `อัปเดตแผงใน #${channelName} แล้ว` : `ส่งแผงเข้า #${channelName} แล้ว` };
    }

    @Get('tickets')
    tickets(@GuildId() guildId: string, @Query() query: JiraTicketQueryDto): Promise<JiraTicketPage> {
        return this.jira.listTickets(guildId, query.page, query.status);
    }

    @Audit('jira.ticket_close')
    @Post('tickets/:id/close')
    @HttpCode(HttpStatus.OK)
    async close(@GuildId() guildId: string, @Param('id') idParam: string, @AuditCtx() audit: AuditContext): Promise<JiraTicket> {
        audit.targetId = idParam;
        const id = requireId(idParam, 'ไม่พบห้องนี้');
        return this.jira.toTicketView(await this.jira.closeTicket(guildId, id, 'ปิด Jira ticket จากหน้า Dashboard'));
    }
}
