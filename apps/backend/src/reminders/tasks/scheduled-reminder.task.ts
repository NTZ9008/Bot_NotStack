import { Injectable, Logger, Optional } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { mapConcurrent } from '../../common/utils/map-concurrent';
import { DiscordService } from '../../discord/discord.service';
import { PluginsService } from '../../plugins/plugins.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RemindersService } from '../reminders.service';

const TICK_MS = 15_000;
const BATCH_LIMIT = 100;
const SEND_CONCURRENCY = 5;

// ==========================================
// ⏱️ WORKER — ตรวจรายการแจ้งเตือนที่ถึงกำหนดทุก 15 วินาที (เฉพาะเซิร์ฟเวอร์ที่ติดตั้งปลั๊กอิน)
// ==========================================
@Injectable()
export class ScheduledReminderTask {
    private readonly logger = new Logger('Reminders');
    private running = false;

    constructor(
        private readonly prisma: PrismaService,
        private readonly reminders: RemindersService,
        @Optional() private readonly plugins?: PluginsService,
        @Optional() private readonly discord?: DiscordService,
    ) {}

    @Interval(TICK_MS)
    async tick(): Promise<void> {
        if (this.running) return;
        if (this.discord && !this.discord.ready) return;

        this.running = true;
        try {
            const now = new Date();
            const due = await this.prisma.scheduledReminder.findMany({
                where: { enabled: true, nextRunAt: { lte: now } },
                orderBy: [{ nextRunAt: 'asc' }, { id: 'asc' }],
                take: BATCH_LIMIT,
            });
            if (due.length === 0) return;

            const guildStatus = new Map<string, boolean>();
            if (this.plugins) {
                const uniqueGuilds = [...new Set(due.map((r) => r.guildId))];
                await Promise.all(
                    uniqueGuilds.map(async (guildId) => {
                        guildStatus.set(guildId, await this.plugins!.isInstalled(guildId, 'scheduled-reminders'));
                    }),
                );
            }

            const eligible = this.plugins ? due.filter((r) => guildStatus.get(r.guildId) === true) : due;
            if (eligible.length === 0) return;

            await mapConcurrent(eligible, SEND_CONCURRENCY, async (reminder) => {
                try {
                    await this.reminders.executeDueReminder(reminder, now);
                } catch (err) {
                    this.logger.error(
                        `ประมวลผล Reminder #${reminder.id} (${reminder.guildId}) ผิดพลาด: ${err instanceof Error ? err.message : String(err)}`,
                    );
                }
            });
        } catch (err) {
            this.logger.error(`Scheduled reminder worker error: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            this.running = false;
        }
    }
}
