import type { CSSProperties, ReactNode } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// ==========================================
// 🦴 ชิ้นส่วนโครงร่างตอนโหลด — ขนาดเท่าคอมโพเนนต์จริง (ช่องกรอก/ปุ่มสูง h-8, ความสูงบรรทัดตาม Tailwind)
// เพื่อให้ตอนข้อมูลมาถึงแล้วหน้าเว็บไม่กระตุก
// ==========================================

// ความสูงบรรทัด (line-height) ของข้อความแต่ละขนาด
const LINE_HEIGHT = { xs: 'h-4', sm: 'h-5', base: 'h-6', lg: 'h-7', '2xl': 'h-8' } as const;

// ข้อความ 1 บรรทัด — กว้างตาม className (เช่น w-40), สูงเท่าบรรทัดจริงของขนาดนั้น
export function Line({ size = 'sm', className }: { size?: keyof typeof LINE_HEIGHT; className?: string }) {
    return (
        <div className={cn('flex w-full items-center', LINE_HEIGHT[size], className)}>
            <Skeleton className="h-[62%] w-full" />
        </div>
    );
}

export const Bone = Skeleton;

export function InputBone({ className }: { className?: string }) {
    return <Skeleton className={cn('h-8 w-full rounded-lg', className)} />;
}

const BUTTON_SIZE = { default: 'h-8 w-24', sm: 'h-7 w-20', xs: 'h-6 w-16', icon: 'size-8', 'icon-sm': 'size-7', 'icon-xs': 'size-6' } as const;

export function ButtonBone({ size = 'default', className }: { size?: keyof typeof BUTTON_SIZE; className?: string }) {
    return <Skeleton className={cn('shrink-0 rounded-lg', BUTTON_SIZE[size], className)} />;
}

export function SwitchBone({ className }: { className?: string }) {
    return <Skeleton className={cn('h-[18.4px] w-8 shrink-0 rounded-full', className)} />;
}

export function BadgeBone({ className }: { className?: string }) {
    return <Skeleton className={cn('h-5 w-16 shrink-0 rounded-4xl', className)} />;
}

// ป้ายชื่อ (Label: text-sm leading-none)
export function LabelBone({ className }: { className?: string }) {
    return <Skeleton className={cn('h-3.5 w-28', className)} />;
}

// ป้ายชื่อ + ช่องกรอก + คำอธิบายใต้ช่อง แบบเดียวกับ <Field>
export function FieldBone({ hint = false, label = true, children, className }: { hint?: boolean; label?: boolean; children?: ReactNode; className?: string }) {
    return (
        <div className={cn('grid gap-1.5', className)}>
            {label && <LabelBone />}
            {children ?? <InputBone />}
            {hint && <Line size="xs" className="w-3/4" />}
        </div>
    );
}

// แถวสวิตช์ในกรอบ (ป้ายชื่อ + คำอธิบาย ทางซ้าย, สวิตช์ทางขวา)
export function SwitchRowBone({ description = true, className }: { description?: boolean; className?: string }) {
    return (
        <div className={cn('flex items-start justify-between gap-4 rounded-lg border p-3', className)}>
            <div className="flex-1 space-y-1.5">
                <LabelBone className="w-32" />
                {description && <Line size="xs" className="w-4/5" />}
            </div>
            <SwitchBone className="mt-0.5" />
        </div>
    );
}

// หัวของแต่ละหน้า แบบเดียวกับ <PageHeader> (ชื่อ / คำอธิบาย / บรรทัดวิธีบันทึก + ปุ่มวิธีใช้งานทางขวา)
export function PageHeaderSkeleton({ actions, help = true }: { actions?: ReactNode; help?: boolean }) {
    return (
        <div className="flex flex-wrap items-start justify-between gap-4" aria-hidden>
            <div className="min-w-0 flex-1 basis-72 space-y-1">
                <Line size="2xl" className="w-64 max-w-full" />
                <Line size="sm" className="max-w-2xl" />
                {help && <Line size="xs" className="max-w-md" />}
            </div>
            {(help || actions) && (
                <div className="flex max-w-full flex-wrap items-center gap-2">
                    {help && <ButtonBone size="sm" className="w-24" />}
                    {actions}
                </div>
            )}
        </div>
    );
}

// การ์ดพร้อมหัวการ์ด (ชื่อ + คำอธิบาย) — ใช้ <Card> ตัวจริงเพื่อให้ขอบ/ระยะห่างตรงกัน
export function CardSkeleton({
    title = true,
    description = true,
    children,
    className,
    contentClassName,
    headerAction,
}: {
    title?: boolean;
    description?: boolean;
    children?: ReactNode;
    className?: string;
    contentClassName?: string;
    headerAction?: ReactNode;
}) {
    return (
        <Card className={className}>
            {(title || description || headerAction) && (
                <CardHeader className={cn(headerAction && 'flex-row items-start justify-between gap-3')}>
                    <div className="min-w-0 flex-1 space-y-1">
                        {title && <Line size="base" className="w-44" />}
                        {description && <Line size="sm" className="max-w-xl" />}
                    </div>
                    {headerAction}
                </CardHeader>
            )}
            {children && <CardContent className={contentClassName}>{children}</CardContent>}
        </Card>
    );
}

