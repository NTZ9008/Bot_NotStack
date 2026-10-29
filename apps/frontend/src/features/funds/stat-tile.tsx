import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// กล่องตัวเลขสรุป — summary = หัวการ์ดของหัวข้อ (ตัวใหญ่), overview = แบนเนอร์ภาพรวม, kpi = แท็บกราฟ
const VARIANTS = {
    summary: { box: 'bg-muted/30 px-3.5 py-2.5', value: 'text-lg sm:text-xl' },
    overview: { box: 'bg-muted/20 px-3 py-2', value: 'text-base sm:text-lg' },
    kpi: { box: 'bg-muted/20 p-3', value: 'mt-1 text-base sm:text-lg' },
} as const;

const TONES = {
    default: 'border-border',
    emerald: 'border-emerald-500/25 bg-emerald-500/5',
    amber: 'border-amber-500/25 bg-amber-500/5',
    sky: 'border-sky-500/25 bg-sky-500/5',
} as const;

export function StatTile({
    label,
    value,
    subtext,
    icon,
    valueClassName,
    variant,
    tone = 'default',
}: {
    label: string;
    value: string;
    subtext?: string;
    icon?: ReactNode;
    valueClassName?: string;
    variant: keyof typeof VARIANTS;
    tone?: keyof typeof TONES;
}) {
    const style = VARIANTS[variant];
    return (
        <div className={cn('rounded-xl border transition-colors', style.box, TONES[tone])}>
            <div className="flex items-center justify-between gap-1.5">
                <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
                {icon && <span className="shrink-0 text-muted-foreground/80">{icon}</span>}
            </div>
            <p className={cn('mt-0.5 font-bold tracking-tight tabular-nums', style.value, valueClassName)}>{value}</p>
            {subtext && <p className="mt-0.5 truncate text-[11px] text-muted-foreground tabular-nums">{subtext}</p>}
        </div>
    );
}
