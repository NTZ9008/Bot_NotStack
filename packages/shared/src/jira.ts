import { z } from 'zod';
import { HEX_COLOR_RE, SNOWFLAKE_RE } from './common';

// ==========================================
// 🎫 JIRA TICKET — เปิด Jira card จาก Discord แบบระบบ ticket
// สมาชิกกดปุ่มในห้องแผง (panel) → บอทสร้างห้องส่วนตัว (เห็นแค่คนกด + ยศทีมงาน) → เลือกประเภท + กรอก title/description
// → บอทสร้าง issue ใน Jira แล้วส่งลิงก์เข้าห้องนั้น และแจ้งในห้อง log ว่าใครเปิด card อะไร
// รองรับเฉพาะ Jira Cloud (https://<site>.atlassian.net) ยืนยันตัวตนด้วยอีเมล + API token ของบัญชี Atlassian
// options เก็บเป็น JSON ในคอลัมน์ jira_settings.options — ผ่าน normalizeJiraOptions ทุกครั้งที่อ่าน/บันทึก
// ==========================================

export const JIRA_LIMITS = {
    // Jira จำกัด summary ไว้ 255 ตัวอักษร
    maxTitleLength: 255,
    // ช่องข้อความยาวใน pop-up ของ Discord ได้สูงสุด 4000
    maxDescriptionLength: 4000,
    // เมนูเลือกของ Discord มีตัวเลือกได้สูงสุด 25
    maxIssueTypes: 25,
    maxStaffRoles: 25,
    maxPanelTitleLength: 256,
    maxPanelDescriptionLength: 2000,
    maxButtonLabelLength: 80,
    maxIssueTypeLabelLength: 100,
    // ช่องแนบไฟล์ใน pop-up ของ Discord รับได้สูงสุด 10 ไฟล์
    maxImages: 10,
    // ขนาดต่อรูปที่บอทยอมดาวน์โหลดไปแนบใน Jira (เท่าขีดจำกัดอัปโหลดของบัญชี Discord ทั่วไป)
    maxImageBytes: 10 * 1024 * 1024,
    // ปิดห้องอัตโนมัติหลังสร้าง card ได้นานสุด 1 ชั่วโมง
    maxAutoCloseSeconds: 3600,
} as const;

// ประเภท card ที่ให้เลือกใน Discord (id/name มาจาก issue type ของโปรเจกต์ใน Jira)
export interface JiraIssueTypeOption {
    id: string;
    name: string;
    // emoji หน้าชื่อในเมนู (ว่าง = ไม่มี)
    emoji: string;
}

export interface JiraPanelAppearance {
    title: string;
    description: string;
    buttonLabel: string;
    color: string;
}

export interface JiraOptions {
    issueTypes: JiraIssueTypeOption[];
    // ยศที่เห็นห้องส่วนตัวทุกห้อง (นอกจากคนเปิด) — ผู้มีสิทธิ์ Administrator ใน Discord เห็นอยู่แล้วเสมอ
    staffRoleIds: string[];
    // จำนวนรูปที่แนบได้ต่อ card ในช่องแนบรูปของ pop-up (0 = ไม่มีช่องแนบรูป)
    maxImages: number;
    // ปิด (ลบ) ห้องส่วนตัวอัตโนมัติกี่วินาทีหลังสร้าง card สำเร็จ (0 = ไม่ปิดเอง ต้องกดปิดห้อง)
    autoCloseSeconds: number;
    panel: JiraPanelAppearance;
}

export interface JiraSettings {
    enabled: boolean;
    siteUrl: string;
    email: string;
    // ไม่ส่ง token กลับไปหน้าเว็บ บอกแค่ว่าตั้งไว้แล้วหรือยัง
    apiTokenSet: boolean;
    projectKey: string;
    panelChannelId: string;
    // ข้อความแผงที่ส่งไว้ล่าสุด (ส่งซ้ำ = แก้ข้อความเดิม)
    panelMessageId: string;
    logChannelId: string;
    // หมวดหมู่ที่จะสร้างห้องส่วนตัว ('' = ไม่อยู่ในหมวดหมู่)
    categoryId: string;
    options: JiraOptions;
    updatedAt: string | null;
}

