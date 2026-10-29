import { formatBaht, roundMoney, type FundTopicSummary } from '@notstack/shared';
import { AlertTriangle, BarChart3, CheckCircle2, Clock, Lock, Plus, Sparkles, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { cn } from '@/lib/utils';
import { ProgressBar } from './progress-bar';
import { StatTile } from './stat-tile';
import { TOPIC_TEMPLATES, dailyRateOf, dueDateStatus, percent, type TopicTemplate } from './utils';

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
        let completedCount = 0;
        let memberTotal = 0;
        let memberPaid = 0;
        for (const t of topics) {
            target = roundMoney(target + t.target);
            collected = roundMoney(collected + t.collected);
            memberTotal += t.memberCount;
            memberPaid += t.paidCount;
            if (!t.closed) activeCount++;
            if (t.target > 0 && t.collected + 0.001 >= t.target) completedCount++;
        }
        const remaining = Math.max(0, roundMoney(target - collected));
        const pct = percent(collected, target);
        return { target, collected, remaining, activeCount, completedCount, memberTotal, memberPaid, pct };
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
        <Card className="mb-4 border-primary/15 bg-gradient-to-br from-card via-card to-primary/5">
            <CardContent className="space-y-3 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex size-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
                            <Wallet className="size-4" />
                        </div>
                        <span className="text-sm font-semibold">ภาพรวมกองกลางทั้งเซิร์ฟเวอร์</span>
                        <Badge variant="outline" className="text-[11px]">
                            ทั้งหมด {topics.length} หัวข้อ · เปิดอยู่ {totals.activeCount}
                        </Badge>
                        {totals.completedCount > 0 && (
                            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[11px] text-emerald-400">
                                ครบเป้า {totals.completedCount} หัวข้อ
                            </Badge>
                        )}
                    </div>
                    <Button variant="outline" size="xs" onClick={() => setShowChart((v) => !v)}>
                        <BarChart3 className="size-3.5" />
                        {showChart ? 'ซ่อนกราฟเปรียบเทียบ' : 'เปรียบเทียบทุกหัวข้อ'}
                    </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <StatTile label="เป้ารวมทุกหัวข้อ" value={formatBaht(totals.target)} subtext={`จาก ${topics.length} หัวข้อเก็บเงิน`} variant="overview" />
                    <StatTile
                        label="เก็บได้รวมทั้งหมด"
                        value={formatBaht(totals.collected)}
                        subtext={`คืบหน้ารวม ${totals.pct}%`}
                        valueClassName="text-emerald-400"
                        tone="emerald"
                        variant="overview"
                    />
                    <StatTile
                        label="ยอดคงค้างรวม"
                        value={formatBaht(totals.remaining)}
                        subtext={totals.remaining > 0 ? 'รอเก็บเพิ่มเติม' : 'เก็บครบทุกหัวข้อแล้ว'}
                        valueClassName={totals.remaining > 0 ? 'text-amber-400' : 'text-muted-foreground'}
                        tone={totals.remaining > 0 ? 'amber' : 'default'}
                        variant="overview"
                    />
                    <StatTile
                        label="ความคืบหน้ารวม"
                        value={`${totals.pct}%`}
                        subtext={`จ่ายครบ ${totals.memberPaid}/${totals.memberTotal} รายการคน`}
                        tone="sky"
                        variant="overview"
                    />
                </div>

                <div className="flex items-center gap-3">
                    <ProgressBar value={totals.pct} className="h-2" />
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{totals.pct}%</span>
                </div>

                {showChart && (
                    <div className="rounded-lg border bg-background/50 p-3 pt-4">
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
    const remaining = Math.max(0, roundMoney(topic.target - topic.collected));
    const due = dueDateStatus(topic.dueDate, topic.closed);
    const isCompleted = topic.target > 0 && remaining === 0;

    return (
        <button
            type="button"
            onClick={onSelect}
            className={cn(
                'group relative w-full space-y-2 rounded-xl border px-3.5 py-3 text-left transition-all hover:border-primary/40 hover:bg-muted/40',
                active ? 'border-primary border-l-4 bg-primary/8 shadow-xs' : 'bg-card/60',
                topic.closed && !active && 'opacity-70',
            )}
        >
            <div className="flex items-start justify-between gap-2">
                <p className={cn('truncate text-sm font-semibold', active && 'text-primary')}>{topic.name}</p>
                {topic.closed ? (
                    <Badge variant="secondary" className="h-5 shrink-0 gap-1 px-1.5 text-[10px]">
                        <Lock className="size-2.5" /> ปิด
                    </Badge>
                ) : isCompleted ? (
                    <Badge variant="outline" className="h-5 shrink-0 gap-1 border-emerald-500/40 bg-emerald-500/10 px-1.5 text-[10px] text-emerald-400">
                        <CheckCircle2 className="size-2.5" /> ครบเป้า
                    </Badge>
                ) : due?.tone === 'overdue' ? (
                    <Badge variant="outline" className="h-5 shrink-0 gap-1 border-destructive/40 bg-destructive/10 px-1.5 text-[10px] text-destructive">
                        <AlertTriangle className="size-2.5" /> {due.shortLabel}
                    </Badge>
                ) : due?.tone === 'soon' ? (
                    <Badge variant="outline" className="h-5 shrink-0 gap-1 border-amber-500/40 bg-amber-500/10 px-1.5 text-[10px] text-amber-400">
                        <Clock className="size-2.5" /> {due.shortLabel}
                    </Badge>
                ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
                {dailyRate ? (
                    <Badge variant="outline" className="border-primary/30 bg-primary/5 text-[10px] text-primary">
                        📅 วันละ {formatBaht(dailyRate)}
                    </Badge>
                ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        💰 คนละ {formatBaht(topic.amountPerMember)}
                    </Badge>
                )}
                <span className="ml-auto text-xs font-bold tabular-nums text-foreground">{pct}%</span>
            </div>

            <ProgressBar value={pct} className="h-1.5" />

            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground tabular-nums">
                <span className="truncate">
                    <span className="font-medium text-emerald-400">{formatBaht(topic.collected)}</span> / {formatBaht(topic.target)}
                </span>
                <span className="shrink-0">
                    ครบ {topic.paidCount}/{topic.memberCount} คน
                </span>
            </div>
        </button>
    );
}

// หน้าต้อนรับเมื่อยังไม่มีหัวข้อเก็บเงิน พร้อมเทมเพลตเริ่มใช้งานในคลิกเดียว
export function FundsEmptyOnboarding({ onCreateBlank, onSelectTemplate }: { onCreateBlank: () => void; onSelectTemplate: (template: TopicTemplate) => void }) {
    return (
        <Card className="border-dashed bg-gradient-to-b from-card to-muted/20">
            <CardContent className="flex flex-col items-center py-10 text-center">
                <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                    <Wallet className="size-6" />
                </div>
                <h2 className="text-lg font-semibold">เริ่มต้นสร้างหัวข้อเก็บเงินแรกของเซิร์ฟเวอร์</h2>
                <p className="mt-1 max-w-lg text-sm text-muted-foreground">
                    จัดการกองกลาง หารค่าเซิร์ฟเวอร์ หรือเก็บเงินรายวันพร้อมติดตามยอดค้างชำระรายคน กราฟสรุป และส่งรายงานเข้าห้อง Discord อัตโนมัติ
                </p>

                <div className="mt-5">
                    <Button size="lg" onClick={onCreateBlank}>
                        <Plus /> สร้างหัวข้อเก็บเงินใหม่
                    </Button>
                </div>

                <div className="mt-8 w-full max-w-3xl space-y-2.5 text-left">
                    <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Sparkles className="size-3.5 text-primary" /> หรือเลือกเทมเพลตสำเร็จรูปเพื่อกรอกข้อมูลเริ่มต้นให้อัตโนมัติ
                    </p>
                    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                        {TOPIC_TEMPLATES.map((tpl) => (
                            <button
                                key={tpl.id}
                                type="button"
                                onClick={() => onSelectTemplate(tpl)}
                                className="flex flex-col items-start gap-1 rounded-xl border bg-card/80 p-3 text-left transition-all hover:border-primary/50 hover:bg-muted/40"
                            >
                                <span className="text-xl">{tpl.emoji}</span>
                                <span className="mt-1 text-sm font-semibold">{tpl.title}</span>
                                <span className="text-xs text-muted-foreground">{tpl.subtitle}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
