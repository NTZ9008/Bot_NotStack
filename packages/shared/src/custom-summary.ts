import { z } from 'zod';
import { SNOWFLAKE_RE, optionalDate, optionalText } from './common';
import type { PluginId } from './plugins';

// ==========================================
// 📊 CUSTOM LOG SUMMARY & REPORT BUILDER
// ประเภทข้อมูลและ Schema ที่ใช้ร่วมกันระหว่าง Backend และ Frontend
// ==========================================

export const CUSTOM_SUMMARY_CORE_MODULES = ['voice', 'messages', 'server'] as const;
export const CUSTOM_SUMMARY_PLUGIN_MODULES = ['githubPr', 'devops'] as const;
export const CUSTOM_SUMMARY_MODULES = [...CUSTOM_SUMMARY_CORE_MODULES, ...CUSTOM_SUMMARY_PLUGIN_MODULES] as const;
export type CustomSummaryModule = (typeof CUSTOM_SUMMARY_MODULES)[number];

/** กรองโมดูลรายงานให้เหลือเฉพาะ Core และปลั๊กอินที่ติดตั้งจริงในเซิร์ฟเวอร์ */
export function filterActiveSummaryModules(
    modules: readonly CustomSummaryModule[],
    installedPlugins?: readonly PluginId[],
): CustomSummaryModule[] {
    if (!installedPlugins) return [...modules];
    const set = new Set<PluginId>(installedPlugins);
    const hasPr = set.has('github-pr');
    const hasDevops = set.has('grafana-alert') || set.has('jira-card');
    return modules.filter((mod) => {
        if (mod === 'githubPr') return hasPr;
        if (mod === 'devops') return hasDevops;
        return true;
    });
}

export const CUSTOM_SUMMARY_CHANNEL_GROUPS = ['text', 'voice', 'devops'] as const;
export type CustomSummaryChannelGroup = (typeof CUSTOM_SUMMARY_CHANNEL_GROUPS)[number];

export const CUSTOM_SUMMARY_PDF_THEMES = ['dark', 'light'] as const;
export type CustomSummaryPdfTheme = (typeof CUSTOM_SUMMARY_PDF_THEMES)[number];

export const CUSTOM_SUMMARY_DETAIL_MODES = ['executive', 'detailed'] as const;
export type CustomSummaryDetailMode = (typeof CUSTOM_SUMMARY_DETAIL_MODES)[number];

export interface CustomSummaryChannelOption {
    id: string;
    name: string;
    category: string;
    group: CustomSummaryChannelGroup;
    isVoice: boolean;
    isDevops: boolean;
    devopsTags: ('pr' | 'grafana' | 'jira')[];
    historicalOnly?: boolean;
}

const channelIdListSchema = z
    .array(z.string().trim().regex(SNOWFLAKE_RE, 'รูปแบบ Channel ID ไม่ถูกต้อง'))
    .max(300, 'เลือกห้องได้สูงสุด 300 ห้อง')
    .default([]);

const rawModuleSchema = z.enum([...CUSTOM_SUMMARY_MODULES, 'devopsOther'] as const);

const modulesSchema = z
    .array(rawModuleSchema)
    .min(1, 'กรุณาเลือกประเภทกิจกรรมอย่างน้อย 1 รายการ')
    .transform((items): CustomSummaryModule[] => {
        const expanded: CustomSummaryModule[] = [];
        for (const item of items) {
            if (item === 'devopsOther') expanded.push('server', 'devops');
            else expanded.push(item);
        }
        return [...new Set(expanded)];
    })
    .default([...CUSTOM_SUMMARY_MODULES]);

const optionalSnowflake = z
    .unknown()
    .transform((value) => (typeof value === 'string' && SNOWFLAKE_RE.test(value.trim()) ? value.trim() : undefined))
    .optional();

export const customSummaryRequestSchema = z
    .object({
        from: optionalDate,
        to: optionalDate,
        hours: z.coerce.number().int().min(1).max(8760).optional(),
        interval: z.enum(['auto', 'hour', 'day']).default('auto'),
        channelIds: channelIdListSchema,
        modules: modulesSchema,
        userId: optionalSnowflake,
        userQuery: optionalText(100),
        includeBots: z.boolean().default(false),
        includeDetailedLogs: z.boolean().default(true),
        detailedLogLimit: z.coerce.number().int().min(10).max(500).default(200),
    })
    .refine((data) => !(data.from && data.to && data.from.getTime() > data.to.getTime()), {
        message: 'วันเวลาเริ่มต้นต้องไม่มากกว่าวันเวลาสิ้นสุด',
    });

export type CustomSummaryRequestInput = z.input<typeof customSummaryRequestSchema>;
export type CustomSummaryRequest = z.output<typeof customSummaryRequestSchema>;

export const customSummaryPdfRequestSchema = customSummaryRequestSchema.extend({
    title: z
        .string({ error: 'กรุณาระบุชื่อหัวข้อรายงาน' })
        .trim()
        .min(1, 'กรุณาระบุชื่อหัวข้อรายงาน')
        .max(160, 'ชื่อหัวข้อรายงานต้องไม่เกิน 160 ตัวอักษร')
        .default('รายงานสรุปกิจกรรมเซิร์ฟเวอร์'),
    theme: z.enum(CUSTOM_SUMMARY_PDF_THEMES).default('dark'),
    detailMode: z.enum(CUSTOM_SUMMARY_DETAIL_MODES).default('executive'),
    maskIds: z.boolean().default(false),
});

