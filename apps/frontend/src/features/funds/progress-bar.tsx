import { cn } from '@/lib/utils';

export function ProgressBar({ value, className }: { value: number; className?: string }) {
    const clamped = Math.min(100, Math.max(0, value));
    const barColor =
        clamped >= 100
            ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
            : clamped >= 50
              ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
              : 'bg-gradient-to-r from-primary to-sky-400';
    return (
        <div
            className={cn('h-2 w-full overflow-hidden rounded-full bg-muted/70', className)}
            role="progressbar"
            aria-valuenow={value}
            aria-valuemin={0}
            aria-valuemax={100}
        >
            <div className={cn('h-full rounded-full transition-all duration-300 ease-out', barColor)} style={{ width: `${clamped}%` }} />
        </div>
    );
}
