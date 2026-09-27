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
