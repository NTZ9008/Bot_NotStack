import { tr, byLang } from '../../lib/i18n';
import type { CustomSummaryResponse, PluginId } from '@notstack/shared';
import { BarChart3, GitPullRequest, ShieldAlert, TrendingUp, Users, Volume2 } from '@/components/icons';
import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { cn } from '@/lib/utils';
import { formatThaiDuration } from './timezone';

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

const SERVER_JOIN_LEAVE_CONFIG = byLang(
    () =>
        ({
            memberJoin: { label: tr('common.joinedServer'), color: '#10b981' },
            memberLeave: { label: tr('common.leftServer'), color: '#ef4444' },
        }) satisfies ChartConfig,
);

/** ชุดกราฟเปรียบเทียบกิจกรรมตามโมดูล Core และปลั๊กอินที่ติดตั้งจริง */
export function SummaryCharts({ summary, installedPlugins }: { summary: CustomSummaryResponse; installedPlugins?: PluginId[] }) {
    const [chartMode, setChartMode] = useState<'area' | 'bar'>('area');
    const [prMode, setPrMode] = useState<'repo' | 'channel'>('repo');

    const enabled = useMemo(() => new Set(summary.filters.modules), [summary.filters.modules]);
    const pluginSource = installedPlugins ?? summary.installedPlugins;
    const hasPlugin = (id: PluginId) => (pluginSource ? pluginSource.includes(id) : true);
    const showVoice = enabled.has('voice');
    const showMessages = enabled.has('messages');
    const showServer = enabled.has('server');
    const prInstalled = hasPlugin('github-pr');
    const grafanaInstalled = hasPlugin('grafana-alert');
    const jiraInstalled = hasPlugin('jira-card');
    const showPr = enabled.has('githubPr') && prInstalled;
    const showGrafana = enabled.has('devops') && grafanaInstalled;
    const showJira = enabled.has('devops') && jiraInstalled;
    const showDevops = showGrafana || showJira;
    const anyPluginInstalled = prInstalled || grafanaInstalled || jiraInstalled;

    const timelineConfig = useMemo<ChartConfig>(() => {
        const cfg: ChartConfig = {
            messages: { label: tr('common.messagesSent'), color: '#10b981' },
            voiceMinutes: { label: tr('customSummary.voiceTimeMinutes'), color: '#0ea5e9' },
            serverTotal: { label: tr('customSummary.membersJoiningLeaving'), color: '#6366f1' },
        };
        if (showPr) cfg.prTotal = { label: 'GitHub PR', color: '#a855f7' };
        if (showDevops) {
            cfg.devopsTotal = {
                label: showGrafana && showJira ? 'DevOps' : showGrafana ? 'Grafana Alert' : 'Jira Card',
                color: '#f59e0b',
            };
        }
        return cfg;
    }, [showPr, showDevops, showGrafana, showJira]);

    const devopsConfig = useMemo<ChartConfig>(() => {
        const cfg: ChartConfig = {};
        if (showGrafana) cfg.grafanaAlerts = { label: 'Grafana Alert', color: '#0ea5e9' };
        if (showJira) cfg.jiraCards = { label: 'Jira Card', color: '#f59e0b' };
        return cfg;
    }, [showGrafana, showJira]);

    const timelineData = useMemo(
        () =>
            summary.timeline.map((pt) => ({
                ...pt,
                serverTotal: pt.memberJoin + pt.memberLeave,
                prTotal: pt.prSent + pt.prMerged + pt.prClosed,
                devopsTotal: (showGrafana ? pt.grafanaAlerts : 0) + (showJira ? pt.jiraCards : 0),
            })),
        [summary.timeline, showGrafana, showJira],
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
                        <CardDescription className="text-xs text-muted-foreground">
                            {anyPluginInstalled ? tr('customSummary.compareMessageVolumeVoiceTimeGithub') : tr('customSummary.compareCoreTrendDesc')}
                        </CardDescription>
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
                        <ChartContainer config={timelineConfig} className="h-[280px] w-full">
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
                                        <linearGradient id="csFillServer" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
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
                                    {showMessages && (
                                        <Area type="monotone" dataKey="messages" stroke="#10b981" strokeWidth={2} fill="url(#csFillMsg)" />
                                    )}
                                    {showVoice && (
                                        <Area type="monotone" dataKey="voiceMinutes" stroke="#0ea5e9" strokeWidth={2} fill="url(#csFillVoice)" />
                                    )}
                                    {showServer && (
                                        <Area type="monotone" dataKey="serverTotal" stroke="#6366f1" strokeWidth={2} fill="url(#csFillServer)" />
                                    )}
                                    {showPr && <Area type="monotone" dataKey="prTotal" stroke="#a855f7" strokeWidth={2} fill="url(#csFillPr)" />}
                                    {showDevops && (
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
                                    {showMessages && <Bar dataKey="messages" fill="#10b981" radius={[4, 4, 0, 0]} />}
                                    {showVoice && <Bar dataKey="voiceMinutes" fill="#0ea5e9" radius={[4, 4, 0, 0]} />}
                                    {showServer && <Bar dataKey="serverTotal" fill="#6366f1" radius={[4, 4, 0, 0]} />}
                                    {showPr && <Bar dataKey="prTotal" fill="#a855f7" radius={[4, 4, 0, 0]} />}
                                    {showDevops && <Bar dataKey="devopsTotal" fill="#f59e0b" radius={[4, 4, 0, 0]} />}
                                </BarChart>
                            )}
                        </ChartContainer>
                    )}
                </CardContent>
            </Card>

            {/* 2. กราฟเปรียบเทียบห้องเสียง และ GitHub PR */}
            {(showVoice || showPr) && (
                <div className={cn('grid gap-4', showVoice && showPr ? 'lg:grid-cols-2' : 'grid-cols-1')}>
                    {showVoice && (
                        <Card className="rounded-xl border-border bg-card">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base text-foreground">
                                    <Volume2 className="size-4 text-info" />

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
                                                                    <div className="font-semibold text-info">
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

            {/* 3. กราฟสมาชิกเข้า/ออกเซิร์ฟเวอร์ (Core) และกราฟ DevOps (Plugin) แยกออกจากกัน */}
            {(showServer || showDevops) && timelineData.length > 0 && (
                <div className={cn('grid gap-4', showServer && showDevops ? 'lg:grid-cols-2' : 'grid-cols-1')}>
                    {showServer && (
                        <Card className="rounded-xl border-border bg-card">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base text-foreground">
                                    <Users className="size-4 text-indigo-700 dark:text-indigo-400" />
                                    {tr('customSummary.serverJoinLeaveTrend')}
                                </CardTitle>
                                <CardDescription className="text-xs text-muted-foreground">
                                    {tr('customSummary.serverJoinLeaveTrendDesc')}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ChartContainer config={SERVER_JOIN_LEAVE_CONFIG()} className="h-[220px] w-full">
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
                                        <Bar dataKey="memberJoin" fill="#10b981" radius={[3, 3, 0, 0]} />
                                        <Bar dataKey="memberLeave" fill="#ef4444" radius={[3, 3, 0, 0]} />
                                    </BarChart>
                                </ChartContainer>
                            </CardContent>
                        </Card>
                    )}

                    {showDevops && (
                        <Card className="rounded-xl border-border bg-card">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base text-foreground">
                                    <ShieldAlert className="size-4 text-warning" />
                                    {tr('customSummary.devopsStatistics')}
                                </CardTitle>
                                <CardDescription className="text-xs text-muted-foreground">
                                    {showGrafana && showJira
                                        ? tr('customSummary.devopsChartDescBoth')
                                        : showGrafana
                                          ? tr('customSummary.devopsChartDescGrafana')
                                          : tr('customSummary.devopsChartDescJira')}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ChartContainer config={devopsConfig} className="h-[220px] w-full">
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
                                    </BarChart>
                                </ChartContainer>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}
        </div>
    );
}
