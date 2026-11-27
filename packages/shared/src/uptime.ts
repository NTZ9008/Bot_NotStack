import { z } from 'zod';
import { SNOWFLAKE_RE } from './common';

// ==========================================
// 💓 UPTIME MONITOR — ตรวจสอบสถานะเว็บ / API อัตโนมัติแยกตามเซิร์ฟเวอร์
// ==========================================

export const UPTIME_INTERVAL_MINUTES = [1, 5, 15] as const;
export type UptimeIntervalMinutes = (typeof UPTIME_INTERVAL_MINUTES)[number];

export const UPTIME_STATUSES = ['UNKNOWN', 'UP', 'DOWN'] as const;
export type UptimeStatus = (typeof UPTIME_STATUSES)[number];

export const UPTIME_LIMITS = {
    maxTargetsPerGuild: 25,
    maxNameLength: 80,
    maxUrlLength: 500,
    timeoutMs: 10_000,
    retentionHours: 72,
} as const;

export const uptimeIntervalSchema = z.union([z.literal(1), z.literal(5), z.literal(15)]);

export const uptimeTargetInputSchema = z.object({
    name: z.string().trim().min(1, 'กรุณากรอกชื่อรายการ').max(UPTIME_LIMITS.maxNameLength, 'ชื่อรายการยาวเกินกำหนด'),
    url: z
        .string()
        .trim()
        .min(1, 'กรุณากรอก URL')
        .max(UPTIME_LIMITS.maxUrlLength, 'URL ยาวเกินกำหนด')
        .refine((val) => {
            try {
                const u = new URL(val);
                return u.protocol === 'http:' || u.protocol === 'https:';
            } catch {
                return false;
            }
        }, 'URL ต้องถูกต้องและขึ้นต้นด้วย http:// หรือ https://'),
    intervalMinutes: uptimeIntervalSchema,
    channelId: z.string().trim().regex(SNOWFLAKE_RE, 'กรุณาเลือกห้องแจ้งเตือน'),
    mentionRoleId: z
        .union([z.string().trim().regex(SNOWFLAKE_RE, 'Role ID ไม่ถูกต้อง'), z.literal(''), z.null()])
        .transform((v) => (v ? v : null))
        .optional(),
    enabled: z.boolean().optional(),
});

export const updateUptimeTargetSchema = uptimeTargetInputSchema
    .partial()
    .refine((obj) => Object.keys(obj).length > 0, 'ต้องระบุข้อมูลอย่างน้อย 1 ฟิลด์');

export type CreateUptimeTargetInput = z.infer<typeof uptimeTargetInputSchema>;
export type UpdateUptimeTargetInput = z.infer<typeof updateUptimeTargetSchema>;

export interface UptimeTargetSummary {
    id: number;
    guildId: string;
    name: string;
    url: string;
    intervalMinutes: UptimeIntervalMinutes;
    channelId: string;
    mentionRoleId: string | null;
    enabled: boolean;
    lastStatus: UptimeStatus;
    lastStatusCode: number | null;
    lastLatencyMs: number | null;
    lastCheckedAt: string | null;
    nextCheckAt: string;
    createdAt: string;
    updatedAt: string;
    uptime24hPercent: number | null;
    checks24hCount: number;
    up24hCount: number;
    avgLatency24hMs: number | null;
}

export interface UptimeLatencyPoint {
    checkedAt: string;
    status: 'UP' | 'DOWN';
    statusCode: number | null;
    latencyMs: number | null;
    error: string | null;
}

export interface UptimeTargetDetailResponse {
    target: UptimeTargetSummary;
    series24h: UptimeLatencyPoint[];
}

export interface UptimeOverviewResponse {
    targets: UptimeTargetSummary[];
    summary: {
        totalTargets: number;
        enabledTargets: number;
        upCount: number;
        downCount: number;
        unknownCount: number;
        overallUptime24hPercent: number | null;
    };
}
