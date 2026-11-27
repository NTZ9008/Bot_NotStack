import { REMINDER_LIMITS, REMINDER_TIMEZONE, type ReminderScheduleType } from '@notstack/shared';
import { CronTime } from 'cron';
import { z } from 'zod';
import { badRequest } from '../../common/exceptions/api.exception';

/**
 * ตรวจสอบ Cron Expression ด้วย CronTime จากแพ็กเกจ cron ตามโซนเวลาที่กำหนด
 */
export function isValidCronTime(expression: string, timezone: string = REMINDER_TIMEZONE): boolean {
    const trimmed = expression.trim();
    if (!trimmed || trimmed.length > REMINDER_LIMITS.maxCronLength) return false;
    try {
        const ct = new CronTime(trimmed, timezone);
        ct.getNextDateFrom(new Date(), timezone);
        return true;
    } catch {
        return false;
    }
}

export const cronTimeSchema = z
    .string()
    .trim()
    .min(1, 'กรุณาระบุ Cron Expression')
    .max(REMINDER_LIMITS.maxCronLength, 'Cron Expression ยาวเกินกำหนด')
    .refine((value) => isValidCronTime(value, REMINDER_TIMEZONE), 'รูปแบบ Cron Expression ไม่ถูกต้อง');

export interface ComputeNextRunParams {
    scheduleType: ReminderScheduleType | string;
    cronExpression: string | null;
    runAt: Date | null;
    timezone?: string | null;
}

/**
 * คำนวณเวลาส่งรอบถัดไป (nextRunAt) ด้วย CronTime สำหรับรายการแบบทำซ้ำ หรือคืนค่า runAt สำหรับ ONCE
 */
export function computeNextRunAt(params: ComputeNextRunParams, fromDate: Date = new Date()): Date | null {
    if (params.scheduleType === 'ONCE') {
        return params.runAt ?? null;
    }

    const expression = params.cronExpression?.trim();
    if (!expression) return null;

    const tz = params.timezone?.trim() || REMINDER_TIMEZONE;
    try {
        const ct = new CronTime(expression, tz);
        return ct.getNextDateFrom(fromDate, tz).toJSDate();
    } catch {
        throw badRequest('รูปแบบ Cron Expression ไม่ถูกต้อง');
    }
}
