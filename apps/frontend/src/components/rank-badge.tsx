import { cn } from '@/lib/utils';

const STYLES = [
    'bg-gradient-to-br from-yellow-300 to-amber-500 text-amber-950',
    'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900',
    'bg-gradient-to-br from-orange-300 to-orange-600 text-orange-950',
];

// อันดับ 1-3 เป็นเหรียญทอง/เงิน/ทองแดง ที่เหลือเป็นวงกลมธรรมดา
export function RankBadge({ rank }: { rank: number }) {
    return (
        <span
            className={cn(
                'inline-flex size-7 items-center justify-center rounded-full text-xs font-bold',
                STYLES[rank - 1] ?? 'bg-muted text-muted-foreground',
            )}
        >
            {rank}
        </span>
    );
}
