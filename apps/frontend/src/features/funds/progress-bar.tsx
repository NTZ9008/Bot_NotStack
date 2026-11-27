import { Progress } from '@/components/ui/progress';
import { tr } from '@/lib/i18n';
import { cn } from '@/lib/utils';

// แถบความคืบหน้าการจ่าย: ครบ = เขียว, ครึ่งทาง = ส้ม, ที่เหลือ = สีหลัก
export function ProgressBar({ value, className, label = tr('funds.collectionProgress') }: { value: number; className?: string; label?: string }) {
    const clamped = Math.min(100, Math.max(0, value));
    const barColor = clamped >= 100 ? 'bg-success' : clamped >= 50 ? 'bg-warning' : 'bg-primary';
    return (
        <Progress aria-label={label} value={clamped} className={cn('h-2 bg-muted/70', className)} indicatorClassName={cn('duration-300 ease-out', barColor)} />
    );
}