export const defaultJiraOptions = (): JiraOptions => ({
    issueTypes: [],
    staffRoleIds: [],
    maxImages: 5,
    autoCloseSeconds: 15,
    panel: {
        title: '🎫 เปิด Jira card',
        description: 'กดปุ่มด้านล่างเพื่อเปิด card ใหม่ — บอทจะสร้างห้องส่วนตัวให้ เลือกประเภท แล้วกรอกหัวข้อและรายละเอียด',
        buttonLabel: 'เปิด Jira card',
        color: '#2684FF',
    },
});

const str = (value: unknown, max: number, fallback = ''): string => (typeof value === 'string' ? value.trim().slice(0, max) : fallback);

// options ในฐานข้อมูล/จากหน้าเว็บ → รูปแบบที่ถูกต้องเสมอ (ตัดฟิลด์แปลกปลอม, ตัดความยาว, id ซ้ำเหลืออันเดียว)
export function normalizeJiraOptions(raw: unknown): JiraOptions {
    const defaults = defaultJiraOptions();
    const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const panelSrc = src.panel && typeof src.panel === 'object' ? (src.panel as Record<string, unknown>) : {};

    const seenTypes = new Set<string>();
    const issueTypes: JiraIssueTypeOption[] = [];
    for (const item of Array.isArray(src.issueTypes) ? src.issueTypes : []) {
        if (!item || typeof item !== 'object') continue;
        const type = item as Record<string, unknown>;
        const id = str(type.id, 50);
        const name = str(type.name, JIRA_LIMITS.maxIssueTypeLabelLength);
        if (!/^\d+$/.test(id) || !name || seenTypes.has(id)) continue;
        seenTypes.add(id);
        issueTypes.push({ id, name, emoji: str(type.emoji, 64) });
        if (issueTypes.length >= JIRA_LIMITS.maxIssueTypes) break;
    }

    const staffRoleIds = [
        ...new Set((Array.isArray(src.staffRoleIds) ? src.staffRoleIds : []).filter((id): id is string => typeof id === 'string' && SNOWFLAKE_RE.test(id))),
    ].slice(0, JIRA_LIMITS.maxStaffRoles);

    const color = typeof panelSrc.color === 'string' && HEX_COLOR_RE.test(panelSrc.color) ? panelSrc.color.toUpperCase() : defaults.panel.color;
    const clampInt = (value: unknown, max: number, fallback: number) =>
        typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(0, Math.trunc(value))) : fallback;
    const maxImages = clampInt(src.maxImages, JIRA_LIMITS.maxImages, defaults.maxImages);
    const autoCloseSeconds = clampInt(src.autoCloseSeconds, JIRA_LIMITS.maxAutoCloseSeconds, defaults.autoCloseSeconds);
    return {
        issueTypes,
        staffRoleIds,
        maxImages,
        autoCloseSeconds,
        panel: {
            title: str(panelSrc.title, JIRA_LIMITS.maxPanelTitleLength, defaults.panel.title),
            description: str(panelSrc.description, JIRA_LIMITS.maxPanelDescriptionLength, defaults.panel.description),
            buttonLabel: str(panelSrc.buttonLabel, JIRA_LIMITS.maxButtonLabelLength) || defaults.panel.buttonLabel,
            color,
        },
    };
}

// Jira Cloud เท่านั้น — กันไม่ให้ใช้บอทยิง request ไปที่ host อื่น (เช่นเครื่องในเครือข่ายภายใน)
export const JIRA_SITE_RE = /^https:\/\/[a-z0-9][a-z0-9-]{0,62}\.atlassian\.net$/i;
export const JIRA_PROJECT_KEY_RE = /^[A-Z][A-Z0-9_]{0,49}$/;