// ตารางแบบ <DataTable> (กรอบมน + หัวตารางพื้นจาง + แถว)
export function TableSkeleton({
    columns,
    rows = 6,
    twoLine = [],
    className,
    bordered = true,
}: {
    columns: number;
    rows?: number;
    // คอลัมน์ที่แต่ละแถวมี 2 บรรทัด (ชื่อ + ID)
    twoLine?: number[];
    className?: string;
    bordered?: boolean;
}) {
    const grid: CSSProperties = { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` };
    const rowHeight = twoLine.length ? 'min-h-[3.25rem]' : 'min-h-[2.3rem]';
    return (
        <div className={cn('overflow-hidden', bordered && 'rounded-lg border', className)} aria-hidden>
            <div className="grid h-10 items-center gap-4 border-b bg-muted/40 px-2" style={grid}>
                {Array.from({ length: columns }, (_, i) => (
                    <Skeleton key={i} className="h-3 w-3/5" />
                ))}
            </div>
            {Array.from({ length: rows }, (_, r) => (
                <div key={r} className={cn('grid items-center gap-4 border-b p-2 last:border-0', rowHeight)} style={grid}>
                    {Array.from({ length: columns }, (_, c) =>
                        twoLine.includes(c) ? (
                            <div key={c} className="space-y-1.5">
                                <Skeleton className="h-3.5 w-4/5" />
                                <Skeleton className="h-3 w-3/5" />
                            </div>
                        ) : (
                            <Skeleton key={c} className={cn('h-3.5', (r + c) % 3 === 0 ? 'w-2/3' : (r + c) % 3 === 1 ? 'w-1/2' : 'w-4/5')} />
                        ),
                    )}
                </div>
            ))}
        </div>
    );
}

// กล่องตัวเลขสรุป (ตัวเลขใหญ่ + ป้ายเล็ก)
export function StatTileSkeleton({ className }: { className?: string }) {
    return (
        <div className={cn('rounded-xl border bg-card p-4', className)}>
            <Line size="2xl" className="w-20" />
            <Line size="xs" className="mt-1 w-24" />
        </div>
    );
}

// พื้นที่กราฟ — แท่งสูงต่ำสลับกันให้ดูออกว่าเป็นกราฟ
const BAR_HEIGHTS = [45, 70, 55, 85, 40, 65, 90, 50, 75, 60, 35, 80];

export function ChartSkeleton({ className = 'h-64' }: { className?: string }) {
    return (
        <div className={cn('flex items-end gap-2 border-b border-l border-border/60 px-2 pt-2', className)} aria-hidden>
            {BAR_HEIGHTS.map((height, i) => (
                <Skeleton key={i} className="flex-1 rounded-b-none" style={{ height: `${height}%` }} />
            ))}
        </div>
    );
}

// แถบแท็บ แบบ <TabsList> (h-8 พื้นจาง)
export function TabsBone({ count, className, fill = false }: { count: number; className?: string; fill?: boolean }) {
    return (
        <div className={cn('inline-flex h-8 items-center gap-1 rounded-lg bg-muted/60 p-[3px]', fill && 'flex w-full', className)}>
            {Array.from({ length: count }, (_, i) => (
                <Skeleton key={i} className={cn('h-full rounded-md bg-muted', fill ? 'flex-1' : 'w-24', i === 0 && 'bg-background/70')} />
            ))}
        </div>
    );
}

// กลุ่มปุ่มสลับ แบบ <ToggleGroup variant="outline">
export function ToggleGroupBone({ count, className }: { count: number; className?: string }) {
    return (
        <div className={cn('flex flex-wrap', className)}>
            {Array.from({ length: count }, (_, i) => (
                <Skeleton
                    key={i}
                    className={cn('h-8 w-20 rounded-none border-r border-background', i === 0 && 'rounded-l-lg', i === count - 1 && 'rounded-r-lg border-r-0')}
                />
            ))}
        </div>
    );
}

// กรอบข้อความจำลองแบบ Discord (<DiscordMessage>) + รูป/embed ด้านใน
export function DiscordPreviewSkeleton({ children, aspect = '10 / 3' }: { children?: ReactNode; aspect?: string }) {
    return (
        <div className="rounded-lg bg-[#313338] p-4 shadow-inner" aria-hidden>
            <div className="flex gap-4">
                <Skeleton className="size-10 shrink-0 rounded-full bg-white/10" />
                <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-1.5">
                        <Skeleton className="h-4 w-24 bg-white/10" />
                        <Skeleton className="h-4 w-7 bg-[#5865f2]/60" />
                        <Skeleton className="h-3 w-16 bg-white/10" />
                    </div>
                    {children ?? <Skeleton className="w-full max-w-xl rounded-lg bg-white/10" style={{ aspectRatio: aspect }} />}
                </div>
            </div>
        </div>
    );
}

// กล่องข้อความสถานะ/คำอธิบาย (กรอบจาง)
export function NoticeBone({ lines = 1, className }: { lines?: number; className?: string }) {
    return (
        <div className={cn('space-y-1 rounded-lg border bg-muted/30 p-3', className)}>
            {Array.from({ length: lines }, (_, i) => (
                <Line key={i} size="sm" className={i === lines - 1 && lines > 1 ? 'w-2/3' : undefined} />
            ))}
        </div>
    );
}

// ครอบโครงร่างหลายส่วนที่เรียงต่อกัน — ระยะห่าง space-y-6 เท่ากับ <main> ของ layout
// และบอก screen reader ว่ากำลังโหลด
export function SkeletonStack({ children, label = 'กำลังโหลดข้อมูล', className }: { children: ReactNode; label?: string; className?: string }) {
    return (
        <div className={cn('space-y-6', className)} role="status" aria-busy="true" aria-label={label}>
            {children}
        </div>
    );
}
