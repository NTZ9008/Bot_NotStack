import { z } from 'zod';
import { SNOWFLAKE_RE } from './common';

// ==========================================
// 🎉 WELCOME ANNOUNCEMENT — การ์ดต้อนรับแบบรูปภาพ
// รูปแบบการจัดวาง (design) เก็บเป็น JSON ในคอลัมน์ welcome_cards.design
// ทุกค่าที่มาจากหน้าเว็บผ่าน normalizeDesign ก่อนเสมอ: ตัดฟิลด์แปลกปลอม, บีบตัวเลขให้อยู่ในช่วง, สีต้องเป็น #RRGGBB
// ใช้ทั้งฝั่ง backend (ตรวจ/วาดรูป) และหน้าเว็บ (ค่าเริ่มต้น/ขีดจำกัดของฟอร์ม)
// ==========================================

export const WELCOME_LIMITS = {
    minWidth: 400,
    maxWidth: 2000,
    minHeight: 150,
    maxHeight: 1200,
    maxTexts: 12,
    maxTextLength: 200,
    maxContentLength: 2000,
    maxNameLength: 80,
} as const;

// อัปโหลดรูปพื้นหลังได้ไม่เกิน 8 MB
export const WELCOME_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const WELCOME_UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

export const FITS = ['cover', 'contain', 'stretch'] as const;
export const SHAPES = ['circle', 'rounded', 'square'] as const;
export const ALIGNS = ['left', 'center', 'right'] as const;
export type BackgroundFit = (typeof FITS)[number];
export type AvatarShape = (typeof SHAPES)[number];
export type TextAlign = (typeof ALIGNS)[number];

// ฟอนต์ที่มีไฟล์มากับแพ็กเกจ @expo-google-fonts/* (ทุกฟอนต์มีครบทั้ง 4 น้ำหนัก)
export const WELCOME_FONTS = [
    { id: 'kanit', label: 'Kanit' },
    { id: 'prompt', label: 'Prompt' },
    { id: 'noto-sans-thai', label: 'Noto Sans Thai' },
] as const;
export type WelcomeFontId = (typeof WELCOME_FONTS)[number]['id'];
export const DEFAULT_FONT: WelcomeFontId = 'kanit';

export const WELCOME_WEIGHTS = [
    { value: 300, label: 'บาง (Light)' },
    { value: 400, label: 'ปกติ (Regular)' },
    { value: 700, label: 'หนา (Bold)' },
    { value: 900, label: 'หนามาก (Black)' },
] as const;
export type WelcomeWeight = (typeof WELCOME_WEIGHTS)[number]['value'];

const FONT_IDS = new Set<string>(WELCOME_FONTS.map((font) => font.id));
const WEIGHT_VALUES = new Set<number>(WELCOME_WEIGHTS.map((weight) => weight.value));

// ตัวแปรที่ใช้ได้ทั้งในข้อความบนรูปและข้อความที่ส่งคู่กับรูป
export const PLACEHOLDERS = [
    { key: 'user', label: 'ชื่อที่แสดงของสมาชิก (ชื่อเล่นในเซิร์ฟเวอร์ ถ้ามี)' },
    { key: 'username', label: 'username ของสมาชิก' },
    { key: 'mention', label: 'แท็กสมาชิก — ในข้อความจะแท็กจริง ส่วนบนรูปจะเป็น @ชื่อ' },
    { key: 'server', label: 'ชื่อเซิร์ฟเวอร์' },
    { key: 'memberCount', label: 'จำนวนสมาชิกทั้งหมด (= สมาชิกคนที่เท่าไร)' },
    { key: 'id', label: 'User ID ของสมาชิก' },
] as const;

export interface WelcomeTextLayer {
    text: string;
    x: number;
    y: number;
    font: WelcomeFontId;
    weight: WelcomeWeight;
    size: number;
    color: string;
    align: TextAlign;
    // 0 = ไม่จำกัดความกว้าง, มากกว่านั้น = ย่อตัวอักษรลงเองเมื่อชื่อยาวเกิน
    maxWidth: number;
    letterSpacing: number;
    strokeWidth: number;
    strokeColor: string;
    shadow: boolean;
}

