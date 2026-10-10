import { z } from 'zod';
import { HEX_COLOR_RE, SNOWFLAKE_RE } from './common';
import { DEFAULT_FONT, SHAPES, WELCOME_FONTS, type AvatarShape, type WelcomeFontId } from './welcome';

// ==========================================
// 🏆 RANK CARD — รูปการ์ด /rank, ตาราง /leaderboard และการ์ดเลเวลอัป ใช้ "สไตล์" ชุดเดียวกัน
// - ธีมของเซิร์ฟเวอร์ (แอดมินตั้ง) = สไตล์ตั้งต้น + สิทธิ์ที่ให้สมาชิกแต่งการ์ดตัวเอง
// - การ์ดของสมาชิก = เฉพาะค่าที่แต่งทับธีม (ค่าที่ธีมไม่อนุญาตจะถูกข้ามตอนวาด แม้เคยบันทึกไว้)
// ค่าจากหน้าเว็บ / ฐานข้อมูลผ่าน normalize* ก่อนเสมอ: ตัดฟิลด์แปลกปลอม บีบตัวเลขเข้าช่วง สีต้องเป็น #RRGGBB
// ==========================================

export const RANK_LAYOUTS = ['classic', 'centered', 'minimal'] as const;
export type RankLayout = (typeof RANK_LAYOUTS)[number];
export const RANK_LAYOUT_LABELS: Record<RankLayout, string> = {
    classic: 'คลาสสิก — แนวนอน มีกรอบ',
    centered: 'โปรไฟล์ — รูปอยู่กลาง',
    minimal: 'มินิมอล — เตี้ย ไม่มีกรอบ',
};

// ขนาดรูปของแต่ละแบบ (px)
export const RANK_CARD_SIZES: Record<RankLayout, { width: number; height: number }> = {
    classic: { width: 1000, height: 300 },
    centered: { width: 800, height: 500 },
    minimal: { width: 1000, height: 220 },
};
export const LEVEL_UP_CARD_SIZE = { width: 900, height: 260 } as const;
export const LEADERBOARD_PAGE_SIZE = 10;

export const RANK_BACKGROUND_TYPES = ['color', 'gradient', 'image'] as const;
export type RankBackgroundType = (typeof RANK_BACKGROUND_TYPES)[number];

export interface RankCardBackground {
    type: RankBackgroundType;
    color: string;
    // สีที่สองของ gradient
    color2: string;
    // ทิศของ gradient (องศา 0 = ซ้ายไปขวา, 90 = บนลงล่าง)
    angle: number;
    // รูปจากคลังรูปของเซิร์ฟเวอร์ (คลังเดียวกับการ์ดต้อนรับ)
    imageId: number | null;
    blur: number;
    // ความเข้มของชั้นสีดำทับรูป/สีพื้น ช่วยให้อ่านตัวหนังสือออก (0–0.9)
    overlayOpacity: number;
}

export interface RankCardStyle {
    layout: RankLayout;
    background: RankCardBackground;
    // สีหลอดความคืบหน้า / ตัวเลขเลเวล / ขอบรูปโปรไฟล์
    accentColor: string;
    textColor: string;
    subTextColor: string;
    // สีพื้นของหลอดความคืบหน้า
    trackColor: string;
    // ความทึบของกรอบด้านหลังข้อมูล (layout ที่มีกรอบ)
    panelOpacity: number;
    avatarShape: AvatarShape;
    font: WelcomeFontId;
    show: {
        rank: boolean;
        level: boolean;
        xpText: boolean;
        username: boolean;
        serverName: boolean;
    };
}

// สิ่งที่สมาชิกแต่งการ์ดตัวเองได้ (แอดมินเลือก)
export interface RankMemberPermissions {
    enabled: boolean;
    layout: boolean;
    // สีหลัก / สีตัวอักษร และพื้นหลังแบบสี / gradient
    colors: boolean;
    // เลือกรูปพื้นหลังจาก backgroundIds
    backgrounds: boolean;
    backgroundIds: number[];
}

export interface RankCardTheme {
    style: RankCardStyle;
    members: RankMemberPermissions;
}

// การ์ดของสมาชิก — ทุกฟิลด์ไม่บังคับ (ไม่ตั้ง = ใช้ของธีม)
export interface RankMemberStyle {
    layout?: RankLayout;
    accentColor?: string;
    textColor?: string;
    background?: Pick<RankCardBackground, 'type' | 'color' | 'color2' | 'imageId'>;
}

