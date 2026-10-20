import type { ActivityStats } from '@notstack/shared';
import { ViewportContent } from '@/components/viewport-content';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// สีของกราฟโดนัท — วนใช้ซ้ำเมื่อชนิดเหตุการณ์มีมากกว่าจำนวนสี
const PALETTE = ['#6366f1', '#38bdf8', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#a78bfa', '#14b8a6', '#fb923c', '#64748b'];

const serverConfig = {
    serverJoin: { label: 'เข้าเซิร์ฟเวอร์', color: '#10b981' },
    serverLeave: { label: 'ออกเซิร์ฟเวอร์', color: '#ef4444' },
} satisfies ChartConfig;
const voiceConfig = {
    voiceJoin: { label: 'เข้าห้องเสียง', color: '#38bdf8' },
    voiceLeave: { label: 'ออกห้องเสียง', color: '#f59e0b' },
} satisfies ChartConfig;
const usersConfig = { total: { label: 'จำนวนเหตุการณ์', color: '#6366f1' } } satisfies ChartConfig;

// label จาก API เป็น 'YYYY-MM-DD HH:00' (ตามโซนเวลา) — ย่อให้อ่านง่ายบนแกน X
function shortLabel(bucket: string, interval: string): string {
    const [date = '', time = ''] = bucket.split(' ');
    const [, month, day] = date.split('-');
    return interval === 'hour' ? `${day}/${month} ${time.slice(0, 2)}:00` : `${day}/${month}`;
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                <ViewportContent fallback={<div className="h-64" />}>{children}</ViewportContent>
            </CardContent>
        </Card>
    );
}

export default function Charts({ data }: { data: ActivityStats }) {
    const series = data.labels.map((bucket, i) => ({
        label: shortLabel(bucket, data.range.interval),
        serverJoin: data.datasets.serverJoin[i],
        serverLeave: data.datasets.serverLeave[i],
        voiceJoin: data.datasets.voiceJoin[i],
        voiceLeave: data.datasets.voiceLeave[i],
    }));
    const topUsers = data.topUsers.slice(0, 10).map((u) => ({ name: u.userName, total: u.total }));
    const breakdown = data.breakdown.slice(0, 10);
    const breakdownConfig = Object.fromEntries(
        breakdown.map((row, i) => [row.eventKey, { label: row.label, color: PALETTE[i % PALETTE.length] }]),
    ) satisfies ChartConfig;

    const area = (config: ChartConfig, keys: string[]) => (
        <ChartContainer config={config} className="aspect-auto h-64 w-full">
            <AreaChart data={series} margin={{ left: 0, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                <ChartLegend content={<ChartLegendContent />} />
                {keys.map((key) => (
                    <Area
                        key={key}
                        dataKey={key}
                        type="monotone"
                        stroke={`var(--color-${key})`}
                        fill={`var(--color-${key})`}
                        fillOpacity={0.2}
                        strokeWidth={2}
                    />
                ))}
            </AreaChart>
        </ChartContainer>
    );

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="การเข้า / ออกเซิร์ฟเวอร์">{area(serverConfig, ['serverJoin', 'serverLeave'])}</ChartCard>
            <ChartCard title="การเข้า / ออกห้องเสียง">{area(voiceConfig, ['voiceJoin', 'voiceLeave'])}</ChartCard>
            <ChartCard title="ผู้ใช้ที่เคลื่อนไหวมากที่สุด">
                <ChartContainer config={usersConfig} className="aspect-auto h-64 w-full">
                    <BarChart data={topUsers} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <CartesianGrid horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                        <YAxis
                            type="category"
                            dataKey="name"
                            tickLine={false}
                            axisLine={false}
                            width={110}
                            tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)}
                        />
                        <ChartTooltip content={<ChartTooltipContent hideLabel={false} />} />
                        <Bar isAnimationActive={false} dataKey="total" fill="var(--color-total)" radius={6} />
                    </BarChart>
                </ChartContainer>
            </ChartCard>
            <ChartCard title="สัดส่วนเหตุการณ์ทั้งหมด">
                <ChartContainer config={breakdownConfig} className="aspect-auto h-64 w-full">
                    <PieChart>
                        <ChartTooltip content={<ChartTooltipContent nameKey="eventKey" hideLabel />} />
                        <Pie isAnimationActive={false} data={breakdown} dataKey="total" nameKey="eventKey" innerRadius={50} outerRadius={90} strokeWidth={2}>
                            {breakdown.map((row, i) => (
                                <Cell key={row.eventKey} fill={PALETTE[i % PALETTE.length]} />
                            ))}
                        </Pie>
                        <ChartLegend content={<ChartLegendContent nameKey="eventKey" />} className="flex-wrap gap-2 text-[11px]" />
                    </PieChart>
                </ChartContainer>
            </ChartCard>
        </div>
    );
}
