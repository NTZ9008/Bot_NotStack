import type { GuildSummary } from '@notstack/shared';
import type { LucideIcon } from 'lucide-react';
import {
    CircleUser,
    CloudSun,
    FileText,
    GitPullRequest,
    History,
    LineChart,
    Lock,
    Mic,
    Newspaper,
    ScrollText,
    Server,
    Settings,
    ShieldCheck,
    Trophy,
    UserPlus,
    Users,
} from 'lucide-react';

export interface NavItem {
    // path ของ route (หน้าของเซิร์ฟเวอร์มี $guildId — ใส่ params ตอนสร้างลิงก์)
    to: string;
    label: string;
    icon: LucideIcon;
    // คำค้นหา (ไทย/อังกฤษ) สำหรับช่องค้นหาหน้า Ctrl/⌘ + K
    keywords: string;
    // หน้าของเซิร์ฟเวอร์: ต้องมีสิทธิ์ระดับไหน (ไม่ระบุ = หน้าส่วนกลาง)
    guild?: 'manage' | 'view';
    adminOnly?: boolean;
}

export interface NavGroup {
    label: string;
    items: NavItem[];
}

// หน้าของเซิร์ฟเวอร์ที่กำลังเลือก
const GUILD_GROUPS: NavGroup[] = [
    {
        label: 'ภาพรวม',
        items: [{ to: '/servers/$guildId/overview', label: 'Overview', icon: LineChart, guild: 'manage', keywords: 'overview ภาพรวม กราฟ สถิติ dashboard หน้าหลัก chart active' }],
    },
    {
        label: 'จัดการบอท',
        items: [
            { to: '/servers/$guildId/config', label: 'Configuration', icon: Settings, guild: 'manage', keywords: 'configuration config ตั้งค่า คอนฟิก ห้อง channel เปิดปิด anti spam คำหยาบ ai' },
            { to: '/servers/$guildId/news', label: 'News', icon: Newspaper, guild: 'manage', keywords: 'news ข่าว ประกาศ แจ้งเตือน announce' },
            { to: '/servers/$guildId/welcome', label: 'Welcome', icon: UserPlus, guild: 'manage', keywords: 'welcome ต้อนรับ สมาชิกใหม่ การ์ด รูปภาพ announcement ยินดีต้อนรับ card' },
            { to: '/servers/$guildId/weather', label: 'Weather', icon: CloudSun, guild: 'manage', keywords: 'weather อากาศ สภาพอากาศ พยากรณ์ รายงาน ฝน ฝุ่น pm2.5 เรดาร์ forecast report radar' },
            { to: '/servers/$guildId/room-access', label: 'Room Access', icon: Lock, guild: 'manage', keywords: 'room access สิทธิ์เข้าห้อง ตั๋ว ticket permission' },
            { to: '/servers/$guildId/voice-guard', label: 'Voice Guard', icon: Mic, guild: 'manage', keywords: 'voice guard ห้องเสียง whitelist blacklist กันคนเข้า' },
            { to: '/servers/$guildId/log-manager', label: 'Log Management', icon: FileText, guild: 'manage', keywords: 'log management จัดการ log ตั้งค่าล็อก event ตัวกรอง' },
            { to: '/servers/$guildId/pr-bot', label: 'PR Bot', icon: GitPullRequest, guild: 'manage', keywords: 'pr bot github pull request webhook' },
        ],
    },
    {
        label: 'ข้อมูล & ประวัติ',
        items: [
            { to: '/servers/$guildId/levels', label: 'Levels', icon: Trophy, guild: 'view', keywords: 'levels xp เลเวล อันดับ rank ประสบการณ์' },
            { to: '/servers/$guildId/audit-logs', label: 'Audit & Activity', icon: History, guild: 'manage', keywords: 'audit logs ประวัติ การกระทำ activity เหตุการณ์ discord' },
        ],
    },
];

// หน้าส่วนกลาง (ไม่ผูกกับเซิร์ฟเวอร์)
const GLOBAL_GROUPS: NavGroup[] = [
    {
        label: 'ระบบ',
        items: [
            { to: '/servers', label: 'เซิร์ฟเวอร์ทั้งหมด', icon: Server, keywords: 'servers guilds เซิร์ฟเวอร์ เลือกเซิร์ฟเวอร์ เชิญบอท invite' },
            { to: '/users', label: 'Users', icon: Users, adminOnly: true, keywords: 'users ผู้ใช้ จัดการผู้ใช้ role สิทธิ์ บัญชี' },
            { to: '/audit-logs', label: 'System Audit', icon: ShieldCheck, adminOnly: true, keywords: 'system audit ประวัติทั้งระบบ login เข้าสู่ระบบ' },
            { to: '/logs', label: 'Bot Logs', icon: ScrollText, adminOnly: true, keywords: 'logs ไฟล์ log ประวัติ system log แชท' },
            { to: '/account', label: 'My Account', icon: CircleUser, keywords: 'my account บัญชีของฉัน โปรไฟล์ รหัสผ่าน discord' },
        ],
    },
];

// เมนูที่ผู้ใช้เห็น — หน้าที่ไม่มีสิทธิ์เข้าจะไม่ขึ้นทั้งในเมนูและในผลการค้นหา
export function visibleNavGroups(isAdmin: boolean, guild: Pick<GuildSummary, 'access'> | null): NavGroup[] {
    const groups = [...(guild ? GUILD_GROUPS : []), ...GLOBAL_GROUPS];
    return groups
        .map((group) => ({
            ...group,
            items: group.items.filter((item) => {
                if (item.adminOnly && !isAdmin) return false;
                if (item.guild === 'manage' && guild?.access !== 'manage') return false;
                return true;
            }),
        }))
        .filter((group) => group.items.length > 0);
}

const ALL_ITEMS = [...GUILD_GROUPS, ...GLOBAL_GROUPS].flatMap((group) => group.items);

// หน้าปัจจุบันจาก path ของ route (เช่น /servers/$guildId/config)
export function findNavItem(routePath: string | undefined): NavItem | undefined {
    if (!routePath) return undefined;
    const path = routePath.replace(/\/$/, '') || '/';
    return ALL_ITEMS.find((item) => item.to === path);
}
