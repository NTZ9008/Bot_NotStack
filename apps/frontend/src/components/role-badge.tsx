import type { UserRole } from '@notstack/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function RoleBadge({ role, className }: { role: UserRole; className?: string }) {
    return (
        <Badge
            variant="outline"
            className={cn(
                role === 'ADMIN' ? 'border-amber-500/40 bg-amber-500/15 text-amber-300' : 'border-sky-500/40 bg-sky-500/15 text-sky-300',
                className,
            )}
        >
            {role}
        </Badge>
    );
}
