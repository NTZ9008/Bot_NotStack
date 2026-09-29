import { z } from 'zod';
import { SNOWFLAKE_RE } from './common';

export const MAX_XP = 2_000_000_000;
const ids = z.array(z.string().regex(SNOWFLAKE_RE, 'Discord ID ไม่ถูกต้อง')).max(100);
export const XP_SOURCES = ['message', 'voice', 'command'] as const;
export type XpSource = (typeof XP_SOURCES)[number];
export const XP_SOURCE_LABELS: Record<XpSource, string> = { message: 'ส่งข้อความ', voice: 'อยู่ห้องเสียง', command: 'ใช้คำสั่งบอท' };

export const xpRuleSchema = z
    .object({
        id: z
            .string()
            .min(1)
            .max(64)
            .regex(/^[a-zA-Z0-9_-]+$/),
        name: z.string().trim().min(1).max(80),
        enabled: z.boolean(),
        source: z.enum(XP_SOURCES),
        minXp: z.number().int().min(0).max(100000),
        maxXp: z.number().int().min(0).max(100000),
        multiplierPercent: z.number().min(0).max(1000),
        chancePercent: z.number().min(0).max(100),
        cooldownSeconds: z.number().int().min(1).max(86400),
        dailyCap: z.number().int().min(0).max(MAX_XP),
        channelIds: ids,
        roleIds: ids,
        commands: z
            .array(
                z
                    .string()
                    .trim()
                    .min(1)
                    .max(32)
                    .regex(/^[\p{L}\p{N}_-]+$/u),
            )
            .max(100),
    })
    .refine((r) => r.minXp <= r.maxXp, { message: 'XP ต่ำสุดต้องไม่เกิน XP สูงสุด', path: ['maxXp'] });
export type XpRule = z.infer<typeof xpRuleSchema>;
export function defaultXpRule(source: XpSource = 'message', id: string = source): XpRule {
    return {
        id,
        name: XP_SOURCE_LABELS[source],
        enabled: source !== 'command',
        source,
        minXp: source === 'voice' ? 5 : 15,
        maxXp: source === 'voice' ? 10 : 25,
        multiplierPercent: 100,
        chancePercent: 100,
        cooldownSeconds: 60,
        dailyCap: 0,
        channelIds: [],
        roleIds: [],
        commands: [],
    };
}
export const xpSettingsSchema = z
    .object({
        enabled: z.boolean(),
        multiplierPercent: z.number().min(0).max(1000),
        dailyCap: z.number().int().min(0).max(MAX_XP),
        curveBase: z.number().int().min(1).max(100000),
        curveExponent: z.number().min(1).max(3),
        excludedChannelIds: ids,
        excludedRoleIds: ids,
        messageMinLength: z.number().int().min(0).max(4000),
        voiceIgnoreMuted: z.boolean(),
        voiceIgnoreDeafened: z.boolean(),
        voiceIgnoreAfk: z.boolean(),
        voiceMinMembers: z.number().int().min(1).max(99),
        rules: z.array(xpRuleSchema).max(50),
    })
    .refine((s) => new Set(s.rules.map((r) => r.id)).size === s.rules.length, { message: 'รหัสกฎซ้ำกัน', path: ['rules'] });
export type XpSettings = z.infer<typeof xpSettingsSchema>;
export const defaultXpSettings = (): XpSettings => ({
    enabled: true,
    multiplierPercent: 100,
    dailyCap: 0,
    curveBase: 100,
    curveExponent: 2,
    excludedChannelIds: [],
    excludedRoleIds: [],
    messageMinLength: 0,
    voiceIgnoreMuted: true,
    voiceIgnoreDeafened: true,
    voiceIgnoreAfk: true,
    voiceMinMembers: 1,
    rules: [defaultXpRule('message'), defaultXpRule('voice')],
});
export const xpSettingsUpdateSchema = z.object({ revision: z.number().int().min(0), settings: xpSettingsSchema });
export interface XpSettingsResponse {
    revision: number;
    settings: XpSettings;
}

