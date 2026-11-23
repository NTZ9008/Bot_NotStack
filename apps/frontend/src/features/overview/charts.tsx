import { tr, byLang } from '../../lib/i18n';
import type { ActivityStats } from '@notstack/shared';
import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { formatNumber, shortBucketLabel } from '@/lib/format';
import { PillTabs } from '@/components/report';

// สีของกราฟโดนัท — วนใช้ซ้ำเมื่อชนิดเหตุการณ์มีมากกว่าจำนวนสี
const PALETTE = [
    'var(--chart-1)',
    'var(--chart-5)',
    'var(--chart-2)',
    'var(--chart-3)',
    'var(--chart-4)',
    '#ec4899',
    '#a78bfa',
    '#14b8a6',
    '#fb923c',
    '#64748b',
];

// มุมมองของกราฟแนวโน้ม (สลับด้วยปุ่มแคปซูลมุมขวาบน)
const VIEWS = byLang(() => ({
    all: { label: tr('report.trendAll'), config: { total: { label: tr('overview.events'), color: 'var(--chart-1)' } } satisfies ChartConfig },
    members: {
        label: tr('report.trendMembers'),
        config: {
            serverJoin: { label: tr('common.joinedServer'), color: 'var(--chart-2)' },
            serverLeave: { label: tr('common.leftServer'), color: 'var(--chart-4)' },
        } satisfies ChartConfig,
    },
    voice: {
        label: tr('report.trendVoice'),
        config: {
            voiceJoin: { label: tr('overview.voiceJoins'), color: 'var(--chart-1)' },
            voiceLeave: { label: tr('overview.voiceLeaves'), color: 'var(--chart-3)' },
        } satisfies ChartConfig,
    },
}));
type View = keyof ReturnType<typeof VIEWS>;

function Trend({ data }: { data: ActivityStats }) {
    const [view, setView] = useState<View>('all');
    const views = VIEWS();
    const config = views[view].config;
    const series = data.labels.map((bucket, i) => ({
        label: shortBucketLabel(bucket, data.range.interval),
        total: data.datasets.total[i],
        serverJoin: data.datasets.serverJoin[i],
        serverLeave: data.datasets.serverLeave[i],
        voiceJoin: data.datasets.voiceJoin[i],
        voiceLeave: data.datasets.voiceLeave[i],
    }));
    return (
        <div className="space-y-3">
            <PillTabs<View>
                label={tr('report.trend')}
                value={view}
                onChange={setView}
                options={(Object.keys(views) as View[]).map((key) => ({ value: key, label: views[key].label }))}
            />
            <ChartContainer config={config} className="aspect-auto h-80 w-full">
                <AreaChart data={series} margin={{ left: 0, right: 8, top: 8 }}>
                    <defs>
                        {Object.keys(config).map((key) => (
                            <linearGradient key={key} id={`trend-${key}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={`var(--color-${key})`} stopOpacity={0.35} />
                                <stop offset="100%" stopColor={`var(--color-${key})`} stopOpacity={0} />
                            </linearGradient>
                        ))}
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                    <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                    {Object.keys(config).length > 1 && <ChartLegend content={<ChartLegendContent />} />}
                    {Object.keys(config).map((key) => (
                        <Area
                            key={`${view}-${key}`}
                            dataKey={key}
                            type="monotone"
                            stroke={`var(--color-${key})`}
                            fill={`url(#trend-${key})`}
                            strokeWidth={2.5}
                            animationDuration={700}
                        />
                    ))}
                </AreaChart>
            </ChartContainer>
        </div>
    );
}

function Share({ data }: { data: ActivityStats }) {
    const breakdown = data.breakdown.slice(0, 8);
    const total = data.breakdown.reduce((sum, row) => sum + row.total, 0) || 1;
    const config = Object.fromEntries(
        breakdown.map((row, i) => [row.eventKey, { label: row.label, color: PALETTE[i % PALETTE.length] }]),
    ) satisfies ChartConfig;
    if (breakdown.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">{tr('overview.noDataInThisPeriodYet2')}</p>;
    return (
        <div className="grid items-center gap-4 sm:grid-cols-[11rem_1fr]">
            <ChartContainer config={config} className="mx-auto aspect-square h-44">
                <PieChart>
                    <ChartTooltip content={<ChartTooltipContent nameKey="eventKey" hideLabel />} />
                    <Pie data={breakdown} dataKey="total" nameKey="eventKey" innerRadius={48} outerRadius={80} strokeWidth={2} animationDuration={700}>
                        {breakdown.map((row, i) => (
                            <Cell key={row.eventKey} fill={PALETTE[i % PALETTE.length]} />
                        ))}
                    </Pie>
                </PieChart>
            </ChartContainer>
            {/* คำอธิบายสีพร้อมเปอร์เซ็นต์ อ่านได้โดยไม่ต้องชี้ที่กราฟ */}
            <ul className="space-y-2 text-sm">
                {breakdown.map((row, i) => (
                    <li key={row.eventKey} className="flex items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                        <span className="min-w-0 flex-1 truncate">{row.label}</span>
                        <span className="text-muted-foreground tabular-nums">{formatNumber(row.total)}</span>
                        <span className="w-11 text-right font-semibold tabular-nums">{Math.round((row.total / total) * 100)}%</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

// โหลดแยก (lazy) เพราะ recharts ใหญ่ — หน้าเดียวใช้สองส่วน
export default function OverviewCharts({ data, part }: { data: ActivityStats; part: 'trend' | 'share' }) {
    return part === 'trend' ? <Trend data={data} /> : <Share data={data} />;
}
