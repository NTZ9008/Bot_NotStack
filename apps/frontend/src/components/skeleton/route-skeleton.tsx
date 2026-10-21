import type { GuildSummary } from '@notstack/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import type { ComponentType } from 'react';
import { guildQuery } from '@/api/guilds';
import { AccountPageSkeleton, AdminLogsPageSkeleton, AdminUsersPageSkeleton, GenericPageSkeleton, ServersPageSkeleton } from './app-pages';
import { FundsPageSkeleton, JiraPageSkeleton, LogManagerPageSkeleton, WeatherPageSkeleton, WelcomePageSkeleton } from './editor-pages';
import {
    AuditLogsPageSkeleton,
    ConfigPageSkeleton,
    NewsPageSkeleton,
    OverviewPageSkeleton,
    PrBotPageSkeleton,
    RoomAccessPageSkeleton,
    VoiceGuardPageSkeleton,
} from './guild-pages';
import { LevelsPageSkeleton } from './levels';

// หน้าในเซิร์ฟเวอร์ (/servers/:guildId/<หน้า>) → โครงร่างของหน้านั้น
const GUILD_PAGES: Record<string, ComponentType> = {
    overview: OverviewPageSkeleton,
    config: ConfigPageSkeleton,
    news: NewsPageSkeleton,
    welcome: WelcomePageSkeleton,
    weather: WeatherPageSkeleton,
    'room-access': RoomAccessPageSkeleton,
    'voice-guard': VoiceGuardPageSkeleton,
    'log-manager': LogManagerPageSkeleton,
    'pr-bot': PrBotPageSkeleton,
    jira: JiraPageSkeleton,
    funds: FundsPageSkeleton,
    'audit-logs': AuditLogsPageSkeleton,
};

const APP_PAGES: Record<string, ComponentType> = {
    '/': ServersPageSkeleton,
    '/servers': ServersPageSkeleton,
    '/account': AccountPageSkeleton,
    '/users': AdminUsersPageSkeleton,
    '/logs': AdminLogsPageSkeleton,
};

// ==========================================
// ⏳ โครงร่างของหน้าที่กำลังจะเปิด — router แสดงตัวนี้ระหว่างรอโค้ดของหน้า + ข้อมูลจาก loader
// อยู่ใน bundle หลักเสมอ จึงขึ้นได้ทันทีแม้โค้ดของหน้านั้นยังโหลดไม่เสร็จ
// ==========================================
export function RouteSkeleton() {
    const pathname = useRouterState({ select: (state) => state.location.pathname.replace(/\/+$/, '') || '/' });
    const queryClient = useQueryClient();

    const guildPage = pathname.match(/^\/servers\/([^/]+)\/([^/]+)/);
    if (guildPage) {
        const [, guildId, page] = guildPage;
        if (page === 'levels') {
            // สมาชิกทั่วไปเห็นแค่ 2 แท็บ — ดูสิทธิ์จากข้อมูลเซิร์ฟเวอร์ที่โหลดไว้แล้ว (ถ้ามี)
            const guild = queryClient.getQueryData<GuildSummary>(guildQuery(guildId!).queryKey);
            return <LevelsPageSkeleton manage={guild?.access !== 'view'} />;
        }
        const Page = GUILD_PAGES[page!] ?? GenericPageSkeleton;
        return <Page />;
    }
    const Page = APP_PAGES[pathname] ?? GenericPageSkeleton;
    return <Page />;
}
