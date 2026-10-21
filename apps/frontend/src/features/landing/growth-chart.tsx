import type { GrowthPoint, GrowthResponse, GrowthStats } from '@notstack/shared';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { prefersReducedMotion, useInView } from './reveal';

// ==========================================
// 📈 กราฟการเติบโตของโปรเจกต์ — commit / PR สะสมรายสัปดาห์ จาก GET /api/growth (backend แคชข้อมูล GitHub 1 ชม.)
// วาดเป็น SVG เองเพื่อไม่ต้องโหลด library กราฟในหน้าแรก ; เส้นค่อยๆ ลากเมื่อเลื่อนมาเห็น
// ==========================================

export const growthQuery = queryOptions({
    queryKey: ['app', 'growth'],
    queryFn: () => api<GrowthResponse>('/growth', { sessionless: true }),
    staleTime: 10 * 60 * 1000,
});

type Metric = 'commits' | 'prs';

const SERIES: Record<Metric, { key: keyof GrowthPoint; label: string; color: string; fill?: boolean; dashed?: boolean }[]> = {
    commits: [{ key: 'commits', label: 'Commit', color: '#818cf8', fill: true }],
    prs: [
        { key: 'prs', label: 'PR ที่เปิด', color: '#38bdf8', fill: true },
        { key: 'merged', label: 'PR ที่ merge แล้ว', color: '#c084fc', dashed: true },
    ],
};

const W = 1000;
const H = 280;

const weekLabel = (week: string) => new Date(`${week}T00:00:00Z`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// ตัวเลขนับขึ้นเมื่อ active
function CountUp({ value, active }: { value: number; active: boolean }) {
    const [shown, setShown] = useState(0);
    useEffect(() => {
        if (!active) return;
        if (prefersReducedMotion()) {
            setShown(value);
            return;
        }
        const start = performance.now();
        let frame = requestAnimationFrame(function tick(now) {
            const t = Math.min(1, (now - start) / 1200);
            setShown(Math.round(value * (1 - (1 - t) ** 3)));
            if (t < 1) frame = requestAnimationFrame(tick);
        });
        return () => cancelAnimationFrame(frame);
    }, [active, value]);
    return <>{formatNumber(shown)}</>;
}

function Chart({ points, metric, active }: { points: GrowthPoint[]; metric: Metric; active: boolean }) {
    const [hover, setHover] = useState<number | null>(null);
    // เริ่มลากเส้นหลัง mount (ทั้งตอนเลื่อนมาเห็นครั้งแรกและตอนสลับ Commit / PR)
    const [drawn, setDrawn] = useState(false);
    useEffect(() => {
        if (!active) return;
        let frame = requestAnimationFrame(() => (frame = requestAnimationFrame(() => setDrawn(true))));
        return () => cancelAnimationFrame(frame);
    }, [active]);
    const series = SERIES[metric];
    const max = Math.max(1, ...points.map((p) => Number(p[series[0].key])));
    const x = (i: number) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * W);
    const y = (v: number) => H - (v / max) * (H - 16);

    const paths = useMemo(
        () =>
            series.map((s) => {
                const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(Number(p[s.key])).toFixed(1)}`).join(' ');
                return { ...s, line, area: `${line} L${W},${H} L0,${H} Z` };
            }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [points, metric, max],
    );

    // ป้ายเดือนบนแกน x: จุดแรกของแต่ละเดือน
    const months = points
        .map((p, i) => ({ i, month: p.week.slice(0, 7) }))
        .filter((p, idx, all) => idx === 0 || p.month !== all[idx - 1].month)
        .map(({ i, month }) => ({
            left: (x(i) / W) * 100,
            label: new Date(`${month}-01T00:00:00Z`).toLocaleDateString('th-TH', { month: 'short', timeZone: 'UTC' }),
        }));

    const hovered = hover === null ? null : points[hover];
    const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        setHover(Math.round(ratio * (points.length - 1)));
    };

    return (
        <div>
            <div className="relative h-56 touch-pan-y sm:h-64" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
                {/* เส้นตารางแนวนอน + ค่าบนแกน y */}
                {[0.25, 0.5, 0.75, 1].map((r) => (
                    <div key={r} className="absolute inset-x-0 border-t border-dashed border-white/5" style={{ bottom: `${r * ((H - 16) / H) * 100}%` }}>
                        <span className="absolute -top-2.5 left-0 bg-background pr-1 font-mono text-[10px] text-slate-500">
                            {formatNumber(Math.round(max * r))}
                        </span>
                    </div>
                ))}
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
                    <defs>
                        {paths.map((p) => (
                            <linearGradient key={p.label} id={`growth-${String(p.key)}`} x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stopColor={p.color} stopOpacity="0.35" />
                                <stop offset="100%" stopColor={p.color} stopOpacity="0" />
                            </linearGradient>
                        ))}
                    </defs>
                    {paths.map((p) => (
                        <g key={`${metric}-${p.label}`}>
                            {p.fill && (
                                <path
                                    d={p.area}
                                    fill={`url(#growth-${String(p.key)})`}
                                    className="transition-opacity delay-700 duration-1000 motion-reduce:transition-none"
                                    style={{ opacity: drawn ? 1 : 0 }}
                                />
                            )}
                            <path
                                d={p.line}
                                fill="none"
                                stroke={p.color}
                                strokeWidth={2.5}
                                strokeLinejoin="round"
                                vectorEffect="non-scaling-stroke"
                                {...(p.dashed
                                    ? { strokeDasharray: '6 5', style: { opacity: drawn ? 0.9 : 0 } }
                                    : { pathLength: 1, strokeDasharray: 1, strokeDashoffset: drawn ? 0 : 1 })}
                                className="transition-[stroke-dashoffset,opacity] delay-200 duration-[1600ms] ease-out motion-reduce:transition-none"
                            />
                        </g>
                    ))}
                </svg>
                {/* จุด + เส้นแนวตั้งตอนชี้ */}
                {hovered && hover !== null && (
                    <>
                        <div className="pointer-events-none absolute inset-y-0 border-l border-white/20" style={{ left: `${(x(hover) / W) * 100}%` }} />
                        {series.map((s) => (
                            <span
                                key={s.label}
                                className="pointer-events-none absolute size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full ring-2 ring-background"
                                style={{ left: `${(x(hover) / W) * 100}%`, bottom: `${(1 - y(Number(hovered[s.key])) / H) * 100}%`, background: s.color }}
                            />
                        ))}
                        <div
                            className="pointer-events-none absolute top-0 z-10 w-max rounded-md border bg-popover px-3 py-2 text-xs shadow-lg"
                            style={hover > points.length / 2 ? { right: `${100 - (x(hover) / W) * 100 + 1.5}%` } : { left: `${(x(hover) / W) * 100 + 1.5}%` }}
                        >
                            <p className="mb-1 text-muted-foreground">สัปดาห์ของ {weekLabel(hovered.week)}</p>
                            {series.map((s) => (
                                <p key={s.label} className="flex items-center gap-2">
                                    <span className="size-2 rounded-full" style={{ background: s.color }} />
                                    {s.label} <span className="ml-auto pl-3 font-mono font-semibold">{formatNumber(Number(hovered[s.key]))}</span>
                                </p>
                            ))}
                        </div>
                    </>
                )}
            </div>
            {/* แกน x */}
            <div className="relative mt-2 h-4 text-[11px] text-slate-500">
                {months.map((m) => (
                    <span key={m.label + m.left} className="absolute -translate-x-1/2 first:translate-x-0" style={{ left: `${m.left}%` }}>
                        {m.label}
                    </span>
                ))}
            </div>
        </div>
    );
}

