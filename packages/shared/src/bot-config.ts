import { z } from 'zod';

// ==========================================
// ⚙️ CONFIG — ค่าที่แก้ได้จากหน้า Configuration ของแต่ละเซิร์ฟเวอร์ (ห้องต่างๆ + เปิด/ปิดความสามารถของบอท)
// ==========================================
export type ConfigValueType = 'channel' | 'boolean';

export interface ConfigKeyDefinition {
    key: string;
    type: ConfigValueType;
    group: string;
    label: string;
    description: string;
    // ค่าเริ่มต้นของเซิร์ฟเวอร์ใหม่ / ของเซิร์ฟเวอร์หลัก (ค่าเดิมของระบบก่อนรองรับหลายเซิร์ฟเวอร์)
    defaultValue: string;
    homeValue: string;
}

export const CONFIG_GROUPS = ['ห้อง', 'ความสามารถในแชท'] as const;

export const CONFIG_KEYS: readonly ConfigKeyDefinition[] = [
    { key: 'LOG_CHANNEL_ID', type: 'channel', group: 'ห้อง', label: 'ห้อง Log ทั่วไป', description: 'ประวัติเข้า/ออก/ย้ายห้องเสียง', defaultValue: '', homeValue: '1369338812819312731' },
    { key: 'ALERT_CHANNEL_ID', type: 'channel', group: 'ห้อง', label: 'ห้องแจ้งเตือนความปลอดภัย', description: 'Anti-Spam และการแก้ Bitrate / Region ของห้องเสียง', defaultValue: '', homeValue: '1333089825376436295' },
    { key: 'WELCOME_CHANNEL_ID', type: 'channel', group: 'ห้อง', label: 'ห้อง Welcome', description: 'ข้อความต้อนรับสมาชิกใหม่ (ข้อความธรรมดา — การ์ดรูปภาพตั้งที่หน้า Welcome)', defaultValue: '', homeValue: '1403025308512157746' },
    { key: 'GOODBYE_CHANNEL_ID', type: 'channel', group: 'ห้อง', label: 'ห้อง Goodbye', description: 'แจ้งเมื่อมีสมาชิกออกจากเซิร์ฟเวอร์', defaultValue: '', homeValue: '1403025414447956019' },
    { key: 'NEWS_CHANNEL_ID', type: 'channel', group: 'ห้อง', label: 'ห้องประกาศข่าวสาร', description: 'ห้องที่หน้า News ส่งประกาศเข้าไป', defaultValue: '', homeValue: '' },
    { key: 'GENERAL_CHANNEL_ID', type: 'channel', group: 'ห้อง', label: 'ห้องทั่วไป', description: 'ห้องเริ่มต้นของรายงานสภาพอากาศ (ตั้งห้องจริงที่หน้า Weather)', defaultValue: '', homeValue: '1273939427575595184' },
    { key: 'ANTI_SPAM_ENABLED', type: 'boolean', group: 'ความสามารถในแชท', label: 'Anti-Spam', description: 'ลบข้อความเมื่อส่งเกิน 6 ข้อความใน 5 วินาที และแจ้งเตือนห้องความปลอดภัย', defaultValue: 'false', homeValue: 'true' },
    { key: 'BAD_WORD_FILTER_ENABLED', type: 'boolean', group: 'ความสามารถในแชท', label: 'กรองคำหยาบ (ภาษาไทย + AI)', description: 'ลบข้อความหยาบคาย — คำที่ต้องสงสัยให้ AI ดูบริบทก่อน (ใช้โควตา AI ร่วมกันทุกเซิร์ฟเวอร์)', defaultValue: 'false', homeValue: 'true' },
    { key: 'AI_CHAT_ENABLED', type: 'boolean', group: 'ความสามารถในแชท', label: 'AI Chat', description: 'ตอบคำถามเมื่อมีคนแท็กบอท (Gemini — โควตาต่อวันใช้ร่วมกันทุกเซิร์ฟเวอร์)', defaultValue: 'false', homeValue: 'true' },
    { key: 'AUTO_REPLY_ENABLED', type: 'boolean', group: 'ความสามารถในแชท', label: 'ตอบกลับอัตโนมัติ', description: 'ตอบข้อความเช่น "สวัสดีบอท" / "หิวข้าว" / "ขอกำลังใจ"', defaultValue: 'false', homeValue: 'true' },
    { key: 'SECURITY_MONITOR_ENABLED', type: 'boolean', group: 'ความสามารถในแชท', label: 'เฝ้าระวังห้องเสียง', description: 'แจ้งเตือนเมื่อมีคนแก้ Bitrate / Region ของห้องเสียง', defaultValue: 'true', homeValue: 'true' },
];

export const CONFIG_KEY_MAP = new Map(CONFIG_KEYS.map((def) => [def.key, def]));

export interface ConfigRow {
    key: string;
    type: ConfigValueType;
    group: string;
    label: string;
    description: string;
    value: string;
}

export const updateConfigSchema = z.object({
    key: z.string({ error: 'Key and value are required' }).min(1, 'Key and value are required'),
    // ห้องเว้นว่างได้ (= ปิดความสามารถที่ใช้ห้องนั้น), สวิตช์เป็น "true" / "false"
    value: z.string({ error: 'Key and value are required' }).trim(),
});
export type UpdateConfigInput = z.infer<typeof updateConfigSchema>;

// key ที่ PR Bot ใช้ (เก็บในตาราง config เดียวกัน แต่ตั้งค่าที่หน้า PR Bot)
export const PR_CONFIG_KEYS = {
    defaultChannel: 'PR_CHANNEL_ID',
    orgChannelMap: 'PR_ORG_CHANNEL_MAP',
    repoMentionMap: 'PR_REPO_MENTION_MAP',
    webhookSecret: 'PR_WEBHOOK_SECRET',
} as const;