export interface WelcomeDesign {
    width: number;
    height: number;
    background: {
        color: string;
        fit: BackgroundFit;
        blur: number;
        overlayColor: string;
        overlayOpacity: number;
    };
    avatar: {
        visible: boolean;
        x: number;
        y: number;
        size: number;
        shape: AvatarShape;
        borderWidth: number;
        borderColor: string;
    };
    texts: WelcomeTextLayer[];
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function defaultText(overrides: Partial<WelcomeTextLayer> = {}): WelcomeTextLayer {
    return {
        text: 'ข้อความใหม่',
        x: 512,
        y: 225,
        font: DEFAULT_FONT,
        weight: 700,
        size: 40,
        color: '#ffffff',
        align: 'center',
        maxWidth: 900,
        letterSpacing: 0,
        strokeWidth: 0,
        strokeColor: '#000000',
        shadow: true,
        ...overrides,
    };
}

export function defaultDesign(): WelcomeDesign {
    return {
        width: 1024,
        height: 450,
        background: {
            color: '#312e81',
            fit: 'cover',
            blur: 0,
            overlayColor: '#000000',
            overlayOpacity: 0.3,
        },
        avatar: {
            visible: true,
            x: 512,
            y: 150,
            size: 180,
            shape: 'circle',
            borderWidth: 7,
            borderColor: '#ffffff',
        },
        texts: [
            defaultText({ text: 'WELCOME', y: 297, weight: 900, size: 60, letterSpacing: 6 }),
            defaultText({ text: '{user}', y: 355, size: 42, color: '#fde68a' }),
            defaultText({ text: 'สมาชิกคนที่ #{memberCount} ของ {server}', y: 407, font: 'noto-sans-thai', weight: 400, size: 24, color: '#e2e8f0' }),
        ],
    };
}

// ==========================================
// ตัวช่วยตรวจค่า — ค่าที่ใช้ไม่ได้จะถอยกลับไปใช้ค่า default แทนการโยน error
// (หน้าเว็บส่งทั้งก้อนมาทุกครั้ง ถ้าฟิลด์เดียวพังไม่ควรทำให้บันทึกทั้งการ์ดไม่ได้)
// ==========================================
type Plain = Record<string, unknown>;

function num(value: unknown, min: number, max: number, fallback: number): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

const int = (value: unknown, min: number, max: number, fallback: number) => Math.round(num(value, min, max, fallback));
const color = (value: unknown, fallback: string) => (typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : fallback);
const oneOf = <T extends string>(value: unknown, list: readonly T[], fallback: T): T =>
    (list as readonly unknown[]).includes(value) ? (value as T) : fallback;
const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
const plain = (value: unknown): Plain => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Plain) : {});

function normalizeText(input: unknown, width: number, height: number): WelcomeTextLayer {
    const src = plain(input);
    const base = defaultText({ x: Math.round(width / 2), y: Math.round(height / 2), maxWidth: width - 80 });
    return {
        text: typeof src.text === 'string' ? src.text.slice(0, WELCOME_LIMITS.maxTextLength) : base.text,
        x: int(src.x, 0, width, base.x),
        y: int(src.y, 0, height, base.y),
        font: typeof src.font === 'string' && FONT_IDS.has(src.font) ? (src.font as WelcomeFontId) : base.font,
        weight: WEIGHT_VALUES.has(Number(src.weight)) ? (Number(src.weight) as WelcomeWeight) : base.weight,
        size: int(src.size, 8, 200, base.size),
        color: color(src.color, base.color),
        align: oneOf(src.align, ALIGNS, base.align),
        maxWidth: int(src.maxWidth, 0, width, base.maxWidth),
        letterSpacing: int(src.letterSpacing, 0, 40, base.letterSpacing),
        strokeWidth: int(src.strokeWidth, 0, 20, base.strokeWidth),
        strokeColor: color(src.strokeColor, base.strokeColor),
        shadow: bool(src.shadow, base.shadow),
    };
}

