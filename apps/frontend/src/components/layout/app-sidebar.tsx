import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useRouterState } from '@tanstack/react-router';
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
import { GuildSwitcher } from './guild-switcher';
import { visibleNavGroups } from './nav-items';

// ==========================================
// 🧭 เมนูซ้าย — เลือกเซิร์ฟเวอร์ด้านบน แล้วตามด้วยหน้าของเซิร์ฟเวอร์นั้น + หน้าส่วนกลาง (จอเล็กยุบเป็นลิ้นชัก)
// ==========================================
export function AppSidebar() {
    const { isAdmin } = useAuth();
    const { data: info } = useQuery(appInfoQuery);
    const { guildId } = useParams({ strict: false });
    const { data: guild } = useQuery({ ...guildQuery(guildId ?? ''), enabled: Boolean(guildId) });
    const routePath = useRouterState({ select: (state) => state.matches[state.matches.length - 1]?.fullPath?.replace(/\/$/, '') });
    const { isMobile, setOpenMobile } = useSidebar();
    const bot = info?.bot ?? DEFAULT_BOT;

    return (
        <Sidebar collapsible="icon">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link to="/servers">
                                <img src={bot.avatar} alt="" className="size-8 shrink-0 rounded-full border border-white/10 shadow-[0_0_16px_rgba(99,102,241,0.35)]" />
                                <div className="grid min-w-0 flex-1 text-left leading-tight">
                                    <span className="truncate font-semibold text-indigo-300">{bot.name}</span>
                                    <span className="truncate text-xs text-muted-foreground">{info ? `V${info.version}` : ' '}</span>
                                </div>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
                <GuildSwitcher guildId={guildId} />
            </SidebarHeader>

            <SidebarContent>
                {visibleNavGroups(isAdmin, guildId ? (guild ?? null) : null).map((group) => (
                    <SidebarGroup key={group.label}>
                        <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {group.items.map((item) => (
                                    <SidebarMenuItem key={item.to}>
                                        <SidebarMenuButton asChild isActive={routePath === item.to} tooltip={item.label}>
                                            <Link to={item.to} params={item.guild ? { guildId } : {}} onClick={() => isMobile && setOpenMobile(false)}>
                                                <item.icon />
                                                <span>{item.label}</span>
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
                <p className="px-2 pb-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">Developed by arlifzs © 2026</p>
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    );
}
