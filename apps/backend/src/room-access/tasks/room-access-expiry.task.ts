import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DiscordService } from '../../discord/discord.service';
import { PrismaService } from '../../prisma/prisma.service';
import { isGuildChannel } from '../room-access.service';

const NOTIFY_BEFORE_MS = 5 * 60 * 1000;

// เช็คทุก 5 วินาที (ทุกเซิร์ฟเวอร์): หมดเวลา → ถอนสิทธิ์ + DM แจ้ง, ใกล้หมด (5 นาที) → เตือนครั้งเดียว
@Injectable()
export class RoomAccessExpiryTask {
    private readonly logger = new Logger('RoomAccess');
    private checking = false;

    constructor(
        private readonly prisma: PrismaService,
        private readonly discord: DiscordService,
    ) {}

    @Interval(5000)
    async checkExpiry(): Promise<void> {
        if (!this.discord.ready || this.checking) return;
        this.checking = true;
        try {
            // เฉพาะตั๋วที่หมดแล้ว หรือเหลือไม่ถึง 5 นาที
            const records = await this.prisma.roomAccess.findMany({ where: { expireAt: { lte: new Date(Date.now() + NOTIFY_BEFORE_MS) } } });
            const now = Date.now();
            for (const record of records) {
                const expireAt = record.expireAt.getTime();
                if (now >= expireAt) {
                    try {
                        const channel = await this.discord.fetchGuildChannel(record.guildId, record.roomId);
                        if (isGuildChannel(channel)) {
                            await channel.permissionOverwrites.delete(record.userId).catch(() => {});
                            const user = await this.discord.fetchUser(record.userId);
                            user?.send(`❌ ตั๋วเข้าห้อง **${channel.name}** ของคุณหมดเวลาแล้ว`).catch(() => {});
                        }
                        await this.prisma.roomAccess.deleteMany({ where: { id: record.id } });
                    } catch (err) {
                        this.logger.error(`Error expiring room access: ${(err as Error).message}`);
                    }
                } else if (!record.notified) {
                    try {
                        const channel = await this.discord.fetchGuildChannel(record.guildId, record.roomId);
                        const user = await this.discord.fetchUser(record.userId);
                        if (user && isGuildChannel(channel)) {
                            user.send(`⚠️ ตั๋วเข้าห้อง **${channel.name}** ของคุณกำลังจะหมดเวลา!`).catch(() => {});
                            await this.prisma.roomAccess.updateMany({ where: { id: record.id }, data: { notified: true } });
                        }
                    } catch (err) {
                        this.logger.error(`Error notifying room access expiry: ${(err as Error).message}`);
                    }
                }
            }
        } catch (err) {
            this.logger.error(`Error in room access schedule task: ${(err as Error).message}`);
        } finally {
            this.checking = false;
        }
    }
}
