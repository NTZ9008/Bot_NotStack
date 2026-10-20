import { cn } from '@/lib/utils';

// กล่องตัวเลขสรุป — summary = หัวการ์ดของหัวข้อ (ตัวใหญ่), overview = แบนเนอร์ภาพรวม, kpi = แท็บกราฟ
const VARIANTS = {
    summary: { box: 'bg-muted/30 px-3 py-2', value: 'text-lg' },
    overview: { box: 'bg-muted/20 px-3 py-2', value: 'text-base' },
    kpi: { box: 'bg-muted/20 p-3', value: 'mt-1 text-base' },
} as const;

export function StatTile({ label, value, valueClassName, variant }: { label: string; value: string; valueClassName?: string; variant: keyof typeof VARIANTS }) {
    const style = VARIANTS[variant];
    return (
        <div className={cn('rounded-lg border', style.box)}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={cn('font-semibold tabular-nums', style.value, valueClassName)}>{value}</p>
        </div>
    );
}