export interface LevelRow {
    userId: string;
    xp: number;
    level: number;
    username: string;
    rank: number;
}
export interface LevelPage {
    items: LevelRow[];
    total: number;
    page: number;
    pageSize: number;
    settings: Pick<XpSettings, 'curveBase' | 'curveExponent'>;
    searchLimited?: boolean;
}
export const levelQuerySchema = z.object({
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    userId: z.string().regex(SNOWFLAKE_RE).optional(),
    q: z.string().trim().min(1).max(100).optional(),
});
export type LevelQuery = z.infer<typeof levelQuerySchema>;
export const xpMemberMutationSchema = z.object({
    userId: z.string().regex(SNOWFLAKE_RE),
    action: z.enum(['add', 'subtract', 'set', 'reset', 'delete']),
    amount: z.number().int().min(0).max(MAX_XP),
    reason: z.string().trim().min(1, 'กรุณาระบุเหตุผล').max(300),
});
export type XpMemberMutation = z.infer<typeof xpMemberMutationSchema>;
export const xpResetGuildSchema = z.object({ confirmation: z.literal('RESET XP'), reason: z.string().trim().min(1).max(300) });
export const xpHistoryQuerySchema = z.object({
    userId: z.string().regex(SNOWFLAKE_RE).optional(),
    cursor: z.coerce.number().int().positive().optional(),
});
export interface XpHistoryRow {
    id: number;
    userId: string;
    source: string;
    delta: number;
    balance: number;
    reason: string;
    actorId: number | null;
    createdAt: string;
}
export interface XpHistoryPage {
    items: XpHistoryRow[];
    nextCursor: number | null;
}

export const xpAtLevel = (level: number, curve: Pick<XpSettings, 'curveBase' | 'curveExponent'> = { curveBase: 100, curveExponent: 2 }): number =>
    Math.ceil(curve.curveBase * Math.pow(Math.max(0, level), curve.curveExponent));
export const xpForNextLevel = (level: number, curve?: Pick<XpSettings, 'curveBase' | 'curveExponent'>): number => xpAtLevel(level + 1, curve);
export function levelForXp(xp: number, curve: Pick<XpSettings, 'curveBase' | 'curveExponent'>): number {
    let level = Math.floor(Math.pow(Math.max(0, xp) / curve.curveBase, 1 / curve.curveExponent));
    while (level > 0 && xpAtLevel(level, curve) > xp) level--;
    while (xpAtLevel(level + 1, curve) <= xp) level++;
    return level;
}
export interface XpContext {
    source: XpSource;
    channelId: string;
    parentId?: string | null;
    categoryId?: string | null;
    roleIds: string[];
    command?: string;
    messageLength?: number;
    muted?: boolean;
    deafened?: boolean;
    afk?: boolean;
    voiceMembers?: number;
}
export function matchingXpRules(settings: XpSettings, ctx: XpContext): XpRule[] {
    const channels = [ctx.channelId, ctx.parentId, ctx.categoryId].filter((id): id is string => Boolean(id));
    if (
        !settings.enabled ||
        channels.some((id) => settings.excludedChannelIds.includes(id)) ||
        ctx.roleIds.some((id) => settings.excludedRoleIds.includes(id))
    )
        return [];
    if (ctx.source === 'message' && (ctx.messageLength ?? 0) < settings.messageMinLength) return [];
    if (
        ctx.source === 'voice' &&
        ((settings.voiceIgnoreMuted && ctx.muted) ||
            (settings.voiceIgnoreDeafened && ctx.deafened) ||
            (settings.voiceIgnoreAfk && ctx.afk) ||
            (ctx.voiceMembers ?? 0) < settings.voiceMinMembers)
    )
        return [];
    return settings.rules.filter(
        (r) =>
            r.enabled &&
            r.source === ctx.source &&
            (!r.channelIds.length || channels.some((id) => r.channelIds.includes(id))) &&
            (!r.roleIds.length || ctx.roleIds.some((id) => r.roleIds.includes(id))) &&
            (ctx.source !== 'command' || !r.commands.length || r.commands.includes(ctx.command ?? '')),
    );
}
export function rollXp(rule: XpRule, globalMultiplier: number, random: () => number = Math.random): number {
    if (rule.chancePercent <= 0 || random() * 100 >= rule.chancePercent) return 0;
    const base = rule.minXp + Math.floor(random() * (rule.maxXp - rule.minXp + 1));
    return Math.floor((((base * rule.multiplierPercent) / 100) * globalMultiplier) / 100);
}
