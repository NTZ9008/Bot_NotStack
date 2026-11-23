import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useRouter, useRouterState } from '@tanstack/react-router';
import { useMemo } from 'react';
import { appInfoQuery, DEFAULT_BOT } from '@/api/app';
import { guildQuery } from '@/api/guilds';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail,
    useSidebar,
} from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/use-auth';
import { usePreloadTasks } from '@/hooks/use-preload-tasks';
import { GuildSwitcher } from './guild-switcher';
import { LanguageSwitcher, ThemeSwitcher } from './theme-toggle';
import { trText } from '@/lib/i18n';
import { visibleNavGroups } from './nav-items';

// ==========================================
// 🧭 เมนูซ้าย — เลือกเซิร์ฟเวอร์ด้านบน แล้วตามด้วยหน้าของเซิร์ฟเวอร์นั้น + หน้าส่วนกลาง (จอเล็กยุบเป็นลิ้นชัก)
// ==========================================
export function AppSidebar() {
    const { isAdmin } = useAuth();
    const router = useRouter();
    const { data: info } = useQuery(appInfoQuery);
    const { guildId } = useParams({ strict: false });
    const { data: guild } = useQuery({ ...guildQuery(guildId ?? ''), enabled: Boolean(guildId) });
    const routePath = useRouterState({ select: (state) => state.matches[state.matches.length - 1]?.fullPath?.replace(/\/$/, '') });
    const { isMobile, setOpenMobile } = useSidebar();
    const bot = info?.bot ?? DEFAULT_BOT;
    const access = guild?.access;

    const tasks = useMemo(
        () =>
            visibleNavGroups(isAdmin, guildId && access ? { access } : null)
                .flatMap((group) => group.items)
                .map((item) => ({
                    key: `${guildId ?? ''}:${item.to}`,
                    run: async () => {
                        const active = router.state.matches.at(-1)?.fullPath?.replace(/\/$/, '');
                        if (active !== item.to) await router.preloadRoute({ to: item.to, params: item.guild ? { guildId } : {}, search: {} });
                    },
                })),
        [router, isAdmin, guildId, access],
    );
    const prioritize = usePreloadTasks(tasks);

    return (
        // การ์ดลอยใต้แถบบน — ชิดขอบซ้ายของกรอบกลางจอ (max-w 1440px) เดียวกับแถบบน
        <Sidebar
            collapsible="icon"
            variant="floating"
            className="top-(--dash-top)! left-[max(0px,calc((100vw-1440px)/2))]! h-[calc(100svh-var(--dash-top))]! px-3 pt-0 pb-3 md:pr-0"
        >
            <SidebarHeader className="p-3 pb-1 group-data-[collapsible=icon]:px-2">
                <GuildSwitcher guildId={guildId} />
            </SidebarHeader>

            <SidebarContent>
                {visibleNavGroups(isAdmin, guildId ? (guild ?? null) : null).map((group) => (
                    <SidebarGroup key={group.label} className="px-3 py-1.5 group-data-[collapsible=icon]:px-2">
                        <SidebarGroupLabel>{trText(group.label)}</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {group.items.map((item) => (
                                    <SidebarMenuItem key={item.to}>
                                        <SidebarMenuButton asChild isActive={routePath === item.to} tooltip={trText(item.label)}>
                                            <Link
                                                to={item.to}
                                                params={item.guild ? { guildId } : {}}
                                                preload={false}
                                                onMouseEnter={() => prioritize(`${guildId ?? ''}:${item.to}`)}
                                                onFocus={() => prioritize(`${guildId ?? ''}:${item.to}`)}
                                                onTouchStart={() => prioritize(`${guildId ?? ''}:${item.to}`)}
                                                onClick={() => isMobile && setOpenMobile(false)}
                                            >
                                                <item.icon />
                                                <span>{trText(item.label)}</span>
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                ))}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                ))}
            </SidebarContent>

            <SidebarFooter className="p-3 pt-1">
                <div className="space-y-2 group-data-[collapsible=icon]:hidden">
                    {/* จอเล็กไม่มีที่บนแถบบน — ย้ายปุ่มธีม/ภาษามาไว้ในลิ้นชักเมนู */}
                    {isMobile && (
                        <>
                            <ThemeSwitcher />
                            <LanguageSwitcher />
                        </>
                    )}
                    <div className="flex items-center gap-2 rounded-2xl bg-sidebar-accent/50 px-3 py-2">
                        <img src={bot.avatar} alt="" width={24} height={24} className="size-6 shrink-0 rounded-full" />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">{bot.name}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{info ? `v${info.version}` : ''}</span>
                    </div>
                </div>
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    );
}
