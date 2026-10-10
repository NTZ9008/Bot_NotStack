import { replaceSession } from '@/lib/session';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronDown, CircleUser, LogOut } from 'lucide-react';
import { authApi } from '@/api/auth';
import { useConfirm } from '@/components/confirm-dialog';
import { RoleBadge } from '@/components/role-badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/use-auth';
import { DEFAULT_AVATAR } from '@/lib/format';

export function ProfileMenu() {
    const { user } = useAuth();
    const confirm = useConfirm();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const logout = async () => {
        const ok = await confirm({
            title: 'ยืนยันการออกจากระบบ?',
            description: 'คุณต้องการออกจากระบบ Dashboard ใช่หรือไม่',
            confirmText: 'ออกจากระบบ',
            destructive: true,
        });
        if (!ok) return;
        await authApi.logout().catch(() => {});
        replaceSession(queryClient, null);
        void navigate({ to: '/login' });
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-10 gap-2 px-2">
                    <Avatar className="size-7">
                        <AvatarImage src={user.avatarUrl ?? DEFAULT_AVATAR} alt="" />
                        <AvatarFallback>{user.displayName.slice(0, 1)}</AvatarFallback>
                    </Avatar>
                    <span className="hidden max-w-36 truncate text-sm font-medium sm:inline">{user.displayName}</span>
                    <RoleBadge role={user.role} className="hidden sm:inline-flex" />
                    <ChevronDown className="size-4 text-muted-foreground" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="truncate">{user.displayName}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                    <Link to="/account">
                        <CircleUser />
                        My Account
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => void logout()}>
                    <LogOut />
                    Logout
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
