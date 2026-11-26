import { Injectable, Logger, Optional } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { mapConcurrent } from '../../common/utils/map-concurrent';
import { PluginsService } from '../../plugins/plugins.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UptimeService } from '../uptime.service';

const TICK_MS = 30_000;
const PRUNE_EVERY_MS = 60 * 60 * 1000;
const CHECK_CONCURRENCY = 5;
const BATCH_LIMIT = 100;

// ==========================================
// ⏱️ WORKER — ตรวจ Target ที่ถึงเวลาทุก 30 วินาที (เฉพาะเซิร์ฟเวอร์ที่ติดตั้งปลั๊กอิน)
// ==========================================
@Injectable()
export class UptimeMonitorTask {
    private readonly logger = new Logger('Uptime');
    private running = false;
    private lastPrunedAt = 0;

    constructor(
        private readonly prisma: PrismaService,
        private readonly uptime: UptimeService,
        @Optional() private readonly plugins?: PluginsService,
    ) {}

    @Interval(TICK_MS)
    async tick(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            const now = new Date();
            const due = await this.prisma.uptimeTarget.findMany({
                where: { enabled: true, nextCheckAt: { lte: now } },
                orderBy: [{ nextCheckAt: 'asc' }, { id: 'asc' }],
                take: BATCH_LIMIT,
            });

            if (due.length > 0) {
                const guildStatus = new Map<string, boolean>();
                if (this.plugins) {
                    const uniqueGuilds = [...new Set(due.map((t) => t.guildId))];
                    await Promise.all(
                        uniqueGuilds.map(async (guildId) => {
                            guildStatus.set(guildId, await this.plugins!.isInstalled(guildId, 'uptime-monitor'));
                        }),
                    );
                }

                const eligible = this.plugins ? due.filter((t) => guildStatus.get(t.guildId) === true) : due;
                await mapConcurrent(eligible, CHECK_CONCURRENCY, async (target) => {
                    try {
                        await this.uptime.executeCheck(target);
                    } catch (err) {
                        this.logger.error(`ตรวจสอบ Uptime #${target.id} (${target.guildId}) ผิดพลาด: ${err instanceof Error ? err.message : String(err)}`);
                    }
                });
            }

            if (Date.now() - this.lastPrunedAt >= PRUNE_EVERY_MS) {
                this.lastPrunedAt = Date.now();
                await this.uptime.pruneOldLogs();
            }
        } catch (err) {
            this.logger.error(`Uptime monitor worker error: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            this.running = false;
        }
    }
}