export function normalizeDesign(input: unknown): WelcomeDesign {
    const src = plain(input);
    const def = defaultDesign();

    const width = int(src.width, WELCOME_LIMITS.minWidth, WELCOME_LIMITS.maxWidth, def.width);
    const height = int(src.height, WELCOME_LIMITS.minHeight, WELCOME_LIMITS.maxHeight, def.height);

    const bg = plain(src.background);
    const av = plain(src.avatar);

    return {
        width,
        height,
        background: {
            color: color(bg.color, def.background.color),
            fit: oneOf(bg.fit, FITS, def.background.fit),
            blur: int(bg.blur, 0, 30, def.background.blur),
            overlayColor: color(bg.overlayColor, def.background.overlayColor),
            overlayOpacity: Math.round(num(bg.overlayOpacity, 0, 1, def.background.overlayOpacity) * 100) / 100,
        },
        avatar: {
            visible: bool(av.visible, def.avatar.visible),
            x: int(av.x, 0, width, Math.round(width / 2)),
            y: int(av.y, 0, height, Math.round(height / 3)),
            size: int(av.size, 16, Math.min(width, height), Math.min(def.avatar.size, height - 20)),
            shape: oneOf(av.shape, SHAPES, def.avatar.shape),
            borderWidth: int(av.borderWidth, 0, 40, def.avatar.borderWidth),
            borderColor: color(av.borderColor, def.avatar.borderColor),
        },
        texts: (Array.isArray(src.texts) ? src.texts : def.texts)
            .slice(0, WELCOME_LIMITS.maxTexts)
            .map((text) => normalizeText(text, width, height)),
    };
}

// ==========================================
// ตัวแปรในข้อความ
// ==========================================
export interface WelcomeVars {
    user: string;
    username: string;
    id: string;
    server: string;
    memberCount: string;
}

/**
 * @param target ข้อความบนรูปแท็กคนไม่ได้ → {mention} กลายเป็น @ชื่อ
 * @param mentionId User ID ที่จะแท็กจริงในข้อความ (เฉพาะ target = 'message')
 */
export function fillPlaceholders(
    template: string,
    vars: WelcomeVars,
    target: 'image' | 'message' = 'image',
    mentionId: string | null = null,
): string {
    return String(template || '').replace(/\{(\w+)\}/g, (match, key: string) => {
        if (key === 'mention') return target === 'message' && mentionId ? `<@${mentionId}>` : `@${vars.user}`;
        return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key as keyof WelcomeVars] : match;
    });
}

// ==========================================
// API
// ==========================================
export interface WelcomeCard {
    id: number;
    name: string;
    enabled: boolean;
    channelId: string;
    // ข้อความธรรมดาที่ส่งคู่กับรูป — ว่าง = ส่งแค่รูป
    content: string;
    design: WelcomeDesign;
    backgroundId: number | null;
    createdAt: string;
    updatedAt: string;
}

export interface WelcomeAsset {
    id: number;
    name: string;
    mimeType: string;
    width: number;
    height: number;
    size: number;
    createdAt: string;
}

export interface WelcomeMeta {
    // ใช้ทำกรอบข้อความจำลองแบบ Discord ในหน้าตัวอย่าง
    bot: { name: string; avatar: string } | null;
    fonts: typeof WELCOME_FONTS;
    weights: typeof WELCOME_WEIGHTS;
    fits: typeof FITS;
    shapes: typeof SHAPES;
    aligns: typeof ALIGNS;
    placeholders: typeof PLACEHOLDERS;
    limits: typeof WELCOME_LIMITS & { maxUploadBytes: number };
    defaultDesign: WelcomeDesign;
    defaultText: WelcomeTextLayer;
}

export interface WelcomePreviewResponse {
    // data:image/png;base64,...
    image: string;
    vars: WelcomeVars;
}

