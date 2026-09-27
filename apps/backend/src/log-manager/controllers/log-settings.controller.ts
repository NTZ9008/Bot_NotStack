import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { LogEventSetting, LogOptions, LogSettingsResponse } from '@notstack/shared';
import { Audit } from '../../common/decorators/audit.decorator';
import { DiscordService } from '../../discord/discord.service';
import { GuildId } from '../../guilds/decorators/guild-id.decorator';
import { GuildRoute } from '../../guilds/decorators/guild-route.decorator';
import { LogApplyAllDto } from '../dto/log-apply-all.dto';
import { LogSystemToggleDto } from '../dto/log-system-toggle.dto';
import { UpdateLogOptionsDto } from '../dto/update-log-options.dto';
import { UpdateLogSettingDto } from '../dto/update-log-setting.dto';
import { LogSettingsService } from '../services/log-settings.service';

// ==========================================
// 🌐 LOG MANAGER API — /api/guilds/:guildId/log-settings* (บันทึกทีละช่องทันทีที่แก้ในหน้าเว็บ)
// ==========================================
@GuildRoute()
@Controller('guilds/:guildId/log-settings')
export class LogSettingsController {
    constructor(
        private readonly settings: LogSettingsService,
        private readonly discord: DiscordService,
    ) {}

    // แปลง user id เป็นชื่อสำหรับแสดงในหน้า Dashboard (ถ้าหาไม่เจอก็คืน id ไปตามเดิม)
    private async resolveUserNames(userIds: string[]): Promise<Record<string, string>> {
        const names: Record<string, string> = {};
        for (const id of userIds) names[id] = (await this.discord.displayName(id)) ?? id;
        return names;
    }

    @Get()
    async list(@GuildId() guildId: string): Promise<LogSettingsResponse> {
        const options = await this.settings.listOptions(guildId);
        return {
            systemEnabled: this.settings.isSystemEnabled(guildId),
            groups: this.settings.groups(),
            events: await this.settings.listSettings(guildId),
            options,
            // ชื่อผู้ใช้ที่อยู่ใน ignore list — หน้าเว็บ list สมาชิกทั้งเซิร์ฟเวอร์เองไม่ได้
            ignoredUserNames: await this.resolveUserNames(options.ignoredUsers),
        };
    }

    // อัปเดตทีละรายการ
    @Audit('log_settings.update')
    @Post()
    @HttpCode(HttpStatus.OK)
    async update(@GuildId() guildId: string, @Body() body: UpdateLogSettingDto): Promise<{ success: true; setting: LogEventSetting }> {
        return { success: true, setting: await this.settings.updateSetting(guildId, body.key, body) };
    }

    // เปิด/ปิดระบบ log ทั้งหมดของเซิร์ฟเวอร์ (สวิตช์ใหญ่มุมขวาบน)
    @Audit('log_settings.system_toggle')
    @Post('system')
    @HttpCode(HttpStatus.OK)
    async toggleSystem(@GuildId() guildId: string, @Body() body: LogSystemToggleDto): Promise<{ success: true; systemEnabled: boolean }> {
        return { success: true, systemEnabled: await this.settings.setSystemEnabled(guildId, body.enabled) };
    }

    // ตั้งห้องเดียวกันให้ทุกรายการรวดเดียว
    @Audit('log_settings.apply_all')
    @Post('apply-all')
    @HttpCode(HttpStatus.OK)
    async applyAll(@GuildId() guildId: string, @Body() body: LogApplyAllDto): Promise<{ success: true; events: LogEventSetting[] }> {
        await this.settings.setChannelForAll(guildId, body.channelId);
        return { success: true, events: await this.settings.listSettings(guildId) };
    }

    // ตัวกรองส่วนกลาง: ห้อง/คน/ยศ ที่ไม่ต้อง log + จะ log การกระทำของบอทไหม + บันทึก Activity
    @Audit('log_settings.options_update')
    @Post('options')
    @HttpCode(HttpStatus.OK)
    async updateOptions(
        @GuildId() guildId: string,
        @Body() body: UpdateLogOptionsDto,
    ): Promise<{ success: true; options: LogOptions; ignoredUserNames: Record<string, string> }> {
        const options = await this.settings.updateOptions(guildId, body);
        return { success: true, options, ignoredUserNames: await this.resolveUserNames(options.ignoredUsers) };
    }
}
