import { cn } from '@/lib/utils';

export function ProgressBar({ value, className }: { value: number; className?: string }) {
    const barColor = value >= 100 ? 'bg-emerald-500' : value >= 50 ? 'bg-amber-500' : 'bg-primary';
    return (
        <div
            className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
            role="progressbar"
            aria-valuenow={value}
            aria-valuemin={0}
            aria-valuemax={100}
        >
            <div className={cn('h-full rounded-full transition-all duration-300', barColor)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
        </div>
    );
}
