import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { SuccessResponse, VoiceGuardChannel, VoiceGuardMode } from '@notstack/shared';
import { AuditCtx } from '../common/decorators/audit.decorator';
import type { AuditContext } from '../common/interfaces/app-request.interface';
import { GuildId } from '../guilds/decorators/guild-id.decorator';
import { GuildRoute } from '../guilds/decorators/guild-route.decorator';
import { VoiceGuardChannelDeleteDto } from './dto/voice-guard-channel-delete.dto';
import { VoiceGuardChannelDto } from './dto/voice-guard-channel.dto';
import { VoiceGuardUserDto } from './dto/voice-guard-user.dto';
import { VoiceGuardService } from './voice-guard.service';

// route ชุดเดียวกันสำหรับ /api/guilds/:guildId/whitelist/* และ /blacklist/*
// ชื่อ action ใน audit log เดิม: voice_guard.<mode>_channel.update ฯลฯ
abstract class VoiceGuardController {
    protected abstract readonly mode: VoiceGuardMode;

    constructor(protected readonly guard: VoiceGuardService) {}

    @Get()
    list(@GuildId() guildId: string): Promise<VoiceGuardChannel[]> {
        return this.guard.overview(this.mode, guildId);
    }

    // เพิ่มห้อง / เปิด-ปิด / สวิตช์แจ้งเตือนทาง DM
    @Post('channel')
    @HttpCode(HttpStatus.OK)
    async updateChannel(@GuildId() guildId: string, @Body() body: VoiceGuardChannelDto, @AuditCtx() audit: AuditContext): Promise<SuccessResponse> {
        audit.action = `voice_guard.${this.mode}_channel.update`;
        if (body.notify !== undefined) await this.guard.setNotify(this.mode, guildId, body.channelId, body.notify);
        else await this.guard.setEnabled(this.mode, guildId, body.channelId, body.enabled ?? true);
        return { success: true };
    }

    @Post('channel/delete')
    @HttpCode(HttpStatus.OK)
    async deleteChannel(@GuildId() guildId: string, @Body() body: VoiceGuardChannelDeleteDto, @AuditCtx() audit: AuditContext): Promise<SuccessResponse> {
        audit.action = `voice_guard.${this.mode}_channel.delete`;
        await this.guard.deleteChannel(this.mode, guildId, body.channelId);
        return { success: true };
    }

    @Post('user')
    @HttpCode(HttpStatus.OK)
    async addUser(@GuildId() guildId: string, @Body() body: VoiceGuardUserDto, @AuditCtx() audit: AuditContext): Promise<SuccessResponse> {
        audit.action = `voice_guard.${this.mode}_user.add`;
        await this.guard.addUser(this.mode, guildId, body.channelId, body.userId);
        return { success: true };
    }

    @Post('user/delete')
    @HttpCode(HttpStatus.OK)
    async removeUser(@GuildId() guildId: string, @Body() body: VoiceGuardUserDto, @AuditCtx() audit: AuditContext): Promise<SuccessResponse> {
        audit.action = `voice_guard.${this.mode}_user.remove`;
        await this.guard.removeUser(this.mode, guildId, body.channelId, body.userId);
        return { success: true };
    }
}

@GuildRoute()
@Controller('guilds/:guildId/whitelist')
export class WhitelistController extends VoiceGuardController {
    protected readonly mode = 'whitelist';

    // ต้องประกาศ constructor ในคลาสลูกเอง — Nest อ่านชนิดของ dependency จาก metadata ของคลาสที่มี decorator
    constructor(guard: VoiceGuardService) {
        super(guard);
    }
}

@GuildRoute()
@Controller('guilds/:guildId/blacklist')
export class BlacklistController extends VoiceGuardController {
    protected readonly mode = 'blacklist';

    constructor(guard: VoiceGuardService) {
        super(guard);
    }
}
