import { useMemo } from 'react';
import type { UptimeTargetSummary } from '@notstack/shared';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Activity, RefreshCw } from '@/components/icons';
import { uptimeDetailQuery } from '@/api/uptime';
import { EmptyState, ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { dateLocale, tr, useT } from '@/lib/i18n';

const CHART_CONFIG = (): ChartConfig => ({
    latencyMs: { label: tr('uptime.responseTimeMs'), color: '#f43f5e' },
});

function formatTickTime(iso: string): string {
    return new Date(iso).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' });
}

export function LatencyChartCard({
    guildId,
    targets,
    selectedTargetId,
    onSelectTarget,
}: {
    guildId: string;
    targets: UptimeTargetSummary[];
    selectedTargetId: number | null;
    onSelectTarget: (targetId: number) => void;
}) {
    const t = useT();
    const activeId = selectedTargetId && targets.some((item) => item.id === selectedTargetId) ? selectedTargetId : (targets[0]?.id ?? null);

    const { data, isLoading, isFetching, error, refetch } = useQuery({
        ...uptimeDetailQuery(guildId, activeId ?? 0),
        enabled: activeId !== null,
    });

    const chartData = useMemo(
        () =>
            (data?.series24h ?? []).map((pt) => ({
                time: formatTickTime(pt.checkedAt),
                checkedAt: pt.checkedAt,
                latencyMs: pt.latencyMs ?? 0,
                status: pt.status,
                statusCode: pt.statusCode,
                error: pt.error,
            })),
        [data?.series24h],
    );

    if (targets.length === 0) return null;

    return (
        <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Activity className="size-4 text-rose-500" />
                        {t('uptime.latencyChart24h')}
                    </CardTitle>
                    <CardDescription>{t('uptime.latencyChart24hDesc')}</CardDescription>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Select value={activeId !== null ? String(activeId) : ''} onValueChange={(v) => onSelectTarget(Number(v))}>
                        <SelectTrigger className="w-56">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {targets.map((item) => (
                                <SelectItem key={item.id} value={String(item.id)}>
                                    {item.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="icon" aria-label={t('common.refresh')} disabled={isFetching} onClick={() => void refetch()}>
                        <RefreshCw className={isFetching ? 'size-4 animate-spin' : 'size-4'} />
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {data && (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">
                            {t('uptime.uptime24h')}:{' '}
                            <strong className="ml-1 text-foreground">
                                {data.target.uptime24hPercent !== null ? `${data.target.uptime24hPercent}%` : '—'}
                            </strong>
                        </Badge>
                        <Badge variant="outline">
                            {t('uptime.avgLatency')}:{' '}
                            <strong className="ml-1 text-foreground">
                                {data.target.avgLatency24hMs !== null ? `${data.target.avgLatency24hMs} ms` : '—'}
                            </strong>
                        </Badge>
                        <Badge variant="outline">
                            {t('uptime.checksCount24h')}: <strong className="ml-1 text-foreground">{data.target.checks24hCount}</strong>
                        </Badge>
                    </div>
                )}

                {isLoading ? (
                    <Skeleton className="h-64 w-full rounded-xl" />
                ) : error ? (
                    <ErrorState error={error} />
                ) : chartData.length === 0 ? (
                    <EmptyState>{t('uptime.noCheckHistoryYet')}</EmptyState>
                ) : (
                    <ChartContainer config={CHART_CONFIG()} className="aspect-auto h-64 w-full">
                        <AreaChart data={chartData} margin={{ left: -8, right: 12, top: 8 }}>
                            <defs>
                                <linearGradient id="uptimeLatencyFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.35} />
                                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.02} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid vertical={false} stroke="var(--border)" />
                            <XAxis dataKey="time" tickLine={false} axisLine={false} minTickGap={24} tick={{ fontSize: 11 }} />
                            <YAxis
                                tickLine={false}
                                axisLine={false}
                                width={48}
                                tickFormatter={(v: number) => `${v}ms`}
                                tick={{ fontSize: 11 }}
                            />
                            <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                            <Area
                                type="monotone"
                                dataKey="latencyMs"
                                stroke="#f43f5e"
                                strokeWidth={2}
                                fill="url(#uptimeLatencyFill)"
                                dot={chartData.length <= 20}
                            />
                        </AreaChart>
                    </ChartContainer>
                )}
            </CardContent>
        </Card>
    );
}
