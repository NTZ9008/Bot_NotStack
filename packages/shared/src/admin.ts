import { z } from 'zod';
import { passwordSchema, ROLES, usernameSchema, type PublicUser, type UserRole } from './auth';
import { optionalBoolean, optionalDate, optionalId, optionalText, type CursorPage } from './common';

// ==========================================
// 👥 USERS — จัดการผู้ใช้ Dashboard (ADMIN)
// ==========================================
export interface AdminUser extends PublicUser {
    failedLogins: number;
    activeSessions: number;
    isSelf: boolean;
}

const displayNameInput = z
    .unknown()
    .transform((value) => (typeof value === 'string' ? value.trim().slice(0, 64) || null : null))
    .optional()
    .transform((value) => value ?? null);

export const createUserSchema = z.object({
    username: usernameSchema,
    password: passwordSchema,
    role: z.enum(ROLES, { error: 'role ไม่ถูกต้อง' }).default('USER'),
    displayName: displayNameInput,
});
export type CreateUserInput = z.input<typeof createUserSchema>;

// แก้ได้ทีละหลายฟิลด์ — ตรวจค่าและกฎ "ห้ามแก้ตัวเอง" ต่อที่ service (ลำดับข้อความ error เหมือนเดิม)
export interface UpdateUserInput {
    role?: UserRole;
    isActive?: boolean;
    displayName?: string;
    username?: string;
    password?: string;
    unlock?: boolean;
}

export interface RevokeSessionsResponse {
    success: true;
    revoked: number;
}

// ==========================================
// 📜 AUDIT LOGS — การกระทำบน Dashboard
// ==========================================
export interface AuditLogItem {
    id: number;
    // เซิร์ฟเวอร์ที่ถูกแก้ (null = ระบบ login / จัดการผู้ใช้)
    guildId: string | null;
    actorId: number | null;
    actorName: string | null;
    action: string;
    targetType: string | null;
    targetId: string | null;
    success: boolean;
    metadata: unknown;
    ip: string | null;
    userAgent: string | null;
    createdAt: string;
}
export type AuditLogPage = CursorPage<AuditLogItem>;

export const auditLogQuerySchema = z.object({
    action: optionalText(100),
    actorId: optionalId,
    q: optionalText(100),
    success: optionalBoolean,
    from: optionalDate,
    to: optionalDate,
    cursor: optionalId,
    limit: optionalId.transform((value) => Math.min(value ?? 50, 200)),
});
export type AuditLogQuery = z.output<typeof auditLogQuerySchema>;

export const AUDIT_ACTION_LABELS: Record<string, string> = {
    'auth.login': 'เข้าสู่ระบบ',
    'auth.login_failed': 'เข้าสู่ระบบไม่สำเร็จ',
    'auth.logout': 'ออกจากระบบ',
    'auth.logout_all': 'ออกจากระบบทุกอุปกรณ์',
    'auth.account_locked': 'บัญชีถูกล็อก',
    'auth.refresh_reuse_detected': 'ตรวจพบ session ถูกขโมย/ใช้ซ้ำ',
    'auth.password_change': 'เปลี่ยนรหัสผ่าน',
    'auth.discord_register': 'สมัครผ่าน Discord',
    'auth.discord_link': 'เชื่อมต่อ Discord',
    'auth.discord_unlink': 'ยกเลิกเชื่อมต่อ Discord',
    'user.create': 'เพิ่มผู้ใช้',
    'user.update': 'แก้ไขผู้ใช้',
    'user.delete': 'ลบผู้ใช้',
    'user.sessions_revoke': 'บังคับออกจากระบบ',
    'config.update': 'แก้ไข Configuration',
    'news.send': 'ส่งประกาศข่าว',
    'room_access.change': 'สิทธิ์เข้าห้อง',
    'pr_bot.update': 'ตั้งค่า PR Bot',
    'pr_bot.secret_rotate': 'สร้าง Webhook Secret ใหม่',
    'room_access.room_add': 'เพิ่มห้อง Room Access',
    'room_access.room_remove': 'เอาห้องออกจาก Room Access',
    'weather.settings_update': 'ตั้งค่ารายงานสภาพอากาศ',
    'weather.test_send': 'ส่งรายงานสภาพอากาศทดสอบ',
    'welcome.card_create': 'สร้างการ์ดต้อนรับ',
    'welcome.card_update': 'แก้ไขการ์ดต้อนรับ',
    'welcome.card_delete': 'ลบการ์ดต้อนรับ',
    'welcome.test_send': 'ส่งการ์ดต้อนรับทดสอบ',
    'welcome.asset_upload': 'อัปโหลดรูปพื้นหลัง',
    'welcome.asset_rename': 'เปลี่ยนชื่อรูปพื้นหลัง',
    'welcome.asset_delete': 'ลบรูปพื้นหลัง',
};

