import { formatBaht, roundMoney, type FundMemberStatus, type FundTopicDetail } from '@notstack/shared';
import { BarChart3, PieChart as PieChartIcon, TrendingUp } from 'lucide-react';
import { useMemo } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from 'recharts';
import { EmptyState } from '@/components/states';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { toLocalInput } from '@/lib/format';
import { StatTile } from './stat-tile';
import { STATUS_LABEL } from './utils';

// ==========================================
// 📈 แดชบอร์ดกราฟ & สถิติวิเคราะห์ของหัวข้อ
// ==========================================
const statusChartConfig = {
    paid: { label: 'จ่ายครบแล้ว', color: STATUS_LABEL.paid.color },
    partial: { label: 'จ่ายบางส่วน', color: STATUS_LABEL.partial.color },
    unpaid: { label: 'ยังไม่จ่าย', color: STATUS_LABEL.unpaid.color },
} satisfies ChartConfig;

const timelineChartConfig = {
    daily: { label: 'รับเข้ารายวัน (บาท)', color: '#38bdf8' },
    cumulative: { label: 'ยอดสะสมรวม (บาท)', color: '#10b981' },
} satisfies ChartConfig;

const memberBarConfig = {
    paid: { label: 'จ่ายแล้ว (บาท)', color: '#10b981' },
    remaining: { label: 'คงค้าง (บาท)', color: '#f59e0b' },
} satisfies ChartConfig;

