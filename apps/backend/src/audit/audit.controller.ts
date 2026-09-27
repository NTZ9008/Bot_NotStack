import { Controller, Get, Query } from '@nestjs/common';
import type { AuditLogPage } from '@notstack/shared';
import { AdminOnly } from '../common/decorators/roles.decorator';
import { GuildId } from '../guilds/decorators/guild-id.decorator';
import { GuildRoute } from '../guilds/decorators/guild-route.decorator';
import { AuditService } from './audit.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

// ==========================================
// 📜 AUDIT LOGS ทั้งระบบ — /api/admin/audit-logs (ADMIN เท่านั้น)
// ==========================================
@AdminOnly()
@Controller('admin/audit-logs')
export class AuditController {
    constructor(private readonly audit: AuditService) {}

    @Get()
    list(@Query() query: AuditLogQueryDto): Promise<AuditLogPage> {
        return this.audit.query(query);
    }

    @Get('actions')
    actions(): Promise<string[]> {
        return this.audit.listActions();
    }
}

// ==========================================
// 📜 AUDIT LOGS ของเซิร์ฟเวอร์เดียว — /api/guilds/:guildId/audit-logs (ผู้ที่จัดการเซิร์ฟเวอร์นั้นได้)
// ==========================================
@GuildRoute()
@Controller('guilds/:guildId/audit-logs')
export class GuildAuditController {
    constructor(private readonly audit: AuditService) {}

    @Get()
    list(@GuildId() guildId: string, @Query() query: AuditLogQueryDto): Promise<AuditLogPage> {
        return this.audit.query(query, guildId);
    }

    @Get('actions')
    actions(@GuildId() guildId: string): Promise<string[]> {
        return this.audit.listActions(guildId);
    }
}
