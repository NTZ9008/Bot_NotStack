import { z } from 'zod';
import { HEX_COLOR_RE, SNOWFLAKE_RE } from './common';

// ==========================================
// ⏰ SCHEDULED REMINDERS — ระบบแจ้งเตือนและนัดหมายตามเวลาแยกตามเซิร์ฟเวอร์
// ==========================================

export const REMINDER_TIMEZONE = 'Asia/Bangkok' as const;

export const REMINDER_SCHEDULE_TYPES = ['ONCE', 'DAILY', 'WEEKLY', 'CRON'] as const;
export type ReminderScheduleType = (typeof REMINDER_SCHEDULE_TYPES)[number];

export const REMINDER_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export const REMINDER_DEFAULT_EMBED_COLOR = '#5865f2' as const;

export const REMINDER_LIMITS = {
    maxPerGuild: 50,
    maxTitleLength: 150,
    maxMessageLength: 1900,
    maxCronLength: 100,
} as const;

const CRON_ALIASES = new Set(['@yearly', '@annually', '@monthly', '@weekly', '@daily', '@midnight', '@hourly']);

const MONTH_NAMES: Record<string, number> = {
    JAN: 1,
    FEB: 2,
    MAR: 3,
    APR: 4,
    MAY: 5,
    JUN: 6,
    JUL: 7,
    AUG: 8,
    SEP: 9,
    OCT: 10,
    NOV: 11,
    DEC: 12,
};

const DOW_NAMES: Record<string, number> = {
    SUN: 0,
    MON: 1,
    TUE: 2,
    WED: 3,
    THU: 4,
    FRI: 5,
    SAT: 6,
};

function parseCronAtom(raw: string, min: number, max: number, aliases?: Record<string, number>): number | null {
    const upper = raw.toUpperCase();
    if (aliases && upper in aliases) return aliases[upper]!;
    if (!/^\d+$/.test(raw)) return null;
    const num = Number(raw);
    if (!Number.isInteger(num) || num < min || num > max) return null;
    return num;
}

function isValidCronField(field: string, min: number, max: number, aliases?: Record<string, number>): boolean {
    if (!field) return false;
    const segments = field.split(',');
    for (const seg of segments) {
        if (!seg) return false;
        const slashParts = seg.split('/');
        if (slashParts.length > 2) return false;
        const [rangePart, stepPart] = slashParts;
        if (!rangePart) return false;

        if (stepPart !== undefined) {
            if (!/^\d+$/.test(stepPart)) return false;
            const step = Number(stepPart);
            if (!Number.isInteger(step) || step <= 0) return false;
        }

        if (rangePart === '*') continue;

        const dashParts = rangePart.split('-');
        if (dashParts.length > 2) return false;
        if (dashParts.length === 1) {
            if (parseCronAtom(dashParts[0]!, min, max, aliases) === null) return false;
        } else {
            const start = parseCronAtom(dashParts[0]!, min, max, aliases);
            const end = parseCronAtom(dashParts[1]!, min, max, aliases);
            if (start === null || end === null || start > end) return false;
        }
    }
    return true;
}

/**
 * ตรวจสอบรูปแบบ Cron Expression เบื้องต้น (5 ช่องมาตรฐาน, 6 ช่องรวมวินาที, หรือ alias เช่น @daily)
 */
