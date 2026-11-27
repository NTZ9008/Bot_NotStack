import type { UserRole } from '@notstack/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const ROLE_STYLES: Record<UserRole, string> = {
    ADMIN: 'border-warning/40 bg-warning/15 text-warning',
    OWNER: 'border-success/40 bg-success/15 text-success',
    USER: 'border-info/40 bg-info/15 text-info',
};

export function RoleBadge({ role, className }: { role: UserRole; className?: string }) {
    return (
        <Badge variant="outline" className={cn(ROLE_STYLES[role], className)}>
            {role}
        </Badge>
    );
}
