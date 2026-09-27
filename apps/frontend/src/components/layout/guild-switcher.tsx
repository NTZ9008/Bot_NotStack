import { useQuery } from '@tanstack/react-query';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { Check, ChevronsUpDown, LayoutGrid, Plus } from 'lucide-react';
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
                        <SidebarMenuButton size="lg" className="border bg-sidebar-accent/40 data-[state=open]:bg-sidebar-accent" tooltip="เลือกเซิร์ฟเวอร์">
                            {current ? <GuildIcon guild={current} /> : <LayoutGrid className="size-8 p-1.5" />}
                            <div className="grid min-w-0 flex-1 text-left leading-tight">
                                <span className="truncate text-sm font-medium">{current?.name ?? 'เลือกเซิร์ฟเวอร์'}</span>
                                <span className="truncate text-xs text-muted-foreground">
                                    {current ? (current.access === 'manage' ? 'จัดการได้' : 'ดูอันดับได้อย่างเดียว') : `${list?.guilds.length ?? 0} เซิร์ฟเวอร์`}
                                </span>
                            </div>
                            <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-60" align="start" side={isMobile ? 'bottom' : 'right'}>
                        <DropdownMenuLabel className="text-xs text-muted-foreground">เซิร์ฟเวอร์</DropdownMenuLabel>
                        {list?.guilds.map((guild) => (
                            <DropdownMenuItem key={guild.id} onSelect={() => go(guild.id)} className="gap-2">
                                <GuildIcon guild={guild} className="size-6 rounded-lg text-[10px]" />
                                <span className="truncate">{guild.name}</span>
                                {guild.id === guildId && <Check className="ml-auto size-4" />}
                            </DropdownMenuItem>
                        ))}
                        {list && list.guilds.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">ยังไม่มีเซิร์ฟเวอร์ที่เข้าถึงได้</p>}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onSelect={() => {
                                if (isMobile) setOpenMobile(false);
                                void navigate({ to: '/servers' });
                            }}
                        >
                            <LayoutGrid /> ดูเซิร์ฟเวอร์ทั้งหมด
                        </DropdownMenuItem>
                        {list?.inviteUrl && (
                            <DropdownMenuItem asChild>
                                <a href={list.inviteUrl} target="_blank" rel="noopener noreferrer">
                                    <Plus /> เชิญบอทเข้าเซิร์ฟเวอร์ของคุณ
                                </a>
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}
