import { formatBaht, roundMoney, type FundTopicSummary } from '@notstack/shared';
import { BarChart3, Lock } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { cn } from '@/lib/utils';
import { ProgressBar } from './progress-bar';
import { StatTile } from './stat-tile';
import { dailyRateOf, percent } from './utils';

// ==========================================
// 📊 ภาพรวมทุกหัวข้อของเซิร์ฟเวอร์ (แบนเนอร์สรุป + กราฟเปรียบเทียบ) และรายการหัวข้อด้านซ้าย
// ==========================================
const overviewTopicsChartConfig = {
    collected: { label: 'เก็บได้แล้ว (บาท)', color: '#10b981' },
    remaining: { label: 'คงค้าง (บาท)', color: '#f59e0b' },
} satisfies ChartConfig;

export function FundsOverviewSummary({ topics }: { topics: FundTopicSummary[] }) {
    const [showChart, setShowChart] = useState(false);

    const totals = useMemo(() => {
        let target = 0;
        let collected = 0;
        let activeCount = 0;
        for (const t of topics) {
            target = roundMoney(target + t.target);
            collected = roundMoney(collected + t.collected);
            if (!t.closed) activeCount++;
        }
        const remaining = Math.max(0, roundMoney(target - collected));
        const pct = percent(collected, target);
        return { target, collected, remaining, activeCount, pct };
    }, [topics]);

    const chartData = useMemo(() => {
        return topics.slice(0, 10).map((t) => ({
            name: t.name.length > 16 ? `${t.name.slice(0, 15)}…` : t.name,
            collected: t.collected,
            remaining: Math.max(0, roundMoney(t.target - t.collected)),
        }));
    }, [topics]);

    if (topics.length <= 1) return null;

    return (
        <Card className="mb-4">
            <CardContent className="pt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="size-4 text-primary" />
                        <span className="text-sm font-semibold">
                            ภาพรวมกองกลางทั้งหมด ({topics.length} หัวข้อ · เปิดอยู่ {totals.activeCount})
                        </span>
                    </div>
                    <Button variant="ghost" size="xs" onClick={() => setShowChart((v) => !v)}>
                        <BarChart3 className="size-3.5" />
                        {showChart ? 'ซ่อนกราฟเปรียบเทียบ' : 'ดูกราฟเปรียบเทียบทุกหัวข้อ'}
                    </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <StatTile label="เป้ารวมทุกหัวข้อ" value={formatBaht(totals.target)} variant="overview" />
                    <StatTile label="เก็บได้รวมทั้งหมด" value={formatBaht(totals.collected)} valueClassName="text-emerald-400" variant="overview" />
                    <StatTile label="ยอดคงค้างรวม" value={formatBaht(totals.remaining)} valueClassName="text-amber-400" variant="overview" />
                    <StatTile label="ความคืบหน้ารวม" value={`${totals.pct}%`} variant="overview" />
                </div>

                {showChart && (
                    <div className="pt-2">
                        <ChartContainer config={overviewTopicsChartConfig} className="aspect-auto h-60 w-full">
                            <BarChart data={chartData} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
                                <CartesianGrid vertical={false} />
                                <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} className="text-xs" />
                                <YAxis tickLine={false} axisLine={false} width={48} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Bar dataKey="collected" stackId="a" fill="var(--color-collected)" radius={[0, 0, 4, 4]} />
                                <Bar dataKey="remaining" stackId="a" fill="var(--color-remaining)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export function TopicListItem({ topic, active, onSelect }: { topic: FundTopicSummary; active: boolean; onSelect: () => void }) {
    const pct = percent(topic.collected, topic.target);
    const dailyRate = dailyRateOf(topic);
    return (
        <button
            type="button"
            onClick={onSelect}
            className={cn(
                'w-full space-y-2 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted/50',
                active && 'border-primary bg-primary/5',
                topic.closed && 'opacity-70',
            )}
        >
            <div className="flex items-center justify-between gap-2">
                <p className="truncate font-medium">{topic.name}</p>
                {topic.closed && <Lock className="size-3.5 shrink-0 text-muted-foreground" />}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                {dailyRate && (
                    <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                        วันละ {formatBaht(dailyRate)}
                    </Badge>
                )}
                <span className="text-[11px] font-medium text-muted-foreground ml-auto tabular-nums">{pct}%</span>
            </div>
            <ProgressBar value={pct} className="h-1.5" />
            <p className="text-xs text-muted-foreground tabular-nums">
                {formatBaht(topic.collected)} / {formatBaht(topic.target)} · ครบ {topic.paidCount}/{topic.memberCount} คน
            </p>
        </button>
    );
}
