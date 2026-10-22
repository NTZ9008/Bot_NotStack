import type { UserRole } from '@notstack/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const ROLE_STYLES: Record<UserRole, string> = {
    ADMIN: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
    OWNER: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
    USER: 'border-sky-500/40 bg-sky-500/15 text-sky-300',
};

export function RoleBadge({ role, className }: { role: UserRole; className?: string }) {
    return (
        <Badge variant="outline" className={cn(ROLE_STYLES[role], className)}>
            {role}
        </Badge>
    );
}
