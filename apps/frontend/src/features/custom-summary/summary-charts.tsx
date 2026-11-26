import { tr, byLang } from '../../lib/i18n';
import type { CustomSummaryResponse, PluginId } from '@notstack/shared';
import { BarChart3, GitPullRequest, ShieldAlert, TrendingUp, Volume2 } from '@/components/icons';
import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { cn } from '@/lib/utils';
import { formatThaiDuration } from './timezone';

const TIMELINE_CONFIG = byLang(
    () =>
        ({
            messages: { label: tr('common.messagesSent'), color: '#10b981' },
            voiceMinutes: { label: tr('customSummary.voiceTimeMinutes'), color: '#0ea5e9' },
            prTotal: { label: 'GitHub PR', color: '#a855f7' },
            devopsTotal: { label: tr('customSummary.devopsMembers'), color: '#f59e0b' },
        }) satisfies ChartConfig,
);

const VOICE_CONFIG = byLang(
    () =>
        ({
            totalMinutes: { label: tr('customSummary.totalUsageTimeMinutes'), color: '#0ea5e9' },
        }) satisfies ChartConfig,
);

const PR_CONFIG = byLang(
    () =>
        ({
            sent: { label: tr('customSummary.prOpenedUpdated'), color: 'var(--chart-1)' },
            merged: { label: tr('customSummary.merged'), color: '#a855f7' },
            closed: { label: tr('customSummary.prClosedNotMerged'), color: '#f59e0b' },
        }) satisfies ChartConfig,
);

const DEVOPS_CONFIG = byLang(
    () =>
        ({
            grafanaAlerts: { label: 'Grafana Alert', color: '#0ea5e9' },
            jiraCards: { label: 'Jira Card', color: '#f59e0b' },
            memberJoin: { label: tr('common.joinedServer'), color: '#10b981' },
            memberLeave: { label: tr('common.leftServer'), color: '#ef4444' },
        }) satisfies ChartConfig,
);

