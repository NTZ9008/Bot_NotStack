import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { DiscordService } from '../discord/discord.service';
import { PrismaService } from '../prisma/prisma.service';

export interface HealthResponse {
    status: 'ok' | 'error';
    database: boolean;
    // false ได้ถ้าไม่ได้ตั้ง TOKEN หรือบอทยังเชื่อมต่อ Discord ไม่เสร็จ — ไม่นับเป็น error ของ API
    discord: boolean;
    uptimeSec: number;
}

// ==========================================
// ❤️ HEALTH — GET /api/health (ไม่ต้อง login) สำหรับเช็คหลัง deploy / ระบบเฝ้าดู uptime
// 200 = API + ฐานข้อมูลใช้ได้, 503 = ต่อฐานข้อมูลไม่ได้
// ==========================================
@Public()
@Controller('health')
export class HealthController {
    constructor(
        private readonly prisma: PrismaService,
        private readonly discord: DiscordService,
    ) {}

    @Get()
    async check(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
        const database = await this.prisma.$queryRaw`SELECT 1`.then(
            () => true,
            () => false,
        );
        res.status(database ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
        res.setHeader('Cache-Control', 'no-store');
        return { status: database ? 'ok' : 'error', database, discord: this.discord.ready !== null, uptimeSec: Math.round(process.uptime()) };
    }
}