export type CustomSummaryPdfRequestInput = z.input<typeof customSummaryPdfRequestSchema>;
export type CustomSummaryPdfRequest = z.output<typeof customSummaryPdfRequestSchema>;

export interface CustomSummaryVoiceKpi {
    totalSeconds: number;
    totalMinutes: number;
    joins: number;
    leaves: number;
    switches: number;
    sessions: number;
    avgSessionMinutes: number;
    activeAtCutoffCount: number;
}

export interface CustomSummaryMessagesKpi {
    totalSent: number;
    deleted: number;
    edited: number;
    busiestChannel: { channelId: string; channelName: string; count: number } | null;
}

export interface CustomSummaryGithubPrKpi {
    totalNotifications: number;
    openedOrUpdated: number;
    merged: number;
    closed: number;
    mergeRatePercent: number;
    uniquePrCount: number;
}

export interface CustomSummaryServerKpi {
    memberJoin: number;
    memberLeave: number;
    netMembers: number;
    commandsUsed: number;
}

export interface CustomSummaryDevopsKpi {
    grafanaSent: number;
    grafanaFiring: number;
    grafanaResolved: number;
    jiraCreated: number;
    jiraIssueCreated: number;
    jiraClosed: number;
}

export interface CustomSummaryTimelinePoint {
    bucket: string;
    label: string;
    messages: number;
    voiceJoins: number;
    voiceLeaves: number;
    voiceMinutes: number;
    prSent: number;
    prMerged: number;
    prClosed: number;
    grafanaAlerts: number;
    jiraCards: number;
    memberJoin: number;
    memberLeave: number;
}

export interface CustomSummaryVoiceChannelRow {
    channelId: string;
    channelName: string;
    totalSeconds: number;
    totalMinutes: number;
    joins: number;
    leaves: number;
    sessions: number;
    avgSessionMinutes: number;
    uniqueUsers: number;
    activeAtCutoffCount: number;
}

export interface CustomSummaryPrRepoRow {
    repoFullName: string;
    channelId: string;
    channelName: string;
    sent: number;
    merged: number;
    closed: number;
    total: number;
}

export interface CustomSummaryPrChannelRow {
    channelId: string;
    channelName: string;
    sent: number;
    merged: number;
    closed: number;
    total: number;
}

export interface CustomSummaryChannelRow {
    channelId: string;
    channelName: string;
    kind: CustomSummaryChannelGroup;
    messages: number;
    voiceSeconds: number;
    voiceMinutes: number;
    voiceJoins: number;
    voiceLeaves: number;
    prEvents: number;
    grafanaAlerts: number;
    jiraCards: number;
    otherEvents: number;
    totalActivity: number;
}

export interface CustomSummaryContributorRow {
    userId: string;
    userName: string;
    isBot: boolean;
    voiceSeconds: number;
    voiceMinutes: number;
    voiceSessions: number;
    voiceJoins: number;
    messages: number;
    prActivity: number;
    jiraTickets: number;
    commandsUsed: number;
    totalScore: number;
    lastSeen: string | null;
}

export interface CustomSummaryLogRow {
    id: string;
    createdAt: string;
    source: 'activity' | 'pr' | 'grafana' | 'jira';
    eventKey: string;
    eventLabel: string;
    userId: string | null;
    userName: string | null;
    isBot: boolean;
    channelId: string | null;
    channelName: string | null;
    summary: string;
}

export interface CustomSummaryResponse {
    guild: {
        id: string;
        name: string;
        iconUrl: string | null;
    };
    range: {
        from: string;
        to: string;
        cutoff: string;
        interval: 'hour' | 'day';
        timeZone: 'Asia/Bangkok';
    };
    filters: {
        channelIds: string[];
        selectedChannels: CustomSummaryChannelOption[];
        modules: CustomSummaryModule[];
        userId: string | null;
        userQuery: string | null;
        includeBots: boolean;
    };
    availableChannels: CustomSummaryChannelOption[];
    kpis: {
        voice: CustomSummaryVoiceKpi;
        messages: CustomSummaryMessagesKpi;
        server: CustomSummaryServerKpi;
        githubPr: CustomSummaryGithubPrKpi;
        devops: CustomSummaryDevopsKpi;
        activeUsers: number;
        totalEvents: number;
    };
    timeline: CustomSummaryTimelinePoint[];
    voiceChannels: CustomSummaryVoiceChannelRow[];
    prBreakdown: {
        byRepo: CustomSummaryPrRepoRow[];
        byChannel: CustomSummaryPrChannelRow[];
    };
    channelBreakdown: CustomSummaryChannelRow[];
    topContributors: CustomSummaryContributorRow[];
    detailedLogs: CustomSummaryLogRow[];
    detailedLogsTruncated: boolean;
    installedPlugins?: PluginId[];
    generatedAt: string;
}