export function GrowthSection() {
    const { data, isPending } = useQuery(growthQuery);
    // ref ต้องอยู่บน element ที่ render ตั้งแต่แรก ไม่งั้น useInView จะไม่เห็นตอนข้อมูลโหลดเสร็จทีหลัง
    const [ref, active] = useInView<HTMLDivElement>(0.2);
    const stats = data?.stats;

    return (
        <div ref={ref}>
            {isPending ? (
                <div className="h-96 animate-pulse rounded-xl border bg-card/40" />
            ) : !stats || stats.points.length < 2 ? (
                <p className="rounded-xl border px-5 py-10 text-center text-sm text-muted-foreground">
                    ตอนนี้ยังดึงข้อมูลจาก GitHub ไม่ได้ ลองเข้ามาดูใหม่อีกที
                </p>
            ) : (
                <GrowthBody stats={stats} active={active} />
            )}
        </div>
    );
}

function GrowthBody({ stats, active }: { stats: GrowthStats; active: boolean }) {
    const [metric, setMetric] = useState<Metric>('commits');

    const cards = [
        { label: 'commit ทั้งหมด', value: stats.totals.commits, note: `+${formatNumber(stats.recent.commits)} ใน 30 วันล่าสุด` },
        { label: 'pull request', value: stats.totals.prs, note: `+${formatNumber(stats.recent.prs)} ใน 30 วันล่าสุด` },
        { label: 'merge แล้ว', value: stats.totals.merged, note: `${Math.round((stats.totals.merged / Math.max(1, stats.totals.prs)) * 100)}% ของ PR ทั้งหมด` },
        {
            label: 'ผู้ร่วมพัฒนา',
            value: stats.totals.contributors,
            note: `เริ่มโปรเจกต์ ${new Date(`${stats.points[0].week}T00:00:00Z`).toLocaleDateString('th-TH', { month: 'short', year: 'numeric', timeZone: 'UTC' })}`,
        },
    ];

    return (
        <div className="space-y-6">
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-4">
                {cards.map((card) => (
                    <div key={card.label} className="bg-background p-4 sm:p-5">
                        <dt className="text-sm text-muted-foreground">{card.label}</dt>
                        <dd className="mt-1 font-mono text-3xl font-semibold tabular-nums">
                            <CountUp value={card.value} active={active} />
                        </dd>
                        <dd className="mt-1 text-xs text-emerald-300/80">{card.note}</dd>
                    </div>
                ))}
            </dl>

            <div className="rounded-xl border p-4 sm:p-6">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex gap-1 rounded-lg border p-1" role="group" aria-label="เลือกข้อมูลในกราฟ">
                        {(
                            [
                                ['commits', 'Commit'],
                                ['prs', 'Pull request'],
                            ] as const
                        ).map(([id, label]) => (
                            <button
                                key={id}
                                type="button"
                                aria-pressed={metric === id}
                                onClick={() => setMetric(id)}
                                className="rounded-md px-3 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground"
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        {SERIES[metric].map((s) => (
                            <span key={s.label} className="flex items-center gap-1.5">
                                <span className="h-0.5 w-4 rounded" style={{ background: s.color }} /> {s.label} (สะสม)
                            </span>
                        ))}
                    </div>
                </div>
                <Chart key={metric} points={stats.points} metric={metric} active={active} />
            </div>
        </div>
    );
}