export const AUDIT_GROUP_LABELS: Record<string, string> = {
    auth: 'การเข้าสู่ระบบ',
    user: 'จัดการผู้ใช้',
    config: 'Configuration',
    news: 'ประกาศข่าว',
    room_access: 'Room Access',
    voice_guard: 'Voice Guard',
    log_settings: 'Log Management',
    pr_bot: 'PR Bot',
    welcome: 'Welcome Announcement',
    weather: 'Weather',
};

export function auditLabel(action: string): string {
    if (AUDIT_ACTION_LABELS[action]) return AUDIT_ACTION_LABELS[action];
    const group = action.split('.')[0] ?? action;
    return AUDIT_GROUP_LABELS[group] ?? action;
}

// ==========================================
// 🛰️ ACTIVITY — เหตุการณ์ในเซิร์ฟเวอร์ Discord (กราฟหน้า Overview + ตาราง Activity Log)
// ==========================================
export interface ActivityItem {
    id: number;
    eventKey: string;
    guildId: string | null;
    userId: string | null;
    userName: string | null;
    isBot: boolean;
    channelId: string | null;
    channelName: string | null;
    executorId: string | null;
    executorName: string | null;
    summary: string | null;
    metadata: ActivityMetadata | null;
    createdAt: string;
    label: string;
    group: string;
}
export type ActivityPage = CursorPage<ActivityItem>;

export interface ActivityMetadata {
    fields?: { name: string; value: string }[];
    [key: string]: unknown;
}

export const ACTIVITY_INTERVALS = ['hour', 'day'] as const;
export type ActivityInterval = (typeof ACTIVITY_INTERVALS)[number];

// ช่วงเวลาที่จะดู — ไม่ระบุ = 7 วันล่าสุด (คำนวณต่อที่ service)
const rangeQuery = {
    from: optionalDate,
    to: optionalDate,
    interval: z
        .unknown()
        .transform((value) => (value === 'hour' || value === 'day' ? value : undefined))
        .optional(),
    includeBots: z
        .unknown()
        .transform((value) => value === 'true')
        .optional()
        .transform((value) => value ?? false),
};

export const activityStatsQuerySchema = z.object({
    ...rangeQuery,
    tz: optionalText(64),
    limit: optionalId.transform((value) => Math.min(value ?? 10, 50)),
});
export type ActivityStatsQuery = z.output<typeof activityStatsQuerySchema>;

const snowflakeQuery = z
    .unknown()
    .transform((value) => (typeof value === 'string' && /^\d{5,25}$/.test(value) ? value : undefined))
    .optional();

export const activityQuerySchema = z.object({
    ...rangeQuery,
    // eventKey รับได้หลายค่า คั่นด้วย , (เช่น voiceJoin,voiceLeave)
    eventKey: z
        .unknown()
        .transform((value) =>
            typeof value === 'string' && value
                ? value.split(',').map((key) => key.trim()).filter(Boolean).slice(0, 50)
                : undefined,
        )
        .optional(),
    userId: snowflakeQuery,
    channelId: snowflakeQuery,
    q: optionalText(100),
    cursor: optionalId,
    limit: optionalId.transform((value) => Math.min(value ?? 50, 200)),
});
export type ActivityQuery = z.output<typeof activityQuerySchema>;

export interface ActivityTopUser {
    userId: string;
    userName: string;
    isBot: boolean;
    total: number;
    messages: number;
    voiceJoins: number;
    commands: number;
    lastSeen: string;
}

export interface ActivityStats {
    range: { from: string; to: string; interval: ActivityInterval; timeZone: string; includeBots: boolean };
    labels: string[];
    datasets: {
        serverJoin: number[];
        serverLeave: number[];
        voiceJoin: number[];
        voiceLeave: number[];
        total: number[];
    };
    summary: {
        totalEvents: number;
        serverJoin: number;
        serverLeave: number;
        voiceJoin: number;
        voiceLeave: number;
        messages: number;
        activeUsers: number;
        voiceMinutes: number;
    };
    topUsers: ActivityTopUser[];
    topVoiceChannels: { channelId: string; channelName: string; joins: number; members: number }[];
    topVoiceUsers: { userId: string; userName: string; minutes: number; sessions: number }[];
    voiceChannelMinutes: { channelId: string; channelName: string; minutes: number }[];
    breakdown: { eventKey: string; label: string; group: string; total: number }[];
    truncated: boolean;
}

export interface ActivityEventType {
    key: string;
    label: string;
    group: string;
}

export interface ActivityMeta {
    total: number;
    since: string | null;
    retentionDays: number;
    enabled: boolean;
    eventTypes: ActivityEventType[];
}
