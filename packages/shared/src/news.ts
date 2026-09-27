import { z } from 'zod';

// ==========================================
// 📰 NEWS — ส่งประกาศเป็น embed เข้าห้อง NEWS_CHANNEL_ID
// ==========================================
export const NEWS_TYPES = ['general', 'urgent'] as const;
export type NewsType = (typeof NEWS_TYPES)[number];

export const NEWS_PRESETS: Record<NewsType, { color: string; prefix: string; label: string }> = {
    general: { color: '#3B82F6', prefix: '📰', label: '📰 ข่าวทั่วไป — General News' },
    urgent: { color: '#EF4444', prefix: '🚨', label: '📢 ข่าวด่วน — Urgent News' },
};

// ลิมิตเดียวกับฝั่ง Discord
export const NEWS_LIMITS = { title: 256, content: 4000, footer: 2048 } as const;
export const NEWS_DEFAULT_FOOTER = 'NotStack News Delivery';

// รับเฉพาะลิงก์รูป http/https — กัน javascript: หรือ data: หลุดเข้าไปใน embed
export const isHttpUrl = (value: unknown): value is string => typeof value === 'string' && /^https?:\/\/\S+$/i.test(value);

export const newsSchema = z.object({
    type: z
        .unknown()
        .transform((value): NewsType => (value === 'urgent' ? 'urgent' : 'general'))
        .optional()
        .transform((value): NewsType => value ?? 'general'),
    title: z.string({ error: 'Title and content are required' }).min(1, 'Title and content are required')
        .max(NEWS_LIMITS.title, `หัวข้อยาวเกิน ${NEWS_LIMITS.title} ตัวอักษร`),
    content: z.string({ error: 'Title and content are required' }).min(1, 'Title and content are required')
        .max(NEWS_LIMITS.content, `เนื้อหายาวเกิน ${NEWS_LIMITS.content} ตัวอักษร`),
    color: z.string().optional(),
    footer: z.string().optional(),
    imageUrl: z
        .string()
        .optional()
        .refine((value) => !value || isHttpUrl(value), 'ลิงก์รูปภาพต้องขึ้นต้นด้วย http:// หรือ https://'),
});
export type NewsInput = z.input<typeof newsSchema>;
