import { z } from 'zod';

// ==========================================
// 🧩 PLUGINS — แคตตาล็อกปลั๊กอินเสริมแยกตามเซิร์ฟเวอร์ (Per-Guild)
// ==========================================

export const PLUGIN_IDS = ['github-pr', 'grafana-alert', 'jira-card', 'savings-goal', 'uptime-monitor'] as const;
export type PluginId = (typeof PLUGIN_IDS)[number];

export const PLUGIN_CATEGORIES = ['devops', 'productivity', 'finance', 'community'] as const;
export type PluginCategory = (typeof PLUGIN_CATEGORIES)[number];

export type PluginIconName = 'GitPullRequest' | 'Activity' | 'Ticket' | 'Coins' | 'HeartPulse';

export const PLUGIN_NOT_INSTALLED_CODE = 'PLUGIN_NOT_INSTALLED' as const;
export const PLUGIN_BOT_DISABLED_MESSAGE = 'ฟีเจอร์นี้ยังไม่ถูกเปิดใช้งาน กรุณาติดตั้งปลั๊กอินผ่าน Dashboard ก่อน';

export type PluginRoutePath =
    | '/servers/$guildId/pr-bot'
    | '/servers/$guildId/grafana-alerts'
    | '/servers/$guildId/jira'
    | '/servers/$guildId/funds'
    | '/servers/$guildId/uptime';

export interface PluginDefinition {
    id: PluginId;
    name: string;
    description: string;
    icon: PluginIconName;
    category: PluginCategory;
    version: string;
    routePath: PluginRoutePath;
}

export const PLUGIN_REGISTRY: readonly PluginDefinition[] = [
    {
        id: 'github-pr',
        name: 'แจ้งเตือน GitHub PR',
        description: 'รับ Webhook จาก GitHub แจ้งเตือน Pull Request เข้าห้อง Discord พร้อมอัปเดตสถานะ Review, CI Checks และ Merge อัตโนมัติในข้อความเดียว',
        icon: 'GitPullRequest',
        category: 'devops',
        version: '1.0.0',
        routePath: '/servers/$guildId/pr-bot',
    },
    {
        id: 'grafana-alert',
        name: 'แจ้งเตือน Grafana Alert',
        description: 'รับสถานะ Firing / Resolved จาก Grafana Alertmanager แยกห้องตาม env หรือ severity พร้อมคำสั่ง /grafana ตรวจสุขภาพระบบ',
        icon: 'Activity',
        category: 'devops',
        version: '1.0.0',
        routePath: '/servers/$guildId/grafana-alerts',
    },
    {
        id: 'jira-card',
        name: 'เปิด Jira card',
        description: 'ให้สมาชิกกดปุ่มเปิดห้องส่วนตัวใน Discord เลือกประเภทและกรอกรายละเอียดพร้อมแนบรูป เพื่อสร้าง Issue ใน Jira Cloud ทันที',
        icon: 'Ticket',
        category: 'productivity',
        version: '1.0.0',
        routePath: '/servers/$guildId/jira',
    },
    {
        id: 'savings-goal',
        name: 'เก็บเงินตามเป้า',
        description: 'สร้างหัวข้อเก็บเงินกองกลาง ตั้งเป้ารายคนหรือรายวัน บันทึกรับเงิน ดูกราฟสรุป ส่งออก CSV และส่งการ์ดรายงานเข้าห้อง Discord',
        icon: 'Coins',
        category: 'finance',
        version: '1.0.0',
        routePath: '/servers/$guildId/funds',
    },
    {
        id: 'uptime-monitor',
        name: 'ตรวจสอบสถานะเว็บ & API',
        description: 'ตรวจสอบสถานะความพร้อมใช้งานของเว็บไซต์หรือ API ตามช่วงเวลา แจ้งเตือนเข้าห้อง Discord เมื่อระบบล่มหรือกลับมาออนไลน์ พร้อมกราฟ Latency ย้อนหลัง 24 ชั่วโมง',
        icon: 'HeartPulse',
        category: 'devops',
        version: '1.0.0',
        routePath: '/servers/$guildId/uptime',
    },
] as const;

export const PLUGIN_MAP = new Map<PluginId, PluginDefinition>(PLUGIN_REGISTRY.map((p) => [p.id, p]));

export const pluginIdSchema = z.enum(PLUGIN_IDS);

export const isPluginId = (v: unknown): v is PluginId => typeof v === 'string' && PLUGIN_MAP.has(v as PluginId);

export interface GuildPluginState extends PluginDefinition {
    installed: boolean;
    enabled: boolean;
    installedAt: string | null;
    installedBy: string | null;
}

export interface GuildPluginsResponse {
    guildId: string;
    plugins: GuildPluginState[];
    installedIds: PluginId[];
}