export function TopicAnalyticsTab({ topic }: { topic: FundTopicDetail }) {
    // 1. สัดส่วนสถานะสมาชิก (Donut Chart)
    const statusData = useMemo(() => {
        const counts: Record<FundMemberStatus, number> = { paid: 0, partial: 0, unpaid: 0 };
        for (const m of topic.members) counts[m.status] += 1;
        return (Object.keys(statusChartConfig) as FundMemberStatus[])
            .map((status) => ({ status, label: statusChartConfig[status].label, count: counts[status], fill: statusChartConfig[status].color }))
            .filter((item) => item.count > 0);
    }, [topic.members]);

    // 2. แนวโน้มการรับเงินรายวัน & ยอดสะสม (Area / Bar Timeline)
    const timelineData = useMemo(() => {
        if (topic.payments.length === 0) return [];
        const byDate = new Map<string, number>();
        // เรียงจากเก่าไปใหม่
        const sorted = [...topic.payments].sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime());
        for (const p of sorted) {
            const d = new Date(p.paidAt);
            if (Number.isNaN(d.getTime())) continue;
            const key = toLocalInput(d).slice(0, 10); // YYYY-MM-DD
            byDate.set(key, roundMoney((byDate.get(key) ?? 0) + p.amount));
        }
        let cumulative = 0;
        return Array.from(byDate.entries()).map(([dateStr, daily]) => {
            cumulative = roundMoney(cumulative + daily);
            const [, month, day] = dateStr.split('-');
            return {
                date: `${day}/${month}`,
                fullDate: dateStr,
                daily,
                cumulative,
            };
        });
    }, [topic.payments]);

    // 3. ข้อมูลกราฟแท่งเปรียบเทียบรายคน (แสดงสูงสุด 12 คนแรก เรียงตามยอดจ่ายแล้ว + คงค้าง)
    const memberChartData = useMemo(() => {
        return [...topic.members]
            .sort((a, b) => b.paid - a.paid || b.remaining - a.remaining)
            .slice(0, 12)
            .map((m) => ({
                name: m.displayName.length > 14 ? `${m.displayName.slice(0, 13)}…` : m.displayName,
                paid: m.paid,
                remaining: m.remaining,
            }));
    }, [topic.members]);

    // 4. ตัวชี้วัดสำคัญ (KPIs)
    const avgPaidPerMember = topic.memberCount > 0 ? roundMoney(topic.collected / topic.memberCount) : 0;
    const avgPerPayment = topic.payments.length > 0 ? roundMoney(topic.collected / topic.payments.length) : 0;
    const completionRate = topic.memberCount > 0 ? Math.round((topic.paidCount / topic.memberCount) * 100) : 0;

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile
                    label="📊 เฉลี่ยเก็บได้ต่อคน"
                    value={formatBaht(avgPaidPerMember)}
                    subtext={`จากเป้าหมายเฉลี่ย ${formatBaht(topic.amountPerMember)}`}
                    valueClassName="text-emerald-400"
                    tone="emerald"
                    variant="kpi"
                />
                <StatTile
                    label="💸 เฉลี่ยต่อรายการโอน"
                    value={formatBaht(avgPerPayment)}
                    subtext={`จากทั้งหมด ${topic.payments.length} รายการ`}
                    variant="kpi"
                />
                <StatTile
                    label="✅ อัตราคนจ่ายครบ"
                    value={`${completionRate}%`}
                    subtext={`จ่ายครบ ${topic.paidCount} จาก ${topic.memberCount} คน`}
                    tone="sky"
                    variant="kpi"
                />
                <StatTile
                    label="🧾 จำนวนครั้งที่รับเงิน"
                    value={`${topic.payments.length} รายการ`}
                    subtext={topic.payments.length > 0 ? 'บันทึกในระบบแล้ว' : 'ยังไม่มีรายการโอน'}
                    variant="kpi"
                />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                {/* กราฟโดนัทสัดส่วนสถานะสมาชิก */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                            <PieChartIcon className="size-4 text-primary" />
                            สัดส่วนสถานะการจ่ายของสมาชิก
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {statusData.length === 0 ? (
                            <EmptyState>ยังไม่มีสมาชิกในหัวข้อนี้</EmptyState>
                        ) : (
                            <ChartContainer config={statusChartConfig} className="aspect-auto h-64 w-full">
                                <PieChart>
                                    <ChartTooltip content={<ChartTooltipContent nameKey="status" />} />
                                    <Pie data={statusData} dataKey="count" nameKey="status" innerRadius={55} outerRadius={88} paddingAngle={3} strokeWidth={2}>
                                        {statusData.map((entry) => (
                                            <Cell key={entry.status} fill={entry.fill} />
                                        ))}
                                    </Pie>
                                    <ChartLegend content={<ChartLegendContent nameKey="status" />} className="flex-wrap gap-3 text-xs" />
                                </PieChart>
                            </ChartContainer>
                        )}
                    </CardContent>
                </Card>

                {/* กราฟแนวโน้มยอดเงินสะสมตามวันเวลา */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                            <TrendingUp className="size-4 text-emerald-400" />
                            แนวโน้มยอดเงินสะสม & รับเข้ารายวัน
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {timelineData.length === 0 ? (
                            <EmptyState>ยังไม่มีประวัติการรับเงินเพื่อแสดงกราฟแนวโน้ม</EmptyState>
                        ) : (
                            <ChartContainer config={timelineChartConfig} className="aspect-auto h-64 w-full">
                                <AreaChart data={timelineData} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
                                    <CartesianGrid vertical={false} />
                                    <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={20} />
                                    <YAxis tickLine={false} axisLine={false} width={48} />
                                    <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                                    <ChartLegend content={<ChartLegendContent />} />
                                    <Area
                                        type="monotone"
                                        dataKey="cumulative"
                                        stroke="var(--color-cumulative)"
                                        fill="var(--color-cumulative)"
                                        fillOpacity={0.2}
                                        strokeWidth={2}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="daily"
                                        stroke="var(--color-daily)"
                                        fill="var(--color-daily)"
                                        fillOpacity={0.15}
                                        strokeWidth={2}
                                    />
                                </AreaChart>
                            </ChartContainer>
                        )}
                    </CardContent>
                </Card>

                {/* กราฟแท่งเปรียบเทียบยอดจ่ายแล้ว vs คงค้าง รายบุคคล */}
                {memberChartData.length > 0 && (
                    <Card className="lg:col-span-2">
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                                <BarChart3 className="size-4 text-sky-400" />
                                ความคืบหน้ารายบุคคล (จ่ายแล้ว vs คงค้าง)
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ChartContainer config={memberBarConfig} className="aspect-auto h-72 w-full">
                                <BarChart data={memberChartData} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
                                    <CartesianGrid vertical={false} />
                                    <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} className="text-[11px]" />
                                    <YAxis tickLine={false} axisLine={false} width={48} />
                                    <ChartTooltip content={<ChartTooltipContent />} />
                                    <ChartLegend content={<ChartLegendContent />} />
                                    <Bar dataKey="paid" stackId="a" fill="var(--color-paid)" radius={[0, 0, 4, 4]} />
                                    <Bar dataKey="remaining" stackId="a" fill="var(--color-remaining)" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ChartContainer>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
