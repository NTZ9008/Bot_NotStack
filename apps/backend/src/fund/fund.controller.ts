import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Res } from '@nestjs/common';
import type { FundTopicDetail, FundTopicSummary, SuccessResponse } from '@notstack/shared';
import type { Response } from 'express';
import { Audit, AuditCtx } from '../common/decorators/audit.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuditContext } from '../common/interfaces/app-request.interface';
import { requireId } from '../common/utils/parse.util';
import type { User } from '../generated/prisma/client';
import { GuildId } from '../guilds/decorators/guild-id.decorator';
import { GuildRoute } from '../guilds/decorators/guild-route.decorator';
import { AddFundMembersDto } from './dto/add-fund-members.dto';
import { BatchFundPaymentDto } from './dto/batch-fund-payment.dto';
import { CreateFundPaymentDto } from './dto/create-fund-payment.dto';
import { CreateFundTopicDto } from './dto/create-fund-topic.dto';
import { SendFundReportDto } from './dto/send-fund-report.dto';
import { UpdateFundMemberDto } from './dto/update-fund-member.dto';
import { UpdateFundTopicDto } from './dto/update-fund-topic.dto';
import { FundService } from './fund.service';

const topicId = (value: string) => requireId(value, 'ไม่พบหัวข้อเก็บเงินนี้');

// ==========================================
// 🌐 FUND API — /api/guilds/:guildId/funds/* (ผู้ที่จัดการเซิร์ฟเวอร์นั้นได้)
// GET  /                                  รายการหัวข้อ (สรุปยอด)
// POST /                                  สร้างหัวข้อ
// GET  /:id                               รายละเอียด (คน + รายการรับเงิน)
// POST /:id                               แก้ไขหัวข้อ (ชื่อ / ยอดต่อคน / ห้องรายงาน / ปิด-เปิด)
// POST /:id/delete                        ลบหัวข้อ
// POST /:id/members                       เพิ่มคน (เลือกทีละคน หรือดึงทั้งยศ)
// POST /:id/members/:memberId             ตั้งยอดเฉพาะคน
// POST /:id/members/:memberId/delete      ลบคน
// POST /:id/payments                      บันทึกการรับเงิน
// POST /:id/payments/:paymentId/delete    ลบรายการรับเงิน
// POST /:id/report                        ส่งรายงานเข้าห้อง
// ==========================================
@GuildRoute()
@Controller('guilds/:guildId/funds')
export class FundController {
    constructor(private readonly fund: FundService) {}

    @Get()
    list(@GuildId() guildId: string): Promise<FundTopicSummary[]> {
        return this.fund.list(guildId);
    }

    @Audit('fund.topic_create')
    @Post()
    @HttpCode(HttpStatus.OK)
    async create(@GuildId() guildId: string, @Body() body: CreateFundTopicDto, @AuditCtx() audit: AuditContext): Promise<FundTopicDetail> {
        const topic = await this.fund.create(guildId, body);
        audit.targetId = topic.id;
        return topic;
    }

    @Get(':id')
    detail(@GuildId() guildId: string, @Param('id') id: string): Promise<FundTopicDetail> {
        return this.fund.detail(guildId, topicId(id));
    }

    @Get(':id/export')
    async exportCsv(
        @GuildId() guildId: string,
        @Param('id') id: string,
        @Res({ passthrough: true }) res: Response,
    ): Promise<string> {
        const { filename, csv } = await this.fund.exportCsv(guildId, topicId(id));
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        return csv;
    }

    @Audit('fund.topic_update')
    @Post(':id')
    @HttpCode(HttpStatus.OK)
    update(@GuildId() guildId: string, @Param('id') id: string, @Body() body: UpdateFundTopicDto, @AuditCtx() audit: AuditContext): Promise<FundTopicDetail> {
        audit.targetId = id;
        return this.fund.update(guildId, topicId(id), body);
    }

    @Audit('fund.topic_delete')
    @Post(':id/delete')
    @HttpCode(HttpStatus.OK)
    async remove(@GuildId() guildId: string, @Param('id') id: string, @AuditCtx() audit: AuditContext): Promise<SuccessResponse> {
        audit.targetId = id;
        await this.fund.remove(guildId, topicId(id));
        return { success: true };
    }

