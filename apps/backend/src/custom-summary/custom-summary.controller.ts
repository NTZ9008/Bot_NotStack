import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Audit, AuditCtx, SkipAudit } from '../common/decorators/audit.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuditContext } from '../common/interfaces/app-request.interface';
import type { User } from '../generated/prisma/client';
import { GuildId } from '../guilds/decorators/guild-id.decorator';
import { GuildRoute } from '../guilds/decorators/guild-route.decorator';
import { CustomSummaryPdfRequestDto, CustomSummaryRequestDto } from './dto/custom-summary.dto';
import { CustomSummaryPdfService } from './custom-summary-pdf.service';
import { CustomSummaryService } from './custom-summary.service';

function buildPdfFilename(guildId: string, title: string): { ascii: string; utf8: string } {
    const stamp = new Date().toISOString().slice(0, 10);
    const ascii = `notstack-summary-${guildId}-${stamp}.pdf`;
    const cleanedTitle = title
        .replace(/[\\/:*?"<>|]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
    const utf8 = `${cleanedTitle || 'custom-summary'}-${stamp}.pdf`;
    return { ascii, utf8 };
}

@GuildRoute()
@Controller('guilds/:guildId/custom-summary')
export class CustomSummaryController {
    constructor(
        private readonly summaryService: CustomSummaryService,
        private readonly pdfService: CustomSummaryPdfService,
    ) {}

    @Get('channels')
    @SkipAudit()
    channels(@GuildId() guildId: string) {
        return this.summaryService.listChannels(guildId);
    }

    @Post()
    @HttpCode(HttpStatus.OK)
    @SkipAudit()
    summary(@GuildId() guildId: string, @Body() body: CustomSummaryRequestDto) {
        return this.summaryService.buildSummary(guildId, body);
    }

    @Post('pdf')
    @HttpCode(HttpStatus.OK)
    @Audit('custom_summary.export_pdf')
    async exportPdf(
        @GuildId() guildId: string,
        @Body() body: CustomSummaryPdfRequestDto,
        @CurrentUser() user: User | undefined,
        @AuditCtx() audit: AuditContext,
        @Res() res: Response,
    ) {
        const adminName = user?.displayName || user?.discordUsername || user?.username || 'ผู้ดูแลระบบ';
        const summary = await this.summaryService.buildSummary(guildId, body);
        const printedAt = new Date();
        const buffer = await this.pdfService.render(summary, {
            title: body.title,
            theme: body.theme,
            detailMode: body.detailMode,
            adminName,
            printedAt,
            maskIds: body.maskIds,
        });

        audit.extra = {
            title: body.title,
            theme: body.theme,
            detailMode: body.detailMode,
            maskIds: body.maskIds,
            channelCount: body.channelIds.length,
            modules: body.modules,
        };

        const { ascii, utf8 } = buildPdfFilename(guildId, body.title);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(utf8)}`);
        res.setHeader('Content-Length', String(buffer.length));
        res.setHeader('Cache-Control', 'no-store');
        res.send(buffer);
    }
}
