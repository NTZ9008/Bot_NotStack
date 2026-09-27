import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Env } from '../config/env.validation';
import { PrismaClient } from '../generated/prisma/client';

// ==========================================
// 🐘 PRISMA — client ตัวเดียวใช้ทั้ง backend (PostgreSQL ผ่าน driver adapter)
// ==========================================
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
    constructor(config: ConfigService<Env, true>) {
        super({ adapter: new PrismaPg({ connectionString: config.get('DATABASE_URL', { infer: true }) }) });
    }

    async onModuleDestroy(): Promise<void> {
        await this.$disconnect();
    }
}