    @Audit('fund.member_add')
    @Post(':id/members')
    @HttpCode(HttpStatus.OK)
    async addMembers(@GuildId() guildId: string, @Param('id') id: string, @Body() body: AddFundMembersDto, @AuditCtx() audit: AuditContext): Promise<SuccessResponse> {
        audit.targetId = id;
        const { added, skipped } = await this.fund.addMembers(guildId, topicId(id), body);
        return { success: true, message: skipped > 0 ? `เพิ่ม ${added} คน (ข้าม ${skipped} คนที่มีอยู่แล้ว)` : `เพิ่ม ${added} คนแล้ว` };
    }

    @Audit('fund.member_update')
    @Post(':id/members/:memberId')
    @HttpCode(HttpStatus.OK)
    async updateMember(
        @GuildId() guildId: string,
        @Param('id') id: string,
        @Param('memberId') memberId: string,
        @Body() body: UpdateFundMemberDto,
        @AuditCtx() audit: AuditContext,
    ): Promise<SuccessResponse> {
        audit.targetId = memberId;
        await this.fund.updateMember(guildId, topicId(id), requireId(memberId, 'ไม่พบคนนี้ในหัวข้อ'), body);
        return { success: true };
    }

    @Audit('fund.member_remove')
    @Post(':id/members/:memberId/delete')
    @HttpCode(HttpStatus.OK)
    async removeMember(@GuildId() guildId: string, @Param('id') id: string, @Param('memberId') memberId: string, @AuditCtx() audit: AuditContext): Promise<SuccessResponse> {
        audit.targetId = memberId;
        await this.fund.removeMember(guildId, topicId(id), requireId(memberId, 'ไม่พบคนนี้ในหัวข้อ'));
        return { success: true };
    }

    @Audit('fund.payment_add')
    @Post(':id/payments')
    @HttpCode(HttpStatus.OK)
    async addPayment(
        @GuildId() guildId: string,
        @Param('id') id: string,
        @Body() body: CreateFundPaymentDto,
        @CurrentUser() user: User | undefined,
        @AuditCtx() audit: AuditContext,
    ): Promise<SuccessResponse> {
        audit.targetId = id;
        const recordedBy = user?.displayName || user?.discordUsername || user?.username || 'Dashboard';
        await this.fund.addPayment(guildId, topicId(id), body, recordedBy);
        return { success: true };
    }

    @Audit('fund.payment_batch')
    @Post(':id/payments/batch')
    @HttpCode(HttpStatus.OK)
    async batchPayments(
        @GuildId() guildId: string,
        @Param('id') id: string,
        @Body() body: BatchFundPaymentDto,
        @CurrentUser() user: User | undefined,
        @AuditCtx() audit: AuditContext,
    ): Promise<SuccessResponse> {
        audit.targetId = id;
        const recordedBy = user?.displayName || user?.discordUsername || user?.username || 'Dashboard';
        const { count } = await this.fund.batchPayments(guildId, topicId(id), body, recordedBy);
        return { success: true, message: `บันทึกการรับเงิน ${count} คนแล้ว` };
    }

    @Audit('fund.payment_delete')
    @Post(':id/payments/:paymentId/delete')
    @HttpCode(HttpStatus.OK)
    async removePayment(@GuildId() guildId: string, @Param('id') id: string, @Param('paymentId') paymentId: string, @AuditCtx() audit: AuditContext): Promise<SuccessResponse> {
        audit.targetId = paymentId;
        await this.fund.removePayment(guildId, topicId(id), requireId(paymentId, 'ไม่พบรายการรับเงินนี้'));
        return { success: true };
    }

    @Audit('fund.report_send')
    @Post(':id/report')
    @HttpCode(HttpStatus.OK)
    async report(@GuildId() guildId: string, @Param('id') id: string, @Body() body: SendFundReportDto, @AuditCtx() audit: AuditContext): Promise<SuccessResponse> {
        audit.targetId = id;
        const { channelName } = await this.fund.sendReport(guildId, topicId(id), body);
        return { success: true, message: `ส่งรายงานเข้า #${channelName} แล้ว` };
    }
}