export const RANK_LIMITS = {
    maxMemberBackgrounds: 24,
    maxRewards: 25,
    maxLevel: 1000,
    maxMessageLength: 500,
} as const;

// สีสำเร็จรูปที่ /rankcard ให้เลือกใน Discord (นอกนั้นพิมพ์ #RRGGBB เองได้)
export const RANK_COLOR_PRESETS = [
    { name: 'ม่วง Discord', value: '#5865f2' },
    { name: 'ฟ้า', value: '#38bdf8' },
    { name: 'เขียวมิ้นต์', value: '#34d399' },
    { name: 'เหลือง', value: '#facc15' },
    { name: 'ส้ม', value: '#fb923c' },
    { name: 'ชมพู', value: '#f472b6' },
    { name: 'แดง', value: '#f87171' },
    { name: 'ขาว', value: '#f8fafc' },
] as const;

export function defaultRankStyle(): RankCardStyle {
    return {
        layout: 'classic',
        background: { type: 'gradient', color: '#1e1b4b', color2: '#312e81', angle: 20, imageId: null, blur: 0, overlayOpacity: 0.25 },
        accentColor: '#818cf8',
        textColor: '#ffffff',
        subTextColor: '#c7d2fe',
        trackColor: '#0f172a',
        panelOpacity: 0.35,
        avatarShape: 'circle',
        font: DEFAULT_FONT,
        show: { rank: true, level: true, xpText: true, username: true, serverName: false },
    };
}

export function defaultRankTheme(): RankCardTheme {
    return {
        style: defaultRankStyle(),
        members: { enabled: true, layout: true, colors: true, backgrounds: false, backgroundIds: [] },
    };
}

