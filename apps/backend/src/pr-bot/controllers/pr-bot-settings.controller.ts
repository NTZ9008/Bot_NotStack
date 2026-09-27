import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { PrBotSecretResponse, PrBotSettings } from '@notstack/shared';
import { Audit, AuditCtx } from '../../common/decorators/audit.decorator';
import type { AuditContext } from '../../common/interfaces/app-request.interface';
import { GuildId } from '../../guilds/decorators/guild-id.decorator';
import { GuildRoute } from '../../guilds/decorators/guild-route.decorator';
import { UpdatePrBotDto } from '../dto/update-pr-bot.dto';
import { PrBotSettingsService } from '../pr-bot-settings.service';

// ตั้งค่า PR Bot ของเซิร์ฟเวอร์ (ห้อง default / ห้องแยกตาม org / mention แยกตาม repo / webhook secret)
@GuildRoute()
@Controller('guilds/:guildId/pr-bot')
export class PrBotSettingsController {
    constructor(private readonly settings: PrBotSettingsService) {}

    @Get('settings')
    read(@GuildId() guildId: string): Promise<PrBotSettings> {
        return this.settings.read(guildId);
    }

    @Audit('pr_bot.update')
    @Post('settings')
    @HttpCode(HttpStatus.OK)
    async update(@GuildId() guildId: string, @Body() body: UpdatePrBotDto, @AuditCtx() audit: AuditContext): Promise<PrBotSettings> {
        const { webhookSecret: _secret, ...before } = await this.settings.read(guildId);
        audit.extra = { before };
        return this.settings.update(guildId, body);
    }

    // สร้าง secret ใหม่ (secret เดิมใช้ไม่ได้ทันที — ต้องไปแก้ที่ GitHub ด้วย)
    @Audit('pr_bot.secret_rotate')
    @Post('secret')
    @HttpCode(HttpStatus.OK)
    async rotateSecret(@GuildId() guildId: string): Promise<PrBotSecretResponse> {
        return { success: true, webhookSecret: await this.settings.rotateWebhookSecret(guildId) };
    }
}
