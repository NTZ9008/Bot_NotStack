import { REMINDER_TIMEZONE, reminderInputSchema, updateReminderSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';
import { isValidCronTime } from '../utils/reminder-schedule';

const backendReminderInputSchema = reminderInputSchema.superRefine((data, ctx) => {
    if (data.scheduleType !== 'ONCE' && data.cronExpression) {
        const tz = data.timezone || REMINDER_TIMEZONE;
        if (!isValidCronTime(data.cronExpression, tz)) {
            ctx.addIssue({
                code: 'custom',
                path: ['cronExpression'],
                message: 'รูปแบบ Cron Expression ไม่ถูกต้อง',
            });
        }
    }
});

const backendUpdateReminderSchema = updateReminderSchema.superRefine((data, ctx) => {
    if (data.cronExpression) {
        const tz = data.timezone || REMINDER_TIMEZONE;
        if (!isValidCronTime(data.cronExpression, tz)) {
            ctx.addIssue({
                code: 'custom',
                path: ['cronExpression'],
                message: 'รูปแบบ Cron Expression ไม่ถูกต้อง',
            });
        }
    }
});

export class CreateReminderDto extends createZodDto(backendReminderInputSchema) {}

export class UpdateReminderDto extends createZodDto(backendUpdateReminderSchema) {}
