import { z } from 'zod';
import { HEX_COLOR_RE, SNOWFLAKE_RE } from './common';

// ==========================================
// 🎭 REACTION ROLES — แผงรับยศด้วยปุ่มกดและเมนูเลือกแยกตามเซิร์ฟเวอร์
// ==========================================

export const REACTION_ROLE_MODES = ['BUTTON', 'SELECT'] as const;
export type ReactionRoleMode = (typeof REACTION_ROLE_MODES)[number];

export const REACTION_ROLE_BUTTON_STYLES = ['PRIMARY', 'SECONDARY', 'SUCCESS', 'DANGER'] as const;
export type ReactionRoleButtonStyle = (typeof REACTION_ROLE_BUTTON_STYLES)[number];

export const REACTION_ROLE_DEFAULT_COLOR = '#5865f2' as const;

export const REACTION_ROLE_LIMITS = {
    maxPanelsPerGuild: 25,
    maxItemsPerPanel: 25,
    maxTitleLength: 200,
    maxDescriptionLength: 2000,
    maxLabelLength: 80,
    maxEmojiLength: 64,
} as const;

const CUSTOM_EMOJI_RE = /^<a?:[a-zA-Z0-9_]{1,32}:\d{5,25}>$/;
const UNICODE_EMOJI_RE = /(?:\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]{2}|[0-9#*]\uFE0F?\u20E3)/u;
const PLAIN_WORD_CHAR_RE = /[a-zA-Z\s]/;

export function isValidDiscordEmoji(raw: string): boolean {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > REACTION_ROLE_LIMITS.maxEmojiLength) return false;
    if (CUSTOM_EMOJI_RE.test(trimmed)) return true;
    return !PLAIN_WORD_CHAR_RE.test(trimmed) && UNICODE_EMOJI_RE.test(trimmed);
}

const reactionRoleItemCommonFields = {
    roleId: z.string().trim().regex(SNOWFLAKE_RE, 'กรุณาเลือกยศ'),
    label: z
        .string()
        .trim()
        .min(1, 'กรุณากรอกข้อความบนปุ่ม/ตัวเลือก')
        .max(REACTION_ROLE_LIMITS.maxLabelLength, 'ข้อความบนปุ่มยาวเกินกำหนด'),
    emoji: z
        .union([
            z
                .string()
                .trim()
                .max(REACTION_ROLE_LIMITS.maxEmojiLength, 'Emoji ยาวเกินกำหนด')
                .refine(isValidDiscordEmoji, 'รูปแบบ Emoji ไม่ถูกต้อง (ใช้อีโมจิปกติ หรือ <:name:id>)'),
            z.literal(''),
            z.null(),
        ])
        .transform((v) => (v ? v : null))
        .optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
};

export const reactionRoleItemInputSchema = z.object({
    ...reactionRoleItemCommonFields,
    buttonStyle: z.enum(REACTION_ROLE_BUTTON_STYLES, { error: 'รูปแบบสีปุ่มไม่ถูกต้อง' }).default('PRIMARY'),
});

export const updateReactionRoleItemSchema = z
    .object({
        ...reactionRoleItemCommonFields,
        buttonStyle: z.enum(REACTION_ROLE_BUTTON_STYLES, { error: 'รูปแบบสีปุ่มไม่ถูกต้อง' }),
    })
    .partial()
    .refine((obj) => Object.keys(obj).length > 0, 'ต้องระบุข้อมูลอย่างน้อย 1 ฟิลด์');

const hasDuplicateRoleIds = (items: Array<{ roleId: string }> | undefined): boolean => {
    if (!items) return false;
    const seen = new Set<string>();
    for (const item of items) {
        if (seen.has(item.roleId)) return true;
        seen.add(item.roleId);
    }
    return false;
};

const reactionRolePanelCommonFields = {
    title: z
        .string()
        .trim()
        .min(1, 'กรุณากรอกหัวข้อแผงรับยศ')
        .max(REACTION_ROLE_LIMITS.maxTitleLength, 'หัวข้อแผงรับยศยาวเกินกำหนด'),
    channelId: z.string().trim().regex(SNOWFLAKE_RE, 'กรุณาเลือกห้องส่งแผงรับยศ'),
};

