import { Injectable, Logger } from '@nestjs/common';
import type { PrBotCounts, PrBotNotificationKind, PrBotStats, PrBotStatsDays } from '@notstack/shared';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 86_400_000;
const THAI_OFFSET_MS = 7 * 3_600_000;
const counts = (): PrBotCounts => ({ sent: 0, merged: 0, closed: 0 });

@Injectable()
export class PrBotStatsService {
    private readonly logger = new Logger('PrBotStats');

    constructor(private readonly prisma: PrismaService) {}

    async record(guildId: string, messageId: string, kind: PrBotNotificationKind): Promise<void> {
        try {
            await this.prisma.prNotification.createMany({
                data: [{ guildId, messageId, kind }],
                skipDuplicates: true,
            });
        } catch (err) {
            // Statistics must not turn a successful Discord delivery into a failed webhook.
            this.logger.error('Unable to record PR notification statistics', err);
        }
    }

    async read(guildId: string, days: PrBotStatsDays, now = new Date()): Promise<PrBotStats> {
        const today = Math.floor((now.getTime() + THAI_OFFSET_MS) / DAY_MS) * DAY_MS;
        const firstDay = today - (days - 1) * DAY_MS;
        const from = new Date(firstDay - THAI_OFFSET_MS);
        const daily = Array.from({ length: days }, (_, index) => ({
            label: new Date(firstDay + index * DAY_MS).toISOString().slice(0, 10),
            ...counts(),
        }));
        const hourly = Array.from({ length: 24 }, (_, hour) => ({ label: `${String(hour).padStart(2, '0')}:00`, ...counts() }));
        const totals = counts();
        const rows = await this.prisma.$queryRaw<{ day: string; hour: number; kind: string; total: bigint }[]>`
            SELECT to_char(created_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS day,
                   extract(hour FROM created_at AT TIME ZONE 'Asia/Bangkok')::int AS hour,
                   kind, count(*) AS total
            FROM pr_notifications
            WHERE guild_id = ${guildId} AND created_at >= ${from.toISOString()}::timestamptz AND created_at <= ${now.toISOString()}::timestamptz
            GROUP BY day, hour, kind
        `;
        const daysByLabel = new Map(daily.map((bucket) => [bucket.label, bucket]));
        for (const row of rows) {
            if (row.kind !== 'sent' && row.kind !== 'merged' && row.kind !== 'closed') continue;
            const day = daysByLabel.get(row.day);
            const hour = hourly[row.hour];
            if (!day || !hour) continue;
            const total = Number(row.total);
            day[row.kind] += total;
            hour[row.kind] += total;
            totals[row.kind] += total;
        }
        return { range: { from: from.toISOString(), to: now.toISOString(), days, timeZone: 'Asia/Bangkok' }, totals, daily, hourly };
    }
}
