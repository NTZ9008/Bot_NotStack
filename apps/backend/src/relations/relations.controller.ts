import { Controller, Get, HttpStatus, Param, Query, Res } from '@nestjs/common';
import { relationBoardQuerySchema, relationHistoryQuerySchema, type RelationBoard, type RelationHistoryPage, type RelationLinkDetail } from '@notstack/shared';
import type { Response } from 'express';
import { createZodDto } from '../common/dto/create-zod-dto';
import { ApiException } from '../common/exceptions/api.exception';
import { ResultCache } from '../common/utils/result-cache';
import { GuildId } from '../guilds/decorators/guild-id.decorator';
import { GuildRoute } from '../guilds/decorators/guild-route.decorator';
import { RelationsService } from './relations.service';

class RelationBoardQueryDto extends createZodDto(relationBoardQuerySchema) {}
class RelationHistoryQueryDto extends createZodDto(relationHistoryQuerySchema) {}

const CACHE_MS = 60_000;
const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

function assertUserId(...ids: string[]): void {
    if (ids.some((id) => !/^\d{5,25}$/.test(id))) throw new ApiException(HttpStatus.BAD_REQUEST, 'รหัสผู้ใช้ไม่ถูกต้อง');
}

// ==========================================
// 🕵️ RELATIONS — /api/guilds/:guildId/relations (กระดานความสัมพันธ์ของสมาชิก)
// ==========================================
@GuildRoute()
@Controller('guilds/:guildId/relations')
export class RelationsController {
    // คำนวณจาก log ทั้งช่วง + ถาม Discord ว่าใครยังอยู่ จึงแชร์ผลลัพธ์ระหว่างคำขอที่มาใกล้ๆ กัน
    private readonly boards = new ResultCache<RelationBoard>(CACHE_MS, 32, 16 * 1024 * 1024, size);
    private readonly links = new ResultCache<RelationLinkDetail>(CACHE_MS, 128, 8 * 1024 * 1024, size);

    constructor(private readonly relations: RelationsService) {}

    @Get()
    board(@GuildId() guildId: string, @Query() query: RelationBoardQueryDto, @Res({ passthrough: true }) res: Response): Promise<RelationBoard> {
        const includeBots = Boolean(query.includeBots);
        res.set('Cache-Control', 'no-store');
        return this.boards.get(`${guildId}:${query.days}:${includeBots}`, () => this.relations.board(guildId, query.days, includeBots));
    }

    @Get('links/:a/:b')
    link(@GuildId() guildId: string, @Param('a') a: string, @Param('b') b: string, @Query() query: RelationBoardQueryDto): Promise<RelationLinkDetail> {
        assertUserId(a, b);
        return this.links.get(`${guildId}:${[a, b].sort().join(':')}:${query.days}`, () => this.relations.linkDetail(guildId, a, b, query.days));
    }

    @Get('people/:userId/history')
    history(@GuildId() guildId: string, @Param('userId') userId: string, @Query() query: RelationHistoryQueryDto): Promise<RelationHistoryPage> {
        assertUserId(userId);
        return this.relations.history(guildId, userId, query.cursor);
    }
}
