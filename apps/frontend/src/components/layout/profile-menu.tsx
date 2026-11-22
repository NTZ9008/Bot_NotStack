import { replaceSession } from '@/lib/session';
import { useT } from '@/lib/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronsUpDown, CircleUser, LogOut } from '@/components/icons';
import { authApi } from '@/api/auth';
import { useConfirm } from '@/components/confirm-dialog';
import { RoleBadge } from '@/components/role-badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/use-auth';
import { DEFAULT_AVATAR } from '@/lib/format';

// ออกจากระบบ (ถามยืนยันก่อน) — ใช้ทั้งเมนูโปรไฟล์และช่อง ⌘K
export function useLogout(): () => Promise<void> {
    const confirm = useConfirm();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const t = useT();
    return async () => {
        const ok = await confirm({
            title: t('ยืนยันการออกจากระบบ?'),
            description: t('คุณต้องการออกจากระบบ Dashboard ใช่หรือไม่'),
            confirmText: t('ออกจากระบบ'),
            destructive: true,
        });
        if (!ok) return;
        await authApi.logout().catch(() => {});
        replaceSession(queryClient, null);
        void navigate({ to: '/login' });
    };
}

// การ์ดผู้ใช้ในเมนูซ้าย (รูป + ชื่อ + บัญชี) กดแล้วเปิดเมนูบัญชี/ออกจากระบบ
export function ProfileMenu() {
    const { user } = useAuth();
    const logout = useLogout();
    const { isMobile, setOpenMobile } = useSidebar();
    const t = useT();

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton size="lg" tooltip={user.displayName} className="data-[state=open]:bg-sidebar-accent">
                            <Avatar className="size-8 rounded-md">
                                <AvatarImage src={user.avatarUrl ?? DEFAULT_AVATAR} alt="" />
                                <AvatarFallback className="rounded-md">{user.displayName.slice(0, 1)}</AvatarFallback>
                            </Avatar>
                            <div className="grid min-w-0 flex-1 text-left leading-tight">
                                <span className="truncate font-semibold">{user.displayName}</span>
                                <span className="truncate text-xs text-muted-foreground">{user.discordUsername ?? user.username ?? ' '}</span>
                            </div>
                            <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side={isMobile ? 'bottom' : 'right'} className="w-56">
                        <DropdownMenuLabel className="flex items-center justify-between gap-2">
                            <span className="truncate">{t('ทางลัด')}</span>
                            <RoleBadge role={user.role} />
                        </DropdownMenuLabel>
                        <DropdownMenuItem asChild>
                            <Link to="/account" onClick={() => isMobile && setOpenMobile(false)}>
                                <CircleUser />
                                {t('บัญชีของฉัน')}
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => void logout()}>
                            <LogOut />
                            {t('ออกจากระบบ')}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}