// รับได้ทั้ง "https://acme.atlassian.net/jira/software/..." หรือ "acme.atlassian.net" → https://acme.atlassian.net
export function normalizeJiraSiteUrl(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return '';
    try {
        const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
        return `https://${url.hostname.toLowerCase()}`;
    } catch {
        return trimmed;
    }
}

const snowflakeOrEmpty = z
    .string()
    .trim()
    .refine((value) => !value || SNOWFLAKE_RE.test(value), 'Discord ID ไม่ถูกต้อง');

// บันทึกเฉพาะฟิลด์ที่ส่งมา — apiToken ว่าง/ไม่ส่ง = ใช้ token เดิม
export const updateJiraSchema = z.object({
    enabled: z.boolean().optional(),
    siteUrl: z
        .string()
        .transform(normalizeJiraSiteUrl)
        .refine((value) => !value || JIRA_SITE_RE.test(value), 'รองรับเฉพาะ Jira Cloud เช่น https://your-team.atlassian.net')
        .optional(),
    email: z
        .string()
        .trim()
        .max(200)
        .refine((value) => !value || z.email().safeParse(value).success, 'อีเมลไม่ถูกต้อง')
        .optional(),
    apiToken: z.string().trim().max(500).optional(),
    projectKey: z
        .string()
        .trim()
        .transform((value) => value.toUpperCase())
        .refine((value) => !value || JIRA_PROJECT_KEY_RE.test(value), 'Project key ไม่ถูกต้อง (เช่น PROJ)')
        .optional(),
    panelChannelId: snowflakeOrEmpty.optional(),
    logChannelId: snowflakeOrEmpty.optional(),
    categoryId: snowflakeOrEmpty.optional(),
    options: z.unknown().transform(normalizeJiraOptions).optional(),
});
export type UpdateJiraInput = z.input<typeof updateJiraSchema>;

// ทดสอบการเชื่อมต่อด้วยค่าที่กำลังแก้ในหน้าเว็บ — ช่องว่าง = ใช้ค่าที่บันทึกไว้
export const testJiraSchema = z.object({
    siteUrl: z.string().trim().max(300).optional(),
    email: z.string().trim().max(200).optional(),
    apiToken: z.string().trim().max(500).optional(),
    projectKey: z.string().trim().max(50).optional(),
});
export type TestJiraInput = z.input<typeof testJiraSchema>;

export interface JiraSaveResponse {
    success: true;
    settings: JiraSettings;
    // บันทึกแล้วแต่มีเรื่องที่ควรแก้ (เช่นบอทไม่มีสิทธิ์สร้างห้องในหมวดหมู่ที่เลือก)
    warning: string | null;
}

// ผลการทดสอบเชื่อมต่อ — ได้ชื่อโปรเจกต์ + ประเภท issue ทั้งหมดของโปรเจกต์ (ใช้เลือกประเภทที่จะให้เปิดได้)
export interface JiraConnectionResult {
    success: true;
    accountName: string;
    projectName: string;
    issueTypes: { id: string; name: string; description: string; iconUrl: string }[];
}

export type JiraTicketStatus = 'open' | 'created' | 'closed';

export interface JiraTicket {
    id: number;
    userId: string;
    userName: string;
    channelId: string | null;
    status: JiraTicketStatus;
    issueKey: string | null;
    issueUrl: string | null;
    issueType: string | null;
    title: string | null;
    createdAt: string;
    cardCreatedAt: string | null;
    closedAt: string | null;
}

export interface JiraTicketPage {
    items: JiraTicket[];
    total: number;
    openCount: number;
    createdCount: number;
}

export const jiraTicketQuerySchema = z.object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    status: z.enum(['all', 'open', 'created', 'closed']).default('all'),
});
export type JiraTicketQuery = z.input<typeof jiraTicketQuerySchema>;
