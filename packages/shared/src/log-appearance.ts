import { z } from 'zod';

export const logAppearanceSchema = z.object({
    layout: z.enum(['compact', 'comfortable']),
    showFieldIcons: z.boolean(),
    showIds: z.boolean(),
    showThumbnail: z.boolean(),
    showTimestamp: z.boolean(),
    footerText: z.string().trim().max(100, 'ข้อความท้าย embed ยาวได้ไม่เกิน 100 ตัวอักษร'),
    maxContentLength: z.union([z.literal(250), z.literal(500), z.literal(1024)]),
});
export type LogAppearance = z.infer<typeof logAppearanceSchema>;

export const DEFAULT_LOG_APPEARANCE: Readonly<LogAppearance> = {
    layout: 'compact',
    showFieldIcons: false,
    showIds: false,
    showThumbnail: true,
    showTimestamp: true,
    footerText: 'NotStack • บันทึกเหตุการณ์',
    maxContentLength: 500,
};
