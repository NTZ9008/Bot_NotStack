import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
    HEX_COLOR_RE,
    REMINDER_DEFAULT_EMBED_COLOR,
    REMINDER_LIMITS,
    REMINDER_SCHEDULE_TYPES,
    REMINDER_TIMEZONE,
    parseBangkokDateTimeInput,
    type CreateReminderInput,
    type ReminderScheduleType,
    type RemindersListResponse,
    type ScheduledReminderItem,
    type UpdateReminderInput,
} from '@notstack/shared';
import { EmbedBuilder } from 'discord.js';
import { ApiException, badRequest, notFound } from '../common/exceptions/api.exception';
import { DiscordService } from '../discord/discord.service';
import type { ScheduledReminder } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { computeNextRunAt, cronTimeSchema } from './utils/reminder-schedule';

const normalizeScheduleType = (value: string): ReminderScheduleType =>
    REMINDER_SCHEDULE_TYPES.includes(value as ReminderScheduleType) ? (value as ReminderScheduleType) : 'CRON';

// ==========================================
// ⏰ REMINDERS SERVICE — CRUD นัดหมายแจ้งเตือน, ทดสอบส่ง และประมวลผลเมื่อถึงเวลา
// ==========================================
@Injectable()
export class RemindersService {
    private readonly logger = new Logger('Reminders');

    constructor(
        private readonly prisma: PrismaService,
        private readonly discord: DiscordService,
    ) {}

    private async assertValidChannel(guildId: string, channelId: string): Promise<void> {
        if (!this.discord.ready) return;
        const channel = await this.discord.fetchGuildChannel(guildId, channelId);
        if (!channel?.isSendable()) {
            throw badRequest('ไม่พบห้องแจ้งเตือนนี้ในเซิร์ฟเวอร์ หรือบอทไม่สามารถส่งข้อความในห้องนี้ได้');
        }
    }

    private async requireReminder(guildId: string, id: number): Promise<ScheduledReminder> {
        const row = await this.prisma.scheduledReminder.findFirst({ where: { id, guildId } });
        if (!row) throw notFound('ไม่พบรายการแจ้งเตือนนี้');
        return row;
    }

    private toItem(row: ScheduledReminder): ScheduledReminderItem {
        return {
            id: row.id,
            guildId: row.guildId,
            title: row.title,
            channelId: row.channelId,
            message: row.message,
            useEmbed: row.useEmbed,
            embedColor: row.embedColor,
            mentionRoleId: row.mentionRoleId,
            scheduleType: normalizeScheduleType(row.scheduleType),
            cronExpression: row.cronExpression,
            runAt: row.runAt ? row.runAt.toISOString() : null,
            timezone: row.timezone,
            enabled: row.enabled,
            nextRunAt: row.nextRunAt ? row.nextRunAt.toISOString() : null,
            lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
            lastError: row.lastError,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
        };
    }

