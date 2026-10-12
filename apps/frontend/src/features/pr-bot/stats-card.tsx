import type { PrBotStatsDays } from '@notstack/shared';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { prBotStatsQuery } from '@/api/bot';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatNumber } from '@/lib/format';

const config = {
    sent: { label: 'ส่งแจ้งเตือน', color: '#38bdf8' },
    merged: { label: 'อัปเดต Merge', color: '#a78bfa' },
    closed: { label: 'อัปเดตปิด PR', color: '#f59e0b' },
} satisfies ChartConfig;
const kinds = ['sent', 'merged', 'closed'] as const;

export function PrBotStatsCard({ guildId }: { guildId: string }) {
    const [days, setDays] = useState<PrBotStatsDays>(7);
    const [view, setView] = useState<'daily' | 'hourly'>('daily');
    const { data, error, isLoading, isFetching, refetch } = useQuery(prBotStatsQuery(guildId, days));
    const total = data ? data.totals.sent + data.totals.merged + data.totals.closed : 0;

    return (
        <Card>
            <CardHeader>
                <CardTitle>ความถี่การแจ้งเตือน PR</CardTitle>
                <CardDescription>นับการส่งแจ้งเตือนและอัปเดตข้อความที่สำเร็จ ตามเวลาไทย (Asia/Bangkok) เริ่มเก็บข้อมูลหลังเปิดใช้สถิติ</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <ToggleGroup
                        type="single"
                        variant="outline"
                        value={String(days)}
                        aria-label="ช่วงเวลาของสถิติ"
                        onValueChange={(value) => {
                            if (value) setDays(Number(value) as PrBotStatsDays);
                        }}
                    >
                        {[7, 30, 90].map((value) => (
                            <ToggleGroupItem key={value} value={String(value)}>
                                {value} วัน
                            </ToggleGroupItem>
                        ))}
                    </ToggleGroup>
                    <div className="flex flex-wrap items-center gap-2">
                        <ToggleGroup
                            type="single"
                            variant="outline"
                            value={view}
                            aria-label="รูปแบบกราฟ"
                            onValueChange={(value) => {
                                if (value === 'daily' || value === 'hourly') setView(value);
                            }}
                        >
                            <ToggleGroupItem value="daily">รายวัน</ToggleGroupItem>
                            <ToggleGroupItem value="hourly">แยกตามชั่วโมง</ToggleGroupItem>
                        </ToggleGroup>
                        <Button variant="outline" size="icon" aria-label="รีเฟรชสถิติ PR" disabled={isFetching} onClick={() => void refetch()}>
                            <RefreshCw className={isFetching ? 'animate-spin' : undefined} />
                        </Button>
                    </div>
                </div>
                {isLoading ? (
                    <LoadingState />
                ) : error ? (
                    <ErrorState error={error} />
                ) : (
                    data && (
                        <>
                            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                                {[
                                    { label: 'รวมทั้งหมด (ครั้ง)', value: total },
                                    ...kinds.map((kind) => ({ label: config[kind].label, value: data.totals[kind] })),
                                ].map((tile) => (
                                    <div key={tile.label} className="rounded-xl border p-4">
                                        <p className="text-2xl font-semibold tabular-nums">{formatNumber(tile.value)}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">{tile.label}</p>
                                    </div>
                                ))}
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {view === 'daily'
                                    ? `จำนวนครั้งในแต่ละวัน ย้อนหลัง ${days} วันรวมวันนี้`
                                    : `จำนวนครั้งรวมในแต่ละชั่วโมง (00–23 น.) จาก ${days} วันรวมวันนี้`}
                                {' · '}วันนี้นับถึงเวลาที่โหลดข้อมูล
                            </p>
                            {total === 0 ? (
                                <EmptyState>ยังไม่มีการแจ้งเตือน PR ในช่วงเวลานี้ สถิติจะปรากฏเมื่อบอทส่งหรืออัปเดตข้อความสำเร็จ</EmptyState>
                            ) : (
                                <ChartContainer config={config} className="aspect-auto h-72 w-full">
                                    <BarChart accessibilityLayer data={data[view]} margin={{ left: 0, right: 8 }}>
                                        <CartesianGrid vertical={false} />
                                        <XAxis
                                            dataKey="label"
                                            tickLine={false}
                                            axisLine={false}
                                            minTickGap={24}
                                            tickFormatter={(label: string) => (view === 'daily' ? `${label.slice(8, 10)}/${label.slice(5, 7)}` : label)}
                                        />
                                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={44} />
                                        <ChartTooltip content={<ChartTooltipContent />} />
                                        <ChartLegend content={<ChartLegendContent />} />
                                        {kinds.map((kind) => (
                                            <Bar key={kind} dataKey={kind} stackId="notifications" fill={`var(--color-${kind})`} />
                                        ))}
                                    </BarChart>
                                </ChartContainer>
                            )}
                            <p className="text-xs text-muted-foreground">
                                ส่งแจ้งเตือนรวมการเปิด PR, เปิดอีกครั้ง และพร้อมรีวิว · Merge/ปิด PR นับเมื่อแก้ข้อความเดิมสำเร็จ · PR เดียวอาจมีหลายเหตุการณ์
                            </p>
                        </>
                    )
                )}
            </CardContent>
        </Card>
    );
}
