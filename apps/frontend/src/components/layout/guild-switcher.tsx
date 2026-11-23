import { useQuery } from '@tanstack/react-query';
import { useT } from '@/lib/i18n';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { Check, ChevronsUpDown, LayoutGrid, Plus } from '@/components/icons';
import { guildQuery, guildsQuery } from '@/api/guilds';
import { GuildIcon } from '@/components/guild-icon';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';

// ==========================================
// 🏰 สลับเซิร์ฟเวอร์ — อยู่หน้าไหนของเซิร์ฟเวอร์เดิม ก็ไปหน้าเดียวกันของเซิร์ฟเวอร์ใหม่
// (ถ้าเซิร์ฟเวอร์ใหม่ไม่มีสิทธิ์จัดการ layout จะพาไปหน้า Levels เอง)
// ==========================================
export function GuildSwitcher({ guildId }: { guildId: string | undefined }) {
    const { data: list } = useQuery(guildsQuery);
    const { data: current } = useQuery({ ...guildQuery(guildId ?? ''), enabled: Boolean(guildId) });
    const routePath = useRouterState({ select: (state) => state.matches[state.matches.length - 1]?.fullPath });
    const navigate = useNavigate();
    const { isMobile, setOpenMobile } = useSidebar();
    const t = useT();

    const go = (id: string) => {
        if (isMobile) setOpenMobile(false);
        const sub = routePath?.startsWith('/servers/$guildId/') ? routePath.replace(/\/$/, '') : '/servers/$guildId';
        void navigate({ to: sub, params: { guildId: id } });
    };

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className="h-14 rounded-2xl bg-sidebar-accent/60 ring-1 ring-sidebar-border transition-colors duration-200 hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent group-data-[collapsible=icon]:ring-0"
                            tooltip={t('layout.selectAServer')}
                        >
                            {current ? (
                                <GuildIcon guild={current} />
                            ) : (
                                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                                    <LayoutGrid />
                                </span>
                            )}
                            <div className="grid min-w-0 flex-1 text-left leading-tight">
                                <span className="truncate text-sm font-medium">{current?.name ?? t('layout.selectAServer')}</span>
                                <span className="truncate text-xs text-muted-foreground">
                                    {current
                                        ? current.access === 'manage'
                                            ? t('common.canManage')
                                            : t('common.viewRankingsOnly')
                                        : t('layout.countServers', { count: list?.guilds.length ?? 0 })}
                                </span>
                            </div>
                            <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-60" align="start" side={isMobile ? 'bottom' : 'right'}>
                        <DropdownMenuLabel className="text-xs text-muted-foreground">{t('layout.server')}</DropdownMenuLabel>
                        {list?.guilds.map((guild) => (
                            <DropdownMenuItem key={guild.id} onSelect={() => go(guild.id)} className="gap-2">
                                <GuildIcon guild={guild} className="size-6 rounded-lg text-[10px]" />
                                <span className="truncate">{guild.name}</span>
                                {guild.id === guildId && <Check className="ml-auto size-4" />}
                            </DropdownMenuItem>
                        ))}
                        {list && list.guilds.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">{t('layout.noServersAvailableYet')}</p>}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onSelect={() => {
                                if (isMobile) setOpenMobile(false);
                                void navigate({ to: '/servers' });
                            }}
                        >
                            <LayoutGrid /> {t('layout.viewAllServers')}
                        </DropdownMenuItem>
                        {list?.inviteUrl && (
                            <DropdownMenuItem asChild>
                                <a href={list.inviteUrl} target="_blank" rel="noopener noreferrer">
                                    <Plus /> {t('layout.inviteTheBotToYourServer')}
                                </a>
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}