    async list(guildId: string): Promise<RemindersListResponse> {
        const rows = await this.prisma.scheduledReminder.findMany({
            where: { guildId },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        const reminders = rows.map((row) => this.toItem(row));

        let enabled = 0;
        let recurring = 0;
        let oncePending = 0;
        for (const item of reminders) {
            if (item.enabled) enabled += 1;
            if (item.scheduleType === 'ONCE') {
                if (item.enabled && item.nextRunAt) oncePending += 1;
            } else {
                recurring += 1;
            }
        }

        return {
            reminders,
            summary: {
                total: reminders.length,
                enabled,
                recurring,
                oncePending,
            },
        };
    }

    async create(guildId: string, input: CreateReminderInput): Promise<ScheduledReminderItem> {
        const existingCount = await this.prisma.scheduledReminder.count({ where: { guildId } });
        if (existingCount >= REMINDER_LIMITS.maxPerGuild) {
            throw badRequest(`สร้างรายการแจ้งเตือนได้สูงสุด ${REMINDER_LIMITS.maxPerGuild} รายการต่อเซิร์ฟเวอร์`);
        }

        await this.assertValidChannel(guildId, input.channelId);

        const timezone = input.timezone?.trim() || REMINDER_TIMEZONE;
        const enabled = input.enabled ?? true;
        const useEmbed = input.useEmbed ?? true;
        const embedColor = useEmbed ? (input.embedColor ? input.embedColor.toLowerCase() : REMINDER_DEFAULT_EMBED_COLOR) : null;

        let cronExpression: string | null = null;
        let runAt: Date | null = null;
        let nextRunAt: Date | null = null;

        if (input.scheduleType === 'ONCE') {
            const parsedRunAt = input.runAt ? parseBangkokDateTimeInput(input.runAt) : null;
            if (!parsedRunAt) throw badRequest('กรุณาระบุวันและเวลาที่ต้องการส่ง');
            if (enabled && parsedRunAt.getTime() <= Date.now()) {
                throw badRequest('วันและเวลาที่ตั้งส่งต้องอยู่ในอนาคต');
            }
            runAt = parsedRunAt;
            nextRunAt = enabled ? parsedRunAt : null;
        } else {
            const validatedCron = cronTimeSchema.safeParse(input.cronExpression ?? '');
            if (!validatedCron.success) {
                throw badRequest(validatedCron.error.issues[0]?.message ?? 'รูปแบบ Cron Expression ไม่ถูกต้อง');
            }
            cronExpression = validatedCron.data;
            nextRunAt = enabled
                ? computeNextRunAt({ scheduleType: input.scheduleType, cronExpression, runAt: null, timezone })
                : null;
        }

        const created = await this.prisma.scheduledReminder.create({
            data: {
                guildId,
                title: input.title.trim(),
                channelId: input.channelId.trim(),
                message: input.message.trim(),
                useEmbed,
                embedColor,
                mentionRoleId: input.mentionRoleId || null,
                scheduleType: input.scheduleType,
                cronExpression,
                runAt,
                timezone,
                enabled,
                nextRunAt,
            },
        });
        return this.toItem(created);
    }

    async update(guildId: string, id: number, input: UpdateReminderInput): Promise<ScheduledReminderItem> {
        const current = await this.requireReminder(guildId, id);
        if (input.channelId !== undefined) {
            await this.assertValidChannel(guildId, input.channelId);
        }

        const scheduleType = normalizeScheduleType(input.scheduleType ?? current.scheduleType);
        const timezone = input.timezone?.trim() || current.timezone || REMINDER_TIMEZONE;
        const enabled = input.enabled ?? current.enabled;
        const useEmbed = input.useEmbed ?? current.useEmbed;

        let embedColor = current.embedColor;
        if (input.embedColor !== undefined) {
            embedColor = input.embedColor ? input.embedColor.toLowerCase() : null;
        }
        if (useEmbed && !embedColor) {
            embedColor = REMINDER_DEFAULT_EMBED_COLOR;
        } else if (!useEmbed && input.useEmbed === false && input.embedColor === undefined) {
            embedColor = null;
        }

        let cronExpression: string | null = current.cronExpression;
        let runAt: Date | null = current.runAt;
        let nextRunAt: Date | null = current.nextRunAt;

        if (scheduleType === 'ONCE') {
            cronExpression = null;
            if (input.runAt !== undefined) {
                const parsedRunAt = input.runAt ? parseBangkokDateTimeInput(input.runAt) : null;
                if (!parsedRunAt) throw badRequest('กรุณาระบุวันและเวลาที่ต้องการส่ง');
                runAt = parsedRunAt;
            }
            if (!runAt) throw badRequest('กรุณาระบุวันและเวลาที่ต้องการส่ง');

            const scheduleTouched = input.scheduleType !== undefined || input.runAt !== undefined || (input.enabled === true && !current.enabled);
            if (enabled && scheduleTouched && runAt.getTime() <= Date.now()) {
                throw badRequest('วันและเวลาที่ตั้งส่งต้องอยู่ในอนาคต กรุณาแก้ไขวันเวลาก่อนเปิดใช้งาน');
            }
            nextRunAt = enabled ? runAt : null;
        } else {
            runAt = null;
            const rawCron = input.cronExpression !== undefined ? input.cronExpression : current.cronExpression;
            const validatedCron = cronTimeSchema.safeParse(rawCron ?? '');
            if (!validatedCron.success) {
                throw badRequest(validatedCron.error.issues[0]?.message ?? 'รูปแบบ Cron Expression ไม่ถูกต้อง');
            }
            cronExpression = validatedCron.data;

            if (!enabled) {
                nextRunAt = null;
            } else {
                const shouldRecompute =
                    input.scheduleType !== undefined ||
                    input.cronExpression !== undefined ||
                    input.timezone !== undefined ||
                    (input.enabled === true && !current.enabled) ||
                    !current.nextRunAt;
                nextRunAt = shouldRecompute
                    ? computeNextRunAt({ scheduleType, cronExpression, runAt: null, timezone })
                    : current.nextRunAt;
            }
        }

        const updated = await this.prisma.scheduledReminder.update({
            where: { id: current.id },
            data: {
                ...(input.title !== undefined ? { title: input.title.trim() } : {}),
                ...(input.channelId !== undefined ? { channelId: input.channelId.trim() } : {}),
                ...(input.message !== undefined ? { message: input.message.trim() } : {}),
                useEmbed,
                embedColor,
                ...(input.mentionRoleId !== undefined ? { mentionRoleId: input.mentionRoleId || null } : {}),
                scheduleType,
                cronExpression,
                runAt,
                timezone,
                enabled,
                nextRunAt,
                ...(input.enabled === true && !current.enabled ? { lastError: null } : {}),
            },
        });
        return this.toItem(updated);
    }

    async remove(guildId: string, id: number): Promise<void> {
        await this.requireReminder(guildId, id);
        await this.prisma.scheduledReminder.delete({ where: { id } });
    }

    async testSend(guildId: string, id: number): Promise<ScheduledReminderItem> {
        const reminder = await this.requireReminder(guildId, id);
        this.discord.requireReady();

        const channel = await this.discord.fetchGuildChannel(reminder.guildId, reminder.channelId);
        if (!channel?.isSendable()) {
            throw badRequest('ไม่พบห้องแจ้งเตือนนี้ในเซิร์ฟเวอร์ หรือบอทไม่สามารถส่งข้อความในห้องนี้ได้');
        }

        try {
            await this.dispatchToChannel(channel, reminder, new Date());
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`ทดสอบส่ง Reminder #${reminder.id} (${reminder.guildId}) ไม่สำเร็จ: ${msg}`);
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, msg);
        }

        if (reminder.lastError) {
            const cleared = await this.prisma.scheduledReminder.update({
                where: { id: reminder.id },
                data: { lastError: null },
            });
            return this.toItem(cleared);
        }
        return this.toItem(reminder);
    }

