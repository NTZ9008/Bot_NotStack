import { z } from 'zod';
import type { DiscordUserInfo } from './guild';

// ==========================================
// 🎙️ VOICE GUARD — Whitelist / Blacklist ของห้องเสียง
// ==========================================
export const VOICE_GUARD_MODES = ['whitelist', 'blacklist'] as const;
export type VoiceGuardMode = (typeof VOICE_GUARD_MODES)[number];

export interface VoiceGuardChannel {
    channelId: string;
    channelName: string;
    enabled: boolean;
    // ส่ง DM แจ้งผู้ใช้เมื่อถูกเตะออกจากห้องหรือไม่
    notify: boolean;
    users: DiscordUserInfo[];
}

// หน้าเว็บเดิมส่ง 1/0 — รับทั้ง boolean และตัวเลข
const flag = z.union([z.boolean(), z.number()]).transform((value) => (typeof value === 'boolean' ? value : Boolean(value)));

export const voiceGuardChannelSchema = z.object({
    channelId: z.string({ error: 'channelId required' }).min(1, 'channelId required'),
    enabled: flag.optional(),
    notify: flag.optional(),
});
export type VoiceGuardChannelInput = z.input<typeof voiceGuardChannelSchema>;

export const voiceGuardChannelDeleteSchema = z.object({
    channelId: z.string({ error: 'channelId required' }).min(1, 'channelId required'),
});

export const voiceGuardUserSchema = z.object({
    channelId: z.string({ error: 'channelId and userId required' }).min(1, 'channelId and userId required'),
    userId: z.string({ error: 'channelId and userId required' }).min(1, 'channelId and userId required'),
});
export type VoiceGuardUserInput = z.infer<typeof voiceGuardUserSchema>;
