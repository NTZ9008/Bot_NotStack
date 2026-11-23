import { useRef, type PointerEvent, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// ==========================================
// 📊 ชิ้นส่วนหน้ารายงาน (ภาพรวมเซิร์ฟเวอร์ / เซิร์ฟเวอร์ทั้งหมด) — ตัวเลขใหญ่ + คำอธิบายภาษาคน + แถบเทียบสัดส่วน
// ==========================================

// ไฮไลต์ที่ "เลื่อนตาม" เมาส์ — พื้นสีจางๆ ไหลไปหารายการที่ชี้อยู่ (รายการต้องมี data-glide, กล่องต้องเป็น relative)
// ครั้งแรกที่ชี้จะโผล่ตรงรายการเลย (snap) แล้วค่อยเลื่อนนุ่มๆ ตอนย้ายไปรายการอื่น
export function useGlide<T extends HTMLElement>() {
    const ref = useRef<T>(null);
    return {
        ref,
        onPointerOver: (event: PointerEvent) => {
            const box = ref.current;
            const item = (event.target as HTMLElement).closest<HTMLElement>('[data-glide]');
            if (!box || !item || !box.contains(item)) return;
            const first = !box.dataset.glide;
            box.style.setProperty('--gx', `${item.offsetLeft}px`);
            box.style.setProperty('--gy', `${item.offsetTop}px`);
            box.style.setProperty('--gw', `${item.offsetWidth}px`);
            box.style.setProperty('--gh', `${item.offsetHeight}px`);
            box.dataset.glide = first ? 'snap' : 'on';
            if (first) requestAnimationFrame(() => box.dataset.glide && (box.dataset.glide = 'on'));
        },
        onPointerLeave: () => ref.current?.removeAttribute('data-glide'),
    };
}

export function GlideMark({ className }: { className?: string }) {
    return <span aria-hidden className={cn('dash-glide', className)} />;
}

// แสงจางๆ ตามตำแหน่งเมาส์บนการ์ด (คู่กับ class dash-spot)
export function spotlight(event: PointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`);
}

export interface Kpi {
    label: string;
    value: string;
    unit?: string;
    icon: LucideIcon;
    // บอกว่าตัวเลขนี้หมายถึงอะไร (ภาษาง่ายๆ)
    hint?: string;
    // แถวล่าง: ตัวเลขรอง
    foot?: ReactNode;
    tone?: 'up' | 'down';
}

// การ์ดเดียวแบ่งเป็นช่อง (เส้นคั่นบางๆ) แบบแถบสรุปของ dashboard
export function KpiStrip({ items }: { items: Kpi[] }) {
    const glide = useGlide<HTMLDivElement>();
    return (
        <Card className="gap-0 py-0">
            {/* gap-px บนพื้นสีเส้นขอบ = เส้นคั่นระหว่างช่อง ไม่ว่าจะกี่คอลัมน์ */}
            <div {...glide} className="relative grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
                <GlideMark className="rounded-none" />
                {items.map((kpi) => (
                    <div key={kpi.label} data-glide className="group/kpi bg-card p-5">
                        {/* z-[2] ให้เนื้อหาอยู่เหนือไฮไลต์ที่เลื่อนตามเมาส์ */}
                        <div className="relative z-[2] flex h-full flex-col gap-3">
                            <div className="flex items-center gap-2.5" title={kpi.hint}>
                                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground transition-transform duration-500 ease-spring group-hover/kpi:scale-105">
                                    <kpi.icon className="size-4.5" />
                                </span>
                                <p className="text-sm font-medium text-muted-foreground">{kpi.label}</p>
                            </div>
                            <p
                                className={cn(
                                    'flex items-baseline gap-1.5 text-3xl font-bold tracking-tight tabular-nums transition-transform duration-500 ease-spring group-hover/kpi:translate-x-1',
                                    kpi.tone === 'up' && 'text-success',
                                    kpi.tone === 'down' && 'text-destructive',
                                )}
                            >
                                {kpi.value}
                                {kpi.unit && <span className="text-sm font-medium text-muted-foreground">{kpi.unit}</span>}
                            </p>
                            {/* คำอธิบายยาวไม่ต้องโชว์ — ชี้ที่หัวข้อเพื่อดู (title) / โปรแกรมอ่านหน้าจออ่านได้ */}
                            {kpi.hint && <span className="sr-only">{kpi.hint}</span>}
                            {kpi.foot && <div className="mt-auto border-t pt-3 text-xs text-muted-foreground">{kpi.foot}</div>}
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}

export interface RankRow {
    key: string;
    name: ReactNode;
    sub?: ReactNode;
    value: number;
    display: string;
    lead?: ReactNode;
}

// อันดับ + แถบยาวตามสัดส่วนของอันดับ 1 (อ่านง่ายกว่าตาราง) — แถบค่อยๆ ยืดออกตอนเปิดหน้า
export function RankList({ rows, empty }: { rows: RankRow[]; empty: string }) {
    const glide = useGlide<HTMLOListElement>();
    const max = Math.max(1, ...rows.map((row) => row.value));
    if (rows.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>;
    return (
        <ol {...glide} className="relative -mx-2 space-y-1">
            <GlideMark />
            {rows.map((row, i) => (
                <li key={row.key} data-glide className="group/row relative z-[2] flex items-center gap-3 rounded-xl px-2 py-1.5">
                    {row.lead ?? (
                        <span
                            className={cn(
                                'grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums transition-transform duration-500 ease-spring group-hover/row:scale-105',
                                i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                            )}
                        >
                            {i + 1}
                        </span>
                    )}
                    <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="min-w-0 truncate font-medium">{row.name}</span>
                            <span className="shrink-0 font-semibold tabular-nums">{row.display}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted transition-[height] duration-500 ease-spring group-hover/row:h-2">
                            <div
                                className="dash-bar-in h-full rounded-full bg-gradient-to-r from-primary to-ink"
                                style={{ width: `${Math.max(3, (row.value / max) * 100)}%`, animationDelay: `${i * 50}ms` }}
                            />
                        </div>
                        {row.sub && <p className="mt-1 truncate text-xs text-muted-foreground">{row.sub}</p>}
                    </div>
                </li>
            ))}
        </ol>
    );
}

// การ์ดรายงานมาตรฐาน: หัวข้อ + คำอธิบายสั้น + ปุ่มด้านขวา
export function ReportCard({
    title,
    hint,
    action,
    className,
    children,
}: {
    title: string;
    hint?: string;
    action?: ReactNode;
    className?: string;
    children: ReactNode;
}) {
    return (
        <Card className={cn('dash-spot', className)} onPointerMove={spotlight}>
            <CardHeader className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                    <CardTitle>{title}</CardTitle>
                    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
                </div>
                {action}
            </CardHeader>
            <CardContent>{children}</CardContent>
        </Card>
    );
}

// เส้นกราฟจิ๋วไว้ดูทิศทางคร่าวๆ (ไม่ต้องโหลด recharts)
export function Sparkline({ values, label, className }: { values: number[]; label: string; className?: string }) {
    const w = 120;
    const h = 36;
    const max = Math.max(1, ...values);
    const step = values.length > 1 ? w / (values.length - 1) : w;
    const points = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(' ');
    return (
        <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className={cn('h-9 w-full overflow-visible', className)} preserveAspectRatio="none">
            <polygon points={`0,${h} ${points} ${w},${h}`} className="fill-primary/10" />
            <polyline
                points={points}
                fill="none"
                className="stroke-primary dark:stroke-ink"
                strokeWidth={2}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    );
}

// ปุ่มแคปซูลเลือกได้ทีละอัน (ช่วงเวลา / มุมมองกราฟ) — ช่องที่เลือกยกขึ้นเป็นการ์ด
export function PillTabs<T extends string>({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: T;
    options: { value: T; label: string }[];
    onChange: (value: T) => void;
}) {
    return (
        <div role="group" aria-label={label} className="inline-flex max-w-full self-start overflow-x-auto rounded-full bg-muted p-1 ring-1 ring-border">
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    aria-pressed={value === option.value}
                    onClick={() => onChange(option.value)}
                    className={cn(
                        'h-8 shrink-0 rounded-full px-3 text-xs font-semibold whitespace-nowrap text-muted-foreground transition-[color,background-color,box-shadow,transform] duration-500 ease-spring active:scale-[0.97] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                        value === option.value && 'bg-card text-accent-foreground shadow-sm dark:bg-primary dark:text-white',
                    )}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}