export const reactionRolePanelInputSchema = z
    .object({
        ...reactionRolePanelCommonFields,
        description: z
            .string()
            .trim()
            .max(REACTION_ROLE_LIMITS.maxDescriptionLength, 'คำอธิบายยาวเกินกำหนด')
            .default(''),
        embedColor: z
            .string()
            .trim()
            .regex(HEX_COLOR_RE, 'รหัสสีต้องเป็น #RRGGBB')
            .transform((v) => v.toLowerCase())
            .default(REACTION_ROLE_DEFAULT_COLOR),
        mode: z.enum(REACTION_ROLE_MODES, { error: 'รูปแบบแผงไม่ถูกต้อง' }).default('BUTTON'),
        allowMultiple: z.boolean().default(true),
        items: z
            .array(reactionRoleItemInputSchema)
            .max(REACTION_ROLE_LIMITS.maxItemsPerPanel, `เพิ่มตัวเลือกยศได้สูงสุด ${REACTION_ROLE_LIMITS.maxItemsPerPanel} รายการต่อแผง`)
            .optional(),
    })
    .superRefine((data, ctx) => {
        if (hasDuplicateRoleIds(data.items)) {
            ctx.addIssue({
                code: 'custom',
                path: ['items'],
                message: 'ไม่สามารถเลือกยศซ้ำกันในแผงเดียวได้',
            });
        }
    });

export const updateReactionRolePanelSchema = z
    .object({
        ...reactionRolePanelCommonFields,
        description: z.string().trim().max(REACTION_ROLE_LIMITS.maxDescriptionLength, 'คำอธิบายยาวเกินกำหนด'),
        embedColor: z
            .string()
            .trim()
            .regex(HEX_COLOR_RE, 'รหัสสีต้องเป็น #RRGGBB')
            .transform((v) => v.toLowerCase()),
        mode: z.enum(REACTION_ROLE_MODES, { error: 'รูปแบบแผงไม่ถูกต้อง' }),
        allowMultiple: z.boolean(),
        items: z
            .array(reactionRoleItemInputSchema)
            .max(REACTION_ROLE_LIMITS.maxItemsPerPanel, `เพิ่มตัวเลือกยศได้สูงสุด ${REACTION_ROLE_LIMITS.maxItemsPerPanel} รายการต่อแผง`),
    })
    .partial()
    .superRefine((data, ctx) => {
        if (hasDuplicateRoleIds(data.items)) {
            ctx.addIssue({
                code: 'custom',
                path: ['items'],
                message: 'ไม่สามารถเลือกยศซ้ำกันในแผงเดียวได้',
            });
        }
    })
    .refine((obj) => Object.keys(obj).length > 0, 'ต้องระบุข้อมูลอย่างน้อย 1 ฟิลด์');

export type CreateReactionRoleItemInput = z.input<typeof reactionRoleItemInputSchema>;
export type UpdateReactionRoleItemInput = z.input<typeof updateReactionRoleItemSchema>;
export type CreateReactionRolePanelInput = z.input<typeof reactionRolePanelInputSchema>;
export type UpdateReactionRolePanelInput = z.input<typeof updateReactionRolePanelSchema>;

export interface ReactionRoleItemDto {
    id: number;
    panelId: number;
    roleId: string;
    label: string;
    emoji: string | null;
    buttonStyle: ReactionRoleButtonStyle;
    sortOrder: number;
}

export interface ReactionRolePanelDto {
    id: number;
    guildId: string;
    channelId: string;
    messageId: string | null;
    title: string;
    description: string;
    embedColor: string;
    mode: ReactionRoleMode;
    allowMultiple: boolean;
    createdAt: string;
    updatedAt: string;
    items: ReactionRoleItemDto[];
}

export interface ReactionRolePanelsResponse {
    panels: ReactionRolePanelDto[];
    warnings: string[];
}

export interface PublishReactionRolePanelResponse {
    panel: ReactionRolePanelDto;
    channelName: string;
    edited: boolean;
    warnings: string[];
}
