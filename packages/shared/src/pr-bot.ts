import { z } from 'zod';

// ==========================================
// 🔀 PR BOT — แจ้งเตือน GitHub Pull Request (ตั้งค่าห้อง/mention จากหน้า PR Bot)
// ==========================================
export interface PrBotSettings {
    // ห้อง default สำหรับ org/repo ที่ไม่ได้ระบุไว้
    defaultChannelId: string;
    // GitHub organization → Channel ID
    orgChannels: Record<string, string>;
    // owner/repo → ชื่อ Role หรือ mention tag (<@&id>)
    repoMentions: Record<string, string>;
    // URL ที่ใส่ใน GitHub (Settings → Webhooks) ของเซิร์ฟเวอร์นี้ — path ต่อท้าย origin ของ API
    webhookPath: string;
    // secret ของ webhook (แต่ละเซิร์ฟเวอร์มีของตัวเอง) — ใส่ใน GitHub ช่อง Secret
    webhookSecret: string;
}

export interface PrBotSecretResponse {
    success: true;
    webhookSecret: string;
}

const stringMap = z
    .record(z.string(), z.unknown())
    .transform((map) =>
        Object.fromEntries(
            Object.entries(map)
                .map(([key, value]) => [key.trim(), typeof value === 'string' ? value.trim() : ''] as const)
                .filter(([key, value]) => key && value),
        ),
    );

// บันทึกทีละส่วนได้ (หน้าเว็บมีปุ่มบันทึกแยกของแต่ละหัวข้อ)
export const updatePrBotSchema = z.object({
    defaultChannelId: z.string().trim().optional(),
    orgChannels: stringMap.optional(),
    repoMentions: stringMap.optional(),
});
export type UpdatePrBotInput = z.input<typeof updatePrBotSchema>;

// Calendar days including today, in Asia/Bangkok.
export const prBotStatsQuerySchema = z.object({
    days: z
        .enum(['7', '30', '90'])
        .default('7')
        .transform((value) => Number(value) as 7 | 30 | 90),
});
export type PrBotStatsDays = 7 | 30 | 90;
export type PrBotNotificationKind = 'sent' | 'merged' | 'closed';
export type PrBotCounts = Record<PrBotNotificationKind, number>;
export interface PrBotStatsBucket extends PrBotCounts {
    label: string;
}
export interface PrBotStats {
    range: { from: string; to: string; days: PrBotStatsDays; timeZone: 'Asia/Bangkok' };
    totals: PrBotCounts;
    daily: PrBotStatsBucket[];
    hourly: PrBotStatsBucket[];
}