    async executeDueReminder(reminder: ScheduledReminder, now: Date = new Date()): Promise<void> {
        if (!this.discord.ready) return;

        let nextState: { enabled?: boolean; nextRunAt: Date | null };
        try {
            nextState =
                reminder.scheduleType === 'ONCE'
                    ? { enabled: false, nextRunAt: null }
                    : { nextRunAt: computeNextRunAt(reminder, now) };
        } catch (err) {
            const errMessage = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Cron ของ Reminder #${reminder.id} (${reminder.guildId}) ไม่ถูกต้อง: ${errMessage}`);
            await this.prisma.scheduledReminder.update({
                where: { id: reminder.id },
                data: { enabled: false, nextRunAt: null, lastRunAt: now, lastError: errMessage.slice(0, 500) },
            });
            return;
        }

        try {
            const channel = await this.discord.fetchGuildChannel(reminder.guildId, reminder.channelId);
            if (!channel?.isSendable()) {
                throw new Error('ไม่พบห้องแจ้งเตือนนี้ในเซิร์ฟเวอร์ หรือบอทไม่สามารถส่งข้อความในห้องนี้ได้');
            }
            await this.dispatchToChannel(channel, reminder, now);
            await this.prisma.scheduledReminder.update({
                where: { id: reminder.id },
                data: {
                    lastRunAt: now,
                    lastError: null,
                    ...nextState,
                },
            });
        } catch (err) {
            const errMessage = err instanceof Error ? err.message : String(err);
            this.logger.warn(`ส่งแจ้งเตือนตามเวลา #${reminder.id} (${reminder.guildId}) ไม่สำเร็จ: ${errMessage}`);
            await this.prisma.scheduledReminder.update({
                where: { id: reminder.id },
                data: {
                    lastRunAt: now,
                    lastError: errMessage.slice(0, 500),
                    ...nextState,
                },
            });
        }
    }

    private async dispatchToChannel(
        channel: { send: (payload: Record<string, unknown>) => Promise<unknown> },
        reminder: ScheduledReminder,
        sentAt: Date,
    ): Promise<void> {
        const allowedMentions = reminder.mentionRoleId ? { roles: [reminder.mentionRoleId] } : { parse: [] as [] };

        if (reminder.useEmbed) {
            const color = HEX_COLOR_RE.test(reminder.embedColor ?? '') ? reminder.embedColor! : REMINDER_DEFAULT_EMBED_COLOR;
            const embed = new EmbedBuilder()
                .setColor(color as `#${string}`)
                .setTitle(reminder.title)
                .setDescription(reminder.message)
                .setTimestamp(sentAt);
            const content = reminder.mentionRoleId ? `<@&${reminder.mentionRoleId}>` : undefined;
            await channel.send({ content, embeds: [embed], allowedMentions });
            return;
        }

        const mentionPrefix = reminder.mentionRoleId ? `<@&${reminder.mentionRoleId}>\n` : '';
        const content = `${mentionPrefix}**${reminder.title}**\n${reminder.message}`.slice(0, 2000);
        await channel.send({ content, allowedMentions });
    }
}
