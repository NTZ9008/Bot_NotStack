import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AuditService } from '../../audit/audit.service';
import { UsersService } from '../../users/users.service';
import { TokensService } from '../tokens.service';

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

// สร้างผู้ดูแลระบบคนแรกจาก .env + ล้าง refresh token ที่หมดอายุ / audit log เก่าเกินกำหนด (ทุก 6 ชั่วโมง)
@Injectable()
export class AuthMaintenanceTask implements OnApplicationBootstrap {
    private readonly logger = new Logger('Auth');

    constructor(
        private readonly users: UsersService,
        private readonly tokens: TokensService,
        private readonly audit: AuditService,
    ) {}

    onApplicationBootstrap(): void {
        this.users.seedAdminFromEnv().catch((err: Error) => this.logger.error(`สร้างผู้ดูแลระบบเริ่มต้นไม่สำเร็จ: ${err.message}`));
        void this.cleanup();
    }

    @Interval(CLEANUP_INTERVAL_MS)
    async cleanup(): Promise<void> {
        try {
            await this.tokens.deleteExpired();
            await this.audit.deleteOld();
        } catch (err) {
            this.logger.error(`ล้างข้อมูลเก่าไม่สำเร็จ: ${(err as Error).message}`);
        }
    }
}