/** ชุดกราฟเปรียบเทียบกิจกรรมตามโมดูลที่เลือก */
export function SummaryCharts({ summary, installedPlugins }: { summary: CustomSummaryResponse; installedPlugins?: PluginId[] }) {
    const [chartMode, setChartMode] = useState<'area' | 'bar'>('area');
    const [prMode, setPrMode] = useState<'repo' | 'channel'>('repo');

    const enabled = useMemo(() => new Set(summary.filters.modules), [summary.filters.modules]);
    const pluginSource = installedPlugins ?? summary.installedPlugins;
    const hasPlugin = (id: PluginId) => (pluginSource ? pluginSource.includes(id) : true);
    const showPr = enabled.has('githubPr') && hasPlugin('github-pr');
    const showGrafana = hasPlugin('grafana-alert');
    const showJira = hasPlugin('jira-card');

    const timelineData = useMemo(
        () =>
            summary.timeline.map((pt) => ({
                ...pt,
                prTotal: pt.prSent + pt.prMerged + pt.prClosed,
                devopsTotal: pt.grafanaAlerts + pt.jiraCards + pt.memberJoin + pt.memberLeave,
            })),
        [summary.timeline],
    );

    const voiceData = useMemo(
        () =>
            summary.voiceChannels.slice(0, 8).map((row) => ({
                ...row,
                label: `#${row.channelName}`,
                durationText: formatThaiDuration(row.totalSeconds),
            })),
        [summary.voiceChannels],
    );

    const prData = useMemo(() => {
        const list = prMode === 'repo' ? summary.prBreakdown.byRepo : summary.prBreakdown.byChannel;
        return list.slice(0, 8).map((item) => ({
            ...item,
            label: 'repoFullName' in item ? item.repoFullName : `#${item.channelName}`,
        }));
    }, [summary.prBreakdown, prMode]);

    return (
        <div className="space-y-4">
            {/* 1. กราฟแนวโน้มการใช้งานตามช่วงเวลา */}
            <Card className="rounded-xl border-border bg-card">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-base text-foreground">
                            <TrendingUp className="size-4 text-highlight" />
                            {tr('customSummary.activityTrendOverTime')}
                            {summary.range.interval === 'hour' ? tr('common.hourly') : tr('common.daily')})
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground">{tr('customSummary.compareMessageVolumeVoiceTimeGithub')}</CardDescription>
                    </div>
                    <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
                        <Button
                            type="button"
                            size="xs"
                            variant={chartMode === 'area' ? 'default' : 'ghost'}
                            onClick={() => setChartMode('area')}
                            className={cn(
                                'h-7 px-2.5 text-xs',
                                chartMode === 'area' ? 'bg-primary text-primary-foreground hover:bg-primary/80' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            <TrendingUp className="mr-1 size-3" />

                            {tr('customSummary.lineChart')}
                        </Button>
                        <Button
                            type="button"
                            size="xs"
                            variant={chartMode === 'bar' ? 'default' : 'ghost'}
                            onClick={() => setChartMode('bar')}
                            className={cn(
                                'h-7 px-2.5 text-xs',
                                chartMode === 'bar' ? 'bg-primary text-primary-foreground hover:bg-primary/80' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            <BarChart3 className="mr-1 size-3" />

                            {tr('customSummary.barChart')}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {timelineData.length === 0 ? (
                        <EmptyState>{tr('customSummary.noDataPointsInTheSelected')}</EmptyState>
                    ) : (
                        <ChartContainer config={TIMELINE_CONFIG()} className="h-[280px] w-full">
                            {chartMode === 'area' ? (
                                <AreaChart data={timelineData} margin={{ left: -12, right: 10, top: 8 }}>
                                    <defs>
                                        <linearGradient id="csFillMsg" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                                        </linearGradient>
                                        <linearGradient id="csFillVoice" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.35} />
                                            <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.02} />
                                        </linearGradient>
                                        <linearGradient id="csFillPr" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#a855f7" stopOpacity={0.35} />
                                            <stop offset="95%" stopColor="#a855f7" stopOpacity={0.02} />
                                        </linearGradient>
                                        <linearGradient id="csFillDevops" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid vertical={false} stroke="var(--border)" />
                                    <XAxis
                                        dataKey="label"
                                        tickLine={false}
                                        axisLine={false}
                                        minTickGap={20}
                                        tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                                    />
                                    <YAxis
                                        tickLine={false}
                                        axisLine={false}
                                        width={38}
                                        allowDecimals={false}
                                        tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                                    />
                                    <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                                    <ChartLegend content={<ChartLegendContent />} />
                                    {enabled.has('messages') && (
                                        <Area type="monotone" dataKey="messages" stroke="#10b981" strokeWidth={2} fill="url(#csFillMsg)" />
                                    )}
                                    {enabled.has('voice') && (
                                        <Area type="monotone" dataKey="voiceMinutes" stroke="#0ea5e9" strokeWidth={2} fill="url(#csFillVoice)" />
                                    )}
                                    {showPr && <Area type="monotone" dataKey="prTotal" stroke="#a855f7" strokeWidth={2} fill="url(#csFillPr)" />}
                                    {enabled.has('devopsOther') && (
                                        <Area type="monotone" dataKey="devopsTotal" stroke="#f59e0b" strokeWidth={2} fill="url(#csFillDevops)" />
                                    )}
                                </AreaChart>
                            ) : (
                                <BarChart data={timelineData} margin={{ left: -12, right: 10, top: 8 }}>
                                    <CartesianGrid vertical={false} stroke="var(--border)" />
                                    <XAxis
                                        dataKey="label"
                                        tickLine={false}
                                        axisLine={false}
                                        minTickGap={20}
                                        tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                                    />
                                    <YAxis
                                        tickLine={false}
                                        axisLine={false}
                                        width={38}
                                        allowDecimals={false}
                                        tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                                    />
                                    <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                                    <ChartLegend content={<ChartLegendContent />} />
                                    {enabled.has('messages') && <Bar dataKey="messages" fill="#10b981" radius={[4, 4, 0, 0]} />}
                                    {enabled.has('voice') && <Bar dataKey="voiceMinutes" fill="#0ea5e9" radius={[4, 4, 0, 0]} />}
                                    {showPr && <Bar dataKey="prTotal" fill="#a855f7" radius={[4, 4, 0, 0]} />}
                                    {enabled.has('devopsOther') && <Bar dataKey="devopsTotal" fill="#f59e0b" radius={[4, 4, 0, 0]} />}
                                </BarChart>
                            )}
                        </ChartContainer>
                    )}
                </CardContent>
            </Card>

            {/* 2. กราฟเปรียบเทียบห้องเสียง และ GitHub PR */}
            {(enabled.has('voice') || showPr) && (
                <div className={cn('grid gap-4', enabled.has('voice') && showPr ? 'lg:grid-cols-2' : 'grid-cols-1')}>
                    {enabled.has('voice') && (
                        <Card className="rounded-xl border-border bg-card">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base text-foreground">
                                    <Volume2 className="size-4 text-sky-700 dark:text-sky-400" />

                                    {tr('customSummary.voiceTimeShare')}
                                </CardTitle>
                                <CardDescription className="text-xs text-muted-foreground">
                                    {tr('customSummary.totalTalkTimeMinutesFromMatching')}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {voiceData.length === 0 ? (
                                    <EmptyState>{tr('customSummary.noVoiceActivityInTheSelected')}</EmptyState>
                                ) : (
                                    <ChartContainer config={VOICE_CONFIG()} className="h-[260px] w-full">
                                        <BarChart data={voiceData} layout="vertical" margin={{ left: 6, right: 16 }}>
                                            <CartesianGrid horizontal={false} stroke="var(--border)" />
                                            <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                                            <YAxis
                                                type="category"
                                                dataKey="label"
                                                width={130}
                                                tickLine={false}
                                                axisLine={false}
                                                tick={{ fill: 'var(--foreground)', fontSize: 11 }}
                                            />
                                            <ChartTooltip
                                                content={
                                                    <ChartTooltipContent
                                                        formatter={(value, _name, item) => {
                                                            const payload = item?.payload as (typeof voiceData)[number] | undefined;
                                                            return (
                                                                <div className="space-y-0.5 text-xs">
                                                                    <div className="font-semibold text-sky-700 dark:text-sky-400">
                                                                        {payload?.durationText ?? tr('common.min', { 0: value })}
                                                                    </div>
                                                                    {payload && (
                                                                        <div className="text-muted-foreground">
                                                                            {tr('common.joins')} {payload.joins} {tr('customSummary.leaves')} {payload.leaves}{' '}
                                                                            {tr('customSummary.avg')} {payload.avgSessionMinutes} {tr('common.timeSuffix')}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        }}
                                                    />
                                                }
                                            />
                                            <Bar dataKey="totalMinutes" fill="#0ea5e9" radius={[0, 6, 6, 0]} />
                                        </BarChart>
                                    </ChartContainer>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {showPr && (
                        <Card className="rounded-xl border-border bg-card">
                            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2 text-base text-foreground">
                                        <GitPullRequest className="size-4 text-purple-700 dark:text-purple-400" />

                                        {tr('customSummary.prOpenMergeCloseFrequency')}
                                    </CardTitle>
                                    <CardDescription className="text-xs text-muted-foreground">
                                        {tr('customSummary.byRepositoryOrSelectedDiscordAlert')}
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
                                    <Button
                                        type="button"
                                        size="xs"
                                        variant={prMode === 'repo' ? 'default' : 'ghost'}
                                        onClick={() => setPrMode('repo')}
                                        className={cn(
                                            'h-7 px-2 text-xs',
                                            prMode === 'repo'
                                                ? 'bg-primary text-primary-foreground hover:bg-primary/80'
                                                : 'text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        {tr('customSummary.byRepo')}
                                    </Button>
                                    <Button
                                        type="button"
                                        size="xs"
                                        variant={prMode === 'channel' ? 'default' : 'ghost'}
                                        onClick={() => setPrMode('channel')}
                                        className={cn(
                                            'h-7 px-2 text-xs',
                                            prMode === 'channel'
                                                ? 'bg-primary text-primary-foreground hover:bg-primary/80'
                                                : 'text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        {tr('customSummary.byChannel')}
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {prData.length === 0 ? (
                                    <EmptyState>{tr('customSummary.noGithubPrAlertsInThe')}</EmptyState>
                                ) : (
                                    <ChartContainer config={PR_CONFIG()} className="h-[260px] w-full">
                                        <BarChart data={prData} layout="vertical" margin={{ left: 6, right: 16 }}>
                                            <CartesianGrid horizontal={false} stroke="var(--border)" />
                                            <XAxis
                                                type="number"
                                                allowDecimals={false}
                                                tickLine={false}
                                                axisLine={false}
                                                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                                            />
                                            <YAxis
                                                type="category"
                                                dataKey="label"
                                                width={140}
                                                tickLine={false}
                                                axisLine={false}
                                                tick={{ fill: 'var(--foreground)', fontSize: 11 }}
                                            />
                                            <ChartTooltip content={<ChartTooltipContent />} />
                                            <ChartLegend content={<ChartLegendContent />} />
                                            <Bar dataKey="sent" stackId="pr" fill="var(--chart-1)" />
                                            <Bar dataKey="merged" stackId="pr" fill="#a855f7" />
                                            <Bar dataKey="closed" stackId="pr" fill="#f59e0b" radius={[0, 5, 5, 0]} />
                                        </BarChart>
                                    </ChartContainer>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            {/* 3. กราฟ DevOps & สมาชิกเข้า/ออก (เมื่อเปิด devopsOther) */}
            {enabled.has('devopsOther') && timelineData.length > 0 && (
                <Card className="rounded-xl border-border bg-card">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base text-foreground">
                            <ShieldAlert className="size-4 text-amber-700 dark:text-amber-400" />

                            {tr('customSummary.devopsServerJoinLeaveStatistics')}
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground">{tr('customSummary.grafanaAlertJiraCardAndMember')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={DEVOPS_CONFIG()} className="h-[220px] w-full">
                            <BarChart data={timelineData} margin={{ left: -12, right: 10 }}>
                                <CartesianGrid vertical={false} stroke="var(--border)" />
                                <XAxis
                                    dataKey="label"
                                    tickLine={false}
                                    axisLine={false}
                                    minTickGap={20}
                                    tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                                />
                                <YAxis
                                    tickLine={false}
                                    axisLine={false}
                                    width={36}
                                    allowDecimals={false}
                                    tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                                />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                {showGrafana && <Bar dataKey="grafanaAlerts" fill="#0ea5e9" radius={[3, 3, 0, 0]} />}
                                {showJira && <Bar dataKey="jiraCards" fill="#f59e0b" radius={[3, 3, 0, 0]} />}
                                <Bar dataKey="memberJoin" fill="#10b981" radius={[3, 3, 0, 0]} />
                                <Bar dataKey="memberLeave" fill="#ef4444" radius={[3, 3, 0, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
