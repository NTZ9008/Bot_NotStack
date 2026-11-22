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
import { ProfileMenu } from './profile-menu';
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
        <Sidebar collapsible="icon">
            <SidebarHeader className="gap-3 pt-4">
                <div className="flex items-center gap-2 px-1">
                    <Link
                        to="/servers"
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                    >
                        <img src={bot.avatar} alt="" className="size-8 shrink-0 rounded-md border border-border" />
                        <span className="grid min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
                            <span className="truncate text-lg font-bold tracking-tight">{bot.name}</span>
                            <span className="truncate text-xs text-muted-foreground">{info ? `V${info.version}` : ' '}</span>
                        </span>
                    </Link>
                </div>
                <ProfileMenu />
                <GuildSwitcher guildId={guildId} />
            </SidebarHeader>

            <SidebarContent>
                {visibleNavGroups(isAdmin, guildId ? (guild ?? null) : null).map((group) => (
                    <SidebarGroup key={group.label}>
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

            <SidebarFooter>
                <div className="space-y-2 group-data-[collapsible=icon]:hidden">
                    <ThemeSwitcher />
                    <LanguageSwitcher />
                    <p className="px-1 text-xs text-muted-foreground">Developed by arlifzs © 2026</p>
                </div>
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    );
}