// ค่าของการ์ดที่ส่งมาจากหน้าเว็บ — ทุกฟิลด์ไม่บังคับ (ใช้ได้ทั้งสร้างใหม่และแก้บางส่วน)
export const welcomeCardInputSchema = z.object({
    name: z
        .unknown()
        .optional()
        .transform((value, ctx) => {
            if (value === undefined) return undefined;
            const name = String(value).trim();
            if (!name) {
                ctx.addIssue({ code: 'custom', message: 'กรุณาตั้งชื่อการ์ด' });
                return z.NEVER;
            }
            return name.slice(0, WELCOME_LIMITS.maxNameLength);
        }),
    enabled: z.boolean({ error: 'enabled ต้องเป็น true หรือ false' }).optional(),
    channelId: z
        .unknown()
        .optional()
        .transform((value, ctx) => {
            if (value === undefined) return undefined;
            const channelId = String(value ?? '').trim();
            if (channelId && !SNOWFLAKE_RE.test(channelId)) {
                ctx.addIssue({ code: 'custom', message: 'Channel ID ไม่ถูกต้อง' });
                return z.NEVER;
            }
            return channelId;
        }),
    content: z
        .unknown()
        .optional()
        .transform((value, ctx) => {
            if (value === undefined) return undefined;
            const content = String(value ?? '');
            if (content.length > WELCOME_LIMITS.maxContentLength) {
                ctx.addIssue({ code: 'custom', message: `ข้อความยาวเกิน ${WELCOME_LIMITS.maxContentLength} ตัวอักษร` });
                return z.NEVER;
            }
            return content;
        }),
    design: z
        .unknown()
        .optional()
        .transform((value) => (value === undefined ? undefined : normalizeDesign(value))),
    backgroundId: z
        .unknown()
        .optional()
        .transform((value, ctx) => {
            if (value === undefined) return undefined;
            if (value === null || value === '') return null;
            const id = Number(value);
            if (!Number.isInteger(id) || id <= 0) {
                ctx.addIssue({ code: 'custom', message: 'ไม่พบรูปพื้นหลังนี้ในคลังรูป (อาจถูกลบไปแล้ว)' });
                return z.NEVER;
            }
            return id;
        }),
});
export type WelcomeCardInput = z.input<typeof welcomeCardInputSchema>;
export type WelcomeCardData = z.output<typeof welcomeCardInputSchema>;

export const welcomeCreateSchema = welcomeCardInputSchema.extend({
    // สร้างโดยคัดลอกจากการ์ดเดิม
    duplicateOf: z.unknown().optional(),
});

export const welcomePreviewSchema = z.object({
    design: z
        .unknown()
        .optional()
        .transform((value) => normalizeDesign(value)),
    backgroundId: z.unknown().optional(),
    // สมาชิกที่ใช้แสดงในรูปตัวอย่าง (ไม่ระบุ = บัญชี Discord ของแอดมินที่ login อยู่ หรือตัวบอท)
    userId: z.unknown().optional(),
});

export const welcomeTestSchema = z.object({
    channelId: z.unknown().optional(),
    content: z.unknown().optional(),
    design: z.unknown().optional(),
    backgroundId: z.unknown().optional(),
    userId: z.unknown().optional(),
});

export const welcomeRenameAssetSchema = z.object({
    name: z
        .unknown()
        .optional()
        .transform((value, ctx) => {
            const name = String(value ?? '').trim().slice(0, WELCOME_LIMITS.maxNameLength);
            if (!name) {
                ctx.addIssue({ code: 'custom', message: 'กรุณาตั้งชื่อรูป' });
                return z.NEVER;
            }
            return name;
        }),
});

export interface WelcomeCardResponse {
    success: true;
    card: WelcomeCard;
    // เตือน (แต่ไม่ห้ามบันทึก) ถ้าห้องที่เลือกบอทส่งรูปเข้าไปไม่ได้
    warning?: string | null;
}

export interface WelcomeAssetResponse {
    success: true;
    asset: WelcomeAsset;
}
