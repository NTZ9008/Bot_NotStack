import { z } from 'zod';
import { HEX_COLOR_RE, SNOWFLAKE_RE, optionalText } from './common';

// ==========================================
// 🎟️ TICKET SYSTEM — เปิด Ticket แจ้งปัญหา + รับเรื่อง + บันทึก Transcript
// ==========================================

export const TICKET_LIMITS = {
    maxStaffRoles: 25,
    maxPanelTitleLength: 256,
    maxPanelDescriptionLength: 2000,
    minMaxOpenPerUser: 1,
    maxMaxOpenPerUser: 10,
    maxSubjectLength: 200,
    defaultPanelColor: '#5865F2',
    pageSize: 20,
} as const;

export const TICKET_STATUSES = ['OPEN', 'CLOSED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export function formatTicketNumber(ticketNumber: number): string {
    return String(Math.max(0, Math.trunc(ticketNumber))).padStart(4, '0');
}

export function normalizeStaffRoleIds(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const unique = new Set<string>();
    for (const item of raw) {
        if (typeof item !== 'string') continue;
        const trimmed = item.trim();
        if (!SNOWFLAKE_RE.test(trimmed)) continue;
        unique.add(trimmed);
        if (unique.size >= TICKET_LIMITS.maxStaffRoles) break;
    }
    return [...unique];
}

export interface TicketConfigDto {
    guildId: string;
    categoryId: string;
    logChannelId: string | null;
    panelChannelId: string | null;
    panelMessageId: string | null;
    staffRoleIds: string[];
    panelTitle: string;
    panelDescription: string;
    panelColor: string;
    dmTranscript: boolean;
    maxOpenPerUser: number;
    updatedAt: string | null;
    warning: string | null;
}

export function defaultTicketConfig(guildId: string): TicketConfigDto {
    return {
        guildId,
        categoryId: '',
        logChannelId: null,
        panelChannelId: null,
        panelMessageId: null,
        staffRoleIds: [],
        panelTitle: '🎫 ติดต่อทีมงาน / แจ้งปัญหา',
        panelDescription: 'กดปุ่มด้านล่างเพื่อเปิดห้อง Ticket ส่วนตัว ทีมงานจะเข้ามาดูแลโดยเร็วที่สุด',
        panelColor: TICKET_LIMITS.defaultPanelColor,
        dmTranscript: true,
        maxOpenPerUser: 1,
        updatedAt: null,
        warning: null,
    };
}

const optionalNullableSnowflake = z
    .union([z.string(), z.null()])
    .transform((value) => (typeof value === 'string' ? value.trim() || null : null))
    .refine((value) => value === null || SNOWFLAKE_RE.test(value), 'Discord Channel ID ไม่ถูกต้อง');

export const updateTicketConfigSchema = z.object({
    categoryId: z
        .string()
        .trim()
        .refine((value) => !value || SNOWFLAKE_RE.test(value), 'Discord Category ID ไม่ถูกต้อง')
        .optional(),
    logChannelId: optionalNullableSnowflake.optional(),
    panelChannelId: optionalNullableSnowflake.optional(),
    staffRoleIds: z
        .array(z.string().trim().regex(SNOWFLAKE_RE, 'Discord Role ID ไม่ถูกต้อง'))
        .max(TICKET_LIMITS.maxStaffRoles)
        .transform((ids) => [...new Set(ids)])
        .optional(),
    panelTitle: z
        .string()
        .trim()
        .min(1, 'กรุณากรอกหัวข้อแผง')
        .max(TICKET_LIMITS.maxPanelTitleLength, `หัวข้อแผงยาวได้ไม่เกิน ${TICKET_LIMITS.maxPanelTitleLength} ตัวอักษร`)
        .optional(),
    panelDescription: z
        .string()
        .trim()
        .max(TICKET_LIMITS.maxPanelDescriptionLength, `รายละเอียดแผงยาวได้ไม่เกิน ${TICKET_LIMITS.maxPanelDescriptionLength} ตัวอักษร`)
        .optional(),
    panelColor: z
        .string()
        .trim()
        .regex(HEX_COLOR_RE, 'สีต้องอยู่ในรูปแบบ #RRGGBB')
        .transform((color) => color.toUpperCase())
        .optional(),
    dmTranscript: z.boolean().optional(),
    maxOpenPerUser: z.number().int().min(TICKET_LIMITS.minMaxOpenPerUser).max(TICKET_LIMITS.maxMaxOpenPerUser).optional(),
});

export type UpdateTicketConfigInput = z.input<typeof updateTicketConfigSchema>;
export type UpdateTicketConfigData = z.output<typeof updateTicketConfigSchema>;

export interface TicketSaveConfigResponse {
    success: true;
    config: TicketConfigDto;
    warning: string | null;
}

export interface PublishTicketPanelResponse {
    success: true;
    channelName: string;
    edited: boolean;
    messageId: string;
    message: string;
    config: TicketConfigDto;
}

export interface TicketItemDto {
    id: number;
    guildId: string;
    ticketNumber: number;
    channelId: string | null;
    openerId: string;
    openerName: string | null;
    claimedById: string | null;
    claimedByName: string | null;
    status: TicketStatus;
    subject: string | null;
    hasTranscript: boolean;
    closedById: string | null;
    closedByName: string | null;
    createdAt: string;
    closedAt: string | null;
}

export interface TicketDetailDto extends TicketItemDto {
    transcriptMarkdown: string | null;
}

export interface TicketListResponse {
    items: TicketItemDto[];
    total: number;
    openCount: number;
    closedCount: number;
    page: number;
    pageSize: number;
}

export const ticketListQuerySchema = z.object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    status: z.enum(['ALL', 'OPEN', 'CLOSED']).default('ALL'),
    q: optionalText(100),
});
export type TicketListQuery = z.input<typeof ticketListQuerySchema>;

export const ticketTranscriptQuerySchema = z.object({
    format: z.enum(['md', 'html']).default('md'),
});
export type TicketTranscriptQuery = z.input<typeof ticketTranscriptQuerySchema>;
