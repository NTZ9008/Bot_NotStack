import { Controller, Get, Header } from '@nestjs/common';
import type { GrowthResponse } from '@notstack/shared';
import { Public } from '../common/decorators/public.decorator';
import { GrowthService } from './growth.service';

// GET /api/growth (ไม่ต้อง login) — กราฟการเติบโตของโปรเจกต์ในหน้า landing
@Public()
@Controller('growth')
export class GrowthController {
    constructor(private readonly growth: GrowthService) {}

    @Get()
    @Header('Cache-Control', 'public, max-age=300')
    async get(): Promise<GrowthResponse> {
        return { stats: await this.growth.stats() };
    }
}