// ==========================================
// ตัวช่วยตรวจค่า — ค่าที่ใช้ไม่ได้ถอยกลับไปใช้ค่า default แทนการโยน error
// ==========================================
type Plain = Record<string, unknown>;
const plain = (value: unknown): Plain => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Plain) : {});
const num = (value: unknown, min: number, max: number, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const int = (value: unknown, min: number, max: number, fallback: number) => Math.round(num(value, min, max, fallback));
const ratio = (value: unknown, max: number, fallback: number) => Math.round(num(value, 0, max, fallback) * 100) / 100;
const color = (value: unknown, fallback: string) => (typeof value === 'string' && HEX_COLOR_RE.test(value) ? value.toLowerCase() : fallback);
const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
const oneOf = <T extends string>(value: unknown, list: readonly T[], fallback: T): T => ((list as readonly unknown[]).includes(value) ? (value as T) : fallback);
const FONT_IDS = WELCOME_FONTS.map((font) => font.id);
const assetId = (value: unknown): number | null => {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
};

function normalizeBackground(input: unknown, def: RankCardBackground): RankCardBackground {
    const src = plain(input);
    const imageId = assetId(src.imageId);
    const type = oneOf(src.type, RANK_BACKGROUND_TYPES, def.type);
    return {
        // เลือกแบบรูปแต่ไม่มีรูป = ใช้สีพื้นแทน
        type: type === 'image' && !imageId ? 'color' : type,
        color: color(src.color, def.color),
        color2: color(src.color2, def.color2),
        angle: int(src.angle, 0, 359, def.angle),
        imageId,
        blur: int(src.blur, 0, 20, def.blur),
        overlayOpacity: ratio(src.overlayOpacity, 0.9, def.overlayOpacity),
    };
}

export function normalizeRankStyle(input: unknown): RankCardStyle {
    const src = plain(input);
    const def = defaultRankStyle();
    const show = plain(src.show);
    return {
        layout: oneOf(src.layout, RANK_LAYOUTS, def.layout),
        background: normalizeBackground(src.background, def.background),
        accentColor: color(src.accentColor, def.accentColor),
        textColor: color(src.textColor, def.textColor),
        subTextColor: color(src.subTextColor, def.subTextColor),
        trackColor: color(src.trackColor, def.trackColor),
        panelOpacity: ratio(src.panelOpacity, 0.9, def.panelOpacity),
        avatarShape: oneOf(src.avatarShape, SHAPES, def.avatarShape),
        font: oneOf(src.font, FONT_IDS, def.font),
        show: {
            rank: bool(show.rank, def.show.rank),
            level: bool(show.level, def.show.level),
            xpText: bool(show.xpText, def.show.xpText),
            username: bool(show.username, def.show.username),
            serverName: bool(show.serverName, def.show.serverName),
        },
    };
}

export function normalizeRankTheme(input: unknown): RankCardTheme {
    const src = plain(input);
    const def = defaultRankTheme();
    const members = plain(src.members);
    const ids = Array.isArray(members.backgroundIds) ? members.backgroundIds.map(assetId).filter((id): id is number => id !== null) : [];
    return {
        style: normalizeRankStyle(src.style),
        members: {
            enabled: bool(members.enabled, def.members.enabled),
            layout: bool(members.layout, def.members.layout),
            colors: bool(members.colors, def.members.colors),
            backgrounds: bool(members.backgrounds, def.members.backgrounds),
            backgroundIds: [...new Set(ids)].slice(0, RANK_LIMITS.maxMemberBackgrounds),
        },
    };
}

// เก็บเฉพาะฟิลด์ที่ตั้งไว้และถูกรูปแบบ (ยังไม่เช็คสิทธิ์ — เช็คตอนบันทึก/วาดด้วย applyMemberStyle)
export function normalizeMemberStyle(input: unknown): RankMemberStyle {
    const src = plain(input);
    const out: RankMemberStyle = {};
    if ((RANK_LAYOUTS as readonly unknown[]).includes(src.layout)) out.layout = src.layout as RankLayout;
    if (typeof src.accentColor === 'string' && HEX_COLOR_RE.test(src.accentColor)) out.accentColor = src.accentColor.toLowerCase();
    if (typeof src.textColor === 'string' && HEX_COLOR_RE.test(src.textColor)) out.textColor = src.textColor.toLowerCase();
    const bg = plain(src.background);
    if ((RANK_BACKGROUND_TYPES as readonly unknown[]).includes(bg.type)) {
        const imageId = assetId(bg.imageId);
        if (bg.type !== 'image' || imageId) {
            const def = defaultRankStyle().background;
            out.background = {
                type: bg.type as RankBackgroundType,
                color: color(bg.color, def.color),
                color2: color(bg.color2, def.color2),
                imageId: bg.type === 'image' ? imageId : null,
            };
        }
    }
    return out;
}

// ตัดค่าที่ธีมไม่อนุญาตออก — ใช้ทั้งตอนบันทึก (เก็บเฉพาะที่ใช้ได้) และตอนวาด (ธีมอาจถูกแก้หลังสมาชิกบันทึก)
export function allowedMemberStyle(theme: RankCardTheme, member: RankMemberStyle | null | undefined): RankMemberStyle {
    const rules = theme.members;
    if (!member || !rules.enabled) return {};
    const out: RankMemberStyle = {};
    if (rules.layout && member.layout) out.layout = member.layout;
    if (rules.colors) {
        if (member.accentColor) out.accentColor = member.accentColor;
        if (member.textColor) out.textColor = member.textColor;
    }
    const bg = member.background;
    if (bg) {
        const imageAllowed = bg.type === 'image' && rules.backgrounds && bg.imageId !== null && rules.backgroundIds.includes(bg.imageId);
        if (imageAllowed || (bg.type !== 'image' && rules.colors)) out.background = bg;
    }
    return out;
}

// สไตล์ที่ใช้วาดจริงของสมาชิกคนหนึ่ง = ธีม + ค่าที่แต่งเองเท่าที่ได้รับอนุญาต
export function applyMemberStyle(theme: RankCardTheme, member: RankMemberStyle | null | undefined): RankCardStyle {
    const allowed = allowedMemberStyle(theme, member);
    const style = structuredClone(theme.style);
    if (allowed.layout) style.layout = allowed.layout;
    if (allowed.accentColor) style.accentColor = allowed.accentColor;
    if (allowed.textColor) style.textColor = allowed.textColor;
    if (allowed.background) style.background = { ...style.background, ...allowed.background };
    return style;
}

// ==========================================
// 🎉 LEVEL UP — ประกาศเลเวลอัป + ยศรางวัลตามเลเวล
// ==========================================
export const LEVEL_UP_DESTINATIONS = ['current', 'channel', 'dm'] as const;
export type LevelUpDestination = (typeof LEVEL_UP_DESTINATIONS)[number];
export const LEVEL_UP_DESTINATION_LABELS: Record<LevelUpDestination, string> = {
    current: 'ห้องที่คุยอยู่ตอนเลเวลขึ้น',
    channel: 'ห้องที่เลือก',
    dm: 'ข้อความส่วนตัว (DM)',
};

export const LEVEL_UP_PLACEHOLDERS = [
    { key: 'mention', label: 'แท็กสมาชิก' },
    { key: 'user', label: 'ชื่อที่แสดงของสมาชิก' },
    { key: 'level', label: 'เลเวลใหม่' },
    { key: 'previousLevel', label: 'เลเวลเดิม' },
    { key: 'server', label: 'ชื่อเซิร์ฟเวอร์' },
    { key: 'roles', label: 'ยศรางวัลที่ได้รอบนี้ (ว่างถ้าไม่มี)' },
] as const;

export interface LevelReward {
    level: number;
    roleId: string;
}

export interface LevelUpSettings {
    // ประกาศเมื่อเลเวลขึ้น (ยศรางวัลทำงานแม้ปิดประกาศ)
    announce: boolean;
    destination: LevelUpDestination;
    // ห้องประกาศ (destination = channel) / ห้องสำรองเมื่อห้องที่คุยอยู่ส่งไม่ได้
    channelId: string;
    message: string;
    // แนบการ์ดเลเวลอัปเป็นรูป
    showCard: boolean;
    rewards: LevelReward[];
    // true = เก็บยศรางวัลของเลเวลก่อนๆ ไว้ด้วย, false = เหลือแค่ยศของเลเวลสูงสุดที่ถึง
    stackRewards: boolean;
}

export const LEVEL_UP_DEFAULT_MESSAGE = '🎉 ยินดีด้วย {mention} เลเวลขึ้นเป็น **{level}** แล้ว!';

export function defaultLevelUpSettings(): LevelUpSettings {
    return { announce: false, destination: 'current', channelId: '', message: LEVEL_UP_DEFAULT_MESSAGE, showCard: true, rewards: [], stackRewards: true };
}

export function normalizeLevelUpSettings(input: unknown): LevelUpSettings {
    const src = plain(input);
    const def = defaultLevelUpSettings();
    const seen = new Set<string>();
    const rewards: LevelReward[] = [];
    for (const item of Array.isArray(src.rewards) ? src.rewards : []) {
        const reward = plain(item);
        // เลเวลต่ำกว่า 1 / ไม่ใช่ตัวเลข (ช่องว่างในหน้าเว็บ) = ตัดแถวนั้นทิ้ง ไม่ปัดขึ้นเป็นเลเวล 1
        const raw = Number(reward.level);
        const level = Number.isInteger(raw) && raw >= 1 ? Math.min(raw, RANK_LIMITS.maxLevel) : 0;
        const roleId = typeof reward.roleId === 'string' && SNOWFLAKE_RE.test(reward.roleId) ? reward.roleId : '';
        // ยศเดียวผูกได้กับเลเวลเดียว
        if (!level || !roleId || seen.has(roleId)) continue;
        seen.add(roleId);
        rewards.push({ level, roleId });
    }
    rewards.sort((a, b) => a.level - b.level);
    const channelId = typeof src.channelId === 'string' && SNOWFLAKE_RE.test(src.channelId) ? src.channelId : '';
    return {
        announce: bool(src.announce, def.announce),
        destination: oneOf(src.destination, LEVEL_UP_DESTINATIONS, def.destination),
        channelId,
        message: typeof src.message === 'string' ? src.message.slice(0, RANK_LIMITS.maxMessageLength) : def.message,
        showCard: bool(src.showCard, def.showCard),
        rewards: rewards.slice(0, RANK_LIMITS.maxRewards),
        stackRewards: bool(src.stackRewards, def.stackRewards),
    };
}

// ยศรางวัลที่สมาชิกเลเวลนี้ควรมี (เลเวลเท่ากันได้หลายยศ)
export function rewardRolesForLevel(settings: Pick<LevelUpSettings, 'rewards' | 'stackRewards'>, level: number): string[] {
    const reached = settings.rewards.filter((reward) => reward.level <= level);
    if (settings.stackRewards || !reached.length) return reached.map((reward) => reward.roleId);
    const top = reached[reached.length - 1]!.level;
    return reached.filter((reward) => reward.level === top).map((reward) => reward.roleId);
}

// ยศที่ต้องเพิ่ม/ถอนเมื่อสมาชิกอยู่เลเวลนี้ — บอทจัดการเฉพาะยศที่อยู่ในรายการรางวัล (ยศอื่นไม่แตะ)
// ถอนเมื่อ: ไม่ซ้อนยศแล้วได้ยศของเลเวลที่สูงกว่า หรือเลเวลลดลงจนต่ำกว่าเลเวลของยศนั้น
export function planRewardChanges(
    settings: Pick<LevelUpSettings, 'rewards' | 'stackRewards'>,
    level: number,
    memberRoleIds: Iterable<string>,
): { add: string[]; remove: string[] } {
    const has = new Set(memberRoleIds);
    const desired = new Set(rewardRolesForLevel(settings, level));
    const managed = new Set(settings.rewards.map((reward) => reward.roleId));
    return {
        add: [...desired].filter((roleId) => !has.has(roleId)),
        remove: [...managed].filter((roleId) => !desired.has(roleId) && has.has(roleId)),
    };
}

export interface LevelUpVars {
    mention: string;
    user: string;
    level: string;
    previousLevel: string;
    server: string;
    roles: string;
}

export function fillLevelUpMessage(template: string, vars: LevelUpVars): string {
    return String(template || '').replace(/\{(\w+)\}/g, (match, key: string) =>
        Object.prototype.hasOwnProperty.call(vars, key) ? vars[key as keyof LevelUpVars] : match,
    );
}

// ==========================================
// API
// ==========================================
export const RANK_PREVIEW_KINDS = ['rank', 'leaderboard', 'levelup'] as const;
export type RankPreviewKind = (typeof RANK_PREVIEW_KINDS)[number];

export interface RankCardMeta {
    layouts: typeof RANK_LAYOUTS;
    layoutLabels: typeof RANK_LAYOUT_LABELS;
    sizes: typeof RANK_CARD_SIZES;
    fonts: typeof WELCOME_FONTS;
    shapes: typeof SHAPES;
    colorPresets: typeof RANK_COLOR_PRESETS;
    limits: typeof RANK_LIMITS;
    placeholders: typeof LEVEL_UP_PLACEHOLDERS;
    destinations: typeof LEVEL_UP_DESTINATION_LABELS;
    defaultTheme: RankCardTheme;
    defaultLevelUp: LevelUpSettings;
}

// การ์ดของผู้ใช้ที่ login อยู่ในเซิร์ฟเวอร์นี้
export interface MyRankCardResponse {
    // false = บัญชีนี้ยังไม่ได้เชื่อม Discord หรือไม่ได้เป็นสมาชิกเซิร์ฟเวอร์ → แต่งการ์ดไม่ได้
    available: boolean;
    reason: string | null;
    permissions: RankMemberPermissions;
    // ค่าที่บันทึกไว้ (หลังตัดค่าที่ธีมไม่อนุญาตแล้ว)
    style: RankMemberStyle;
    themeStyle: RankCardStyle;
}

export interface RankPreviewResponse {
    // data:image/png;base64,...
    image: string;
}

// ยศรางวัลที่บอทให้ไม่ได้ (ยศสูงกว่ายศของบอท / ยศของบอทอื่น / ยศถูกลบ)
export interface LevelUpSettingsResponse {
    settings: LevelUpSettings;
    warnings: string[];
}

export interface RewardSyncResponse {
    success: true;
    // จำนวนสมาชิกที่จะตรวจยศ (ทำงานเบื้องหลัง)
    queued: number;
    message: string;
}

export const rankThemeInputSchema = z.object({
    theme: z
        .unknown()
        .optional()
        .transform((value) => normalizeRankTheme(value)),
});
export const rankMemberStyleInputSchema = z.object({
    style: z
        .unknown()
        .optional()
        .transform((value) => normalizeMemberStyle(value)),
});
export const levelUpInputSchema = z.object({
    settings: z
        .unknown()
        .optional()
        .transform((value) => normalizeLevelUpSettings(value)),
});

export const rankPreviewSchema = z.object({
    kind: z.enum(RANK_PREVIEW_KINDS).default('rank'),
    theme: z
        .unknown()
        .optional()
        .transform((value) => normalizeRankTheme(value)),
    levelUp: z
        .unknown()
        .optional()
        .transform((value) => normalizeLevelUpSettings(value)),
});

export const myRankPreviewSchema = z.object({
    kind: z.enum(RANK_PREVIEW_KINDS).default('rank'),
    style: z
        .unknown()
        .optional()
        .transform((value) => normalizeMemberStyle(value)),
});
