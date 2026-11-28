import { tr } from '../../lib/i18n';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

// สีตามช่วงเลเวล ให้ดูออกทันทีว่าใครอยู่ระดับไหน — ชื่อระดับกำกับด้วยเสมอ ไม่พึ่งสีอย่างเดียว
// shortcut: ช่วงเลเวลตายตัวทุกเซิร์ฟเวอร์ ถ้าแอดมินอยากตั้งเองค่อยย้ายไปเก็บใน xp settings
const TIERS = [
    { min: 50, name: 'levels.tierLegend', bar: 'bg-amber-500', chip: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' },
    { min: 30, name: 'levels.tierMaster', bar: 'bg-fuchsia-500', chip: 'bg-fuchsia-500/15 text-fuchsia-800 dark:text-fuchsia-300' },
    { min: 20, name: 'levels.tierExpert', bar: 'bg-violet-500', chip: 'bg-violet-500/15 text-violet-800 dark:text-violet-300' },
    { min: 10, name: 'levels.tierRegular', bar: 'bg-sky-500', chip: 'bg-sky-500/15 text-sky-800 dark:text-sky-300' },
    { min: 5, name: 'levels.tierMember', bar: 'bg-emerald-500', chip: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300' },
    { min: 0, name: 'levels.tierNewbie', bar: 'bg-slate-400', chip: 'bg-slate-500/15 text-slate-700 dark:text-slate-300' },
] as const;

export const levelTier = (level: number) => TIERS.find((tier) => level >= tier.min) ?? TIERS.at(-1)!;

export function LevelChip({ level, className }: { level: number; className?: string }) {
    const tier = levelTier(level);
    return (
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', tier.chip, className)}>
            Lv {level.toLocaleString()}
            <span className="font-medium">· {tr(tier.name)}</span>
        </span>
    );
}

export function LevelBar({ level, percent, label, className }: { level: number; percent: number; label: string; className?: string }) {
    return <Progress aria-label={label} value={Math.round(percent)} className={cn('h-2', className)} indicatorClassName={levelTier(level).bar} />;
}