export function isValidCronSyntax(expr: string): boolean {
    const trimmed = expr.trim();
    if (!trimmed || trimmed.length > REMINDER_LIMITS.maxCronLength) return false;
    if (CRON_ALIASES.has(trimmed.toLowerCase())) return true;

    const parts = trimmed.split(/\s+/);
    if (parts.length !== 5 && parts.length !== 6) return false;

    const offset = parts.length === 6 ? 1 : 0;
    if (offset === 1 && !isValidCronField(parts[0]!, 0, 59)) return false;

    return (
        isValidCronField(parts[offset]!, 0, 59) &&
        isValidCronField(parts[offset + 1]!, 0, 23) &&
        isValidCronField(parts[offset + 2]!, 1, 31) &&
        isValidCronField(parts[offset + 3]!, 1, 12, MONTH_NAMES) &&
        isValidCronField(parts[offset + 4]!, 0, 7, DOW_NAMES)
    );
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** แปลงเวลา 'HH:mm' เป็น Cron รายวัน เช่น '09:30' -> '30 9 * * *' */
export function buildDailyCron(time: string): string {
    const m = TIME_RE.exec(time.trim());
    if (!m) return '';
    return `${Number(m[2])} ${Number(m[1])} * * *`;
}

/** แปลง Cron รายวัน ('M H * * *') กลับเป็น 'HH:mm' */
export function parseDailyCron(cron: string | null | undefined): string | null {
    if (!cron) return null;
    const m = /^\s*(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*\s*$/.exec(cron);
    if (!m) return null;
    const minute = Number(m[1]);
    const hour = Number(m[2]);
    if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** แปลงเวลา 'HH:mm' และวันในสัปดาห์ (0=อา .. 6=ส) เป็น Cron รายสัปดาห์ */
export function buildWeeklyCron(time: string, days: number[]): string {
    const m = TIME_RE.exec(time.trim());
    if (!m) return '';
    const uniqueDays = [...new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
    if (uniqueDays.length === 0) return '';
    return `${Number(m[2])} ${Number(m[1])} * * ${uniqueDays.join(',')}`;
}

/** แปลง Cron รายสัปดาห์ ('M H * * d1,d2') กลับเป็น { time, days } */
export function parseWeeklyCron(cron: string | null | undefined): { time: string; days: number[] } | null {
    if (!cron) return null;
    const m = /^\s*(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+([0-7](?:,[0-7])*)\s*$/.exec(cron);
    if (!m) return null;
    const minute = Number(m[1]);
    const hour = Number(m[2]);
    if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;
    const days = [...new Set(m[3]!.split(',').map((d) => (Number(d) === 7 ? 0 : Number(d))))].sort((a, b) => a - b);
    return {
        time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
        days,
    };
}

const NAIVE_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** แปลงค่าวันเวลาจาก DateTimeInput (YYYY-MM-DDTHH:mm) หรือ ISO string เป็น Date โดยตีความค่าที่ไม่มี timezone เป็น Asia/Bangkok (+07:00) */
export function parseBangkokDateTimeInput(value: string): Date | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const naive = NAIVE_DATETIME_RE.exec(trimmed);
    if (naive) {
        const iso = naive[6] ? `${trimmed}+07:00` : `${trimmed}:00+07:00`;
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
}

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** แปลง Date/ISO เป็นสตริง YYYY-MM-DDTHH:mm ในเวลา Asia/Bangkok สำหรับ DateTimeInput */
export function formatBangkokDateTimeInput(iso: string | Date | null | undefined): string {
    if (!iso) return '';
    const d = iso instanceof Date ? iso : new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return new Date(d.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 16);
}

export const cronExpressionSchema = z
    .string()
    .trim()
    .min(1, 'กรุณาระบุ Cron Expression')
    .max(REMINDER_LIMITS.maxCronLength, 'Cron Expression ยาวเกินกำหนด')
    .refine(isValidCronSyntax, 'รูปแบบ Cron Expression ไม่ถูกต้อง');

const reminderCommonFields = {
    title: z
        .string()
        .trim()
        .min(1, 'กรุณากรอกหัวข้อแจ้งเตือน')
        .max(REMINDER_LIMITS.maxTitleLength, 'หัวข้อแจ้งเตือนยาวเกินกำหนด'),
    channelId: z.string().trim().regex(SNOWFLAKE_RE, 'กรุณาเลือกห้องแจ้งเตือน'),
    message: z
        .string()
        .trim()
        .min(1, 'กรุณากรอกข้อความแจ้งเตือน')
        .max(REMINDER_LIMITS.maxMessageLength, 'ข้อความแจ้งเตือนยาวเกินกำหนด'),
    embedColor: z
        .union([z.string().trim().regex(HEX_COLOR_RE, 'รหัสสีต้องเป็น #RRGGBB'), z.literal(''), z.null()])
        .transform((v) => (v ? v.toLowerCase() : null))
        .optional(),
    mentionRoleId: z
        .union([z.string().trim().regex(SNOWFLAKE_RE, 'Role ID ไม่ถูกต้อง'), z.literal(''), z.null()])
        .transform((v) => (v ? v : null))
        .optional(),
    scheduleType: z.enum(REMINDER_SCHEDULE_TYPES, { error: 'รูปแบบการตั้งเวลาไม่ถูกต้อง' }),
    cronExpression: z
        .union([z.string().trim().max(REMINDER_LIMITS.maxCronLength, 'Cron Expression ยาวเกินกำหนด'), z.literal(''), z.null()])
        .transform((v) => (v ? v : null))
        .optional(),
    runAt: z
        .union([z.string().trim(), z.literal(''), z.null()])
        .transform((v) => (v ? v : null))
        .optional(),
};

export const reminderInputSchema = z
    .object({
        ...reminderCommonFields,
        useEmbed: z.boolean().default(true),
        timezone: z.string().trim().min(1).max(64).default(REMINDER_TIMEZONE).optional(),
        enabled: z.boolean().default(true).optional(),
    })
    .superRefine((data, ctx) => {
        if (data.scheduleType === 'ONCE') {
            const parsed = data.runAt ? parseBangkokDateTimeInput(data.runAt) : null;
            if (!parsed) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['runAt'],
                    message: 'กรุณาระบุวันและเวลาที่ต้องการส่ง',
                });
            }
            return;
        }

        if (!data.cronExpression || !isValidCronSyntax(data.cronExpression)) {
            ctx.addIssue({
                code: 'custom',
                path: ['cronExpression'],
                message: 'รูปแบบ Cron Expression ไม่ถูกต้อง',
            });
        }
    });

export const updateReminderSchema = z
    .object({
        ...reminderCommonFields,
        useEmbed: z.boolean(),
        timezone: z.string().trim().min(1).max(64),
        enabled: z.boolean(),
    })
    .partial()
    .superRefine((data, ctx) => {
        if (data.cronExpression && !isValidCronSyntax(data.cronExpression)) {
            ctx.addIssue({
                code: 'custom',
                path: ['cronExpression'],
                message: 'รูปแบบ Cron Expression ไม่ถูกต้อง',
            });
        }
        if (data.runAt && !parseBangkokDateTimeInput(data.runAt)) {
            ctx.addIssue({
                code: 'custom',
                path: ['runAt'],
                message: 'วันและเวลาที่ต้องการส่งไม่ถูกต้อง',
            });
        }
        if (data.scheduleType === 'ONCE' && data.runAt === null) {
            ctx.addIssue({
                code: 'custom',
                path: ['runAt'],
                message: 'กรุณาระบุวันและเวลาที่ต้องการส่ง',
            });
        }
        if (data.scheduleType && data.scheduleType !== 'ONCE' && data.cronExpression === null) {
            ctx.addIssue({
                code: 'custom',
                path: ['cronExpression'],
                message: 'รูปแบบ Cron Expression ไม่ถูกต้อง',
            });
        }
    })
    .refine((obj) => Object.keys(obj).length > 0, 'ต้องระบุข้อมูลอย่างน้อย 1 ฟิลด์');

export type CreateReminderInput = z.input<typeof reminderInputSchema>;
export type ParsedCreateReminderInput = z.output<typeof reminderInputSchema>;
export type UpdateReminderInput = z.input<typeof updateReminderSchema>;
export type ParsedUpdateReminderInput = z.output<typeof updateReminderSchema>;

export interface ScheduledReminderItem {
    id: number;
    guildId: string;
    title: string;
    channelId: string;
    message: string;
    useEmbed: boolean;
    embedColor: string | null;
    mentionRoleId: string | null;
    scheduleType: ReminderScheduleType;
    cronExpression: string | null;
    runAt: string | null;
    timezone: string;
    enabled: boolean;
    nextRunAt: string | null;
    lastRunAt: string | null;
    lastError: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface RemindersListResponse {
    reminders: ScheduledReminderItem[];
    summary: {
        total: number;
        enabled: number;
        recurring: number;
        oncePending: number;
    };
}
