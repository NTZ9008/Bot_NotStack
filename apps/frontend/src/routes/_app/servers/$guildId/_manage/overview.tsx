import { tr, byLang } from '../../../../../lib/i18n';
import type { ActivityStats } from '@notstack/shared';
import { DateTimeInput } from '@/components/date-time-input';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Bot, RefreshCw } from '@/components/icons';
import { lazy, Suspense, useMemo, useState } from 'react';
import { ViewportContent } from '@/components/viewport-content';
import { activityStatsQuery, type StatsParams } from '@/api/admin';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { GettingStarted } from '@/components/getting-started';
import { MiniRelationBoard } from '@/features/relations/mini-board';
import { RankBadge } from '@/components/rank-badge';
import { OverviewStatsSkeleton } from '@/components/skeleton/guild-pages';
import { ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatDateTime, formatMinutes, formatNumber, toLocalInput } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useGuildId } from '@/hooks/use-guild';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/overview')({
    loader: ({ context, params }) => context.queryClient.ensureQueryData(activityStatsQuery(params.guildId, { includeBots: false })),
    component: OverviewPage,
});

const Charts = lazy(() => import('@/features/overview/charts'));
function ChartsSkeleton() {
    return (
        <div className="grid gap-4 lg:grid-cols-2" aria-label={tr('overview.loadingChart')}>
            {[0, 1, 2, 3].map((key) => (
                <div key={key} className="h-80 rounded-xl border bg-muted/30" />
            ))}
        </div>
    );
}

const PRESETS = byLang(() => [
    { value: '24', label: tr('common.n24Hrs') },
    { value: '168', label: tr('common.n7Days') },
    { value: '720', label: tr('common.n30Days') },
    { value: '2160', label: tr('common.n90Days') },
    { value: 'custom', label: tr('common.custom') },
]);

function rangeFromPreset(preset: string, custom: { from: string; to: string }): Pick<StatsParams, 'from' | 'to' | 'hours'> {
    if (preset === 'custom') {
        return {
            from: custom.from ? new Date(custom.from).toISOString() : undefined,
            to: custom.to ? new Date(custom.to).toISOString() : undefined,
        };
    }
    return preset === '168' ? {} : { hours: Number(preset) };
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'bad' | 'info' }) {
    return (
        <div className="rounded-xl border bg-card p-4">
            <p
                className={cn(
                    'text-2xl font-semibold tabular-nums',
                    tone === 'ok' && 'text-emerald-700 dark:text-emerald-400',
                    tone === 'bad' && 'text-red-700 dark:text-red-400',
                    tone === 'info' && 'text-sky-700 dark:text-sky-400',
                )}
            >
                {value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        </div>
    );
}

type TopUser = ActivityStats['topUsers'][number] & { rank: number };
type VoiceUser = ActivityStats['topVoiceUsers'][number] & { rank: number };
type VoiceChannelRow = ActivityStats['topVoiceChannels'][number] & { rank: number; minutes: number };

const userCell = (name: string, id: string, isBot = false) => (
    <div>
        <p className="flex items-center gap-1.5 font-medium">
            {name}
            {isBot && <Badge variant="secondary">BOT</Badge>}
        </p>
        <p className="font-mono text-xs text-muted-foreground">{id}</p>
    </div>
);

const topUserColumns = byLang((): ColumnDef<TopUser>[] => [
    { accessorKey: 'rank', header: '#', cell: ({ row }) => <RankBadge rank={row.original.rank} /> },
    { id: 'user', header: tr('common.user'), cell: ({ row: { original: u } }) => userCell(u.userName, u.userId, u.isBot) },
    { accessorKey: 'total', header: tr('common.event'), cell: ({ row }) => <strong>{formatNumber(row.original.total)}</strong> },
    { accessorKey: 'messages', header: tr('common.messages'), cell: ({ row }) => formatNumber(row.original.messages) },
    { accessorKey: 'voiceJoins', header: tr('overview.voiceJoins'), cell: ({ row }) => formatNumber(row.original.voiceJoins) },
    { accessorKey: 'commands', header: tr('common.command'), cell: ({ row }) => formatNumber(row.original.commands) },
    { accessorKey: 'lastSeen', header: tr('common.recent'), cell: ({ row }) => <span className="text-xs">{formatDateTime(row.original.lastSeen)}</span> },
]);

const voiceUserColumns = byLang((): ColumnDef<VoiceUser>[] => [
    { accessorKey: 'rank', header: '#', cell: ({ row }) => <RankBadge rank={row.original.rank} /> },
    { id: 'user', header: tr('common.user'), cell: ({ row: { original: u } }) => userCell(u.userName, u.userId) },
    { accessorKey: 'minutes', header: tr('overview.totalTime'), cell: ({ row }) => formatMinutes(row.original.minutes) },
    { accessorKey: 'sessions', header: tr('common.count'), cell: ({ row }) => formatNumber(row.original.sessions) },
]);

const voiceChannelColumns = byLang((): ColumnDef<VoiceChannelRow>[] => [
    { accessorKey: 'rank', header: '#', cell: ({ row }) => <RankBadge rank={row.original.rank} /> },
    { id: 'channel', header: tr('common.channel'), cell: ({ row: { original: c } }) => userCell(c.channelName, c.channelId) },
    { accessorKey: 'joins', header: tr('overview.joinsTimes'), cell: ({ row }) => formatNumber(row.original.joins) },
    { accessorKey: 'members', header: tr('overview.uniquePeople'), cell: ({ row }) => formatNumber(row.original.members) },
    { accessorKey: 'minutes', header: tr('overview.totalTime'), cell: ({ row }) => formatMinutes(row.original.minutes) },
]);

function Tables({ data }: { data: ActivityStats }) {
    // เวลาในห้องเสียงคิดจากช่วงที่เลือกเท่านั้น จึงเก็บแยกไว้ผูกกับตารางห้อง
    const minutesByChannel = new Map(data.voiceChannelMinutes.map((row) => [row.channelId, row.minutes]));
    const empty = tr('overview.noDataInThisPeriodYet2');
    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <Card className="lg:col-span-2">
                <CardHeader>
                    <CardTitle className="text-base">{tr('overview.mostActiveUsers2')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <DataTable
                        label={tr('overview.mostActiveUsers2')}
                        columns={topUserColumns()}
                        data={data.topUsers.map((u, i) => ({ ...u, rank: i + 1 }))}
                        empty={empty}
                    />
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">{tr('overview.mostTimeInVoice')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <DataTable
                        label={tr('overview.mostTimeInVoice')}
                        columns={voiceUserColumns()}
                        data={data.topVoiceUsers.map((u, i) => ({ ...u, rank: i + 1 }))}
                        empty={empty}
                    />
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">{tr('overview.mostUsedVoiceChannels')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <DataTable
                        label={tr('overview.mostUsedVoiceChannels')}
                        columns={voiceChannelColumns()}
                        data={data.topVoiceChannels.map((c, i) => ({ ...c, rank: i + 1, minutes: minutesByChannel.get(c.channelId) ?? 0 }))}
                        empty={empty}
                    />
                </CardContent>
            </Card>
        </div>
    );
}

function OverviewPage() {
    const guildId = useGuildId();
    const queryClient = useQueryClient();
    const [preset, setPreset] = useState('168');
    const [interval, setInterval] = useState<'auto' | 'hour' | 'day'>('auto');
    const [includeBots, setIncludeBots] = useState(false);
    const [custom, setCustom] = useState({ from: toLocalInput(new Date(Date.now() - 7 * 86400000)), to: toLocalInput(new Date()) });
    // ช่วงเวลาที่ใช้ดึงข้อมูลจริง (คำนวณใหม่เมื่อเลือกช่วง / กดรีเฟรช / กดดูข้อมูล)
    // The API defaults to the last seven days. Keep its cache key stable on remount.
    const [range, setRange] = useState<Pick<StatsParams, 'from' | 'to' | 'hours'>>({});

    const params = useMemo<StatsParams>(
        () => ({ ...range, interval: interval === 'auto' ? undefined : interval, includeBots }),
        [range, interval, includeBots],
    );
    const { data, isLoading, isFetching, error } = useQuery({ ...activityStatsQuery(guildId, params), placeholderData: keepPreviousData });

    const refresh = () => {
        const nextRange = rangeFromPreset(preset, custom);
        setRange(nextRange);
        // Bypass both freshness layers on an explicit refresh, including identical custom dates.
        void queryClient
            .fetchQuery({
                ...activityStatsQuery(guildId, { ...nextRange, interval: params.interval, includeBots }, true),
                staleTime: 0,
            })
            .catch(() => undefined);
    };
    const summary = data?.summary;
    const net = summary ? summary.serverJoin - summary.serverLeave : 0;
    const tiles = summary
        ? [
              { label: tr('overview.allEvents'), value: formatNumber(summary.totalEvents) },
              { label: tr('common.joinedServer'), value: formatNumber(summary.serverJoin), tone: 'ok' as const },
              { label: tr('common.leftServer'), value: formatNumber(summary.serverLeave), tone: 'bad' as const },
              {
                  label: tr('overview.netMemberChange'),
                  value: `${net > 0 ? '+' : ''}${formatNumber(net)}`,
                  tone: net >= 0 ? ('ok' as const) : ('bad' as const),
              },
              { label: tr('overview.voiceJoins'), value: formatNumber(summary.voiceJoin), tone: 'info' as const },
              { label: tr('common.totalVoiceTime'), value: formatMinutes(summary.voiceMinutes), tone: 'info' as const },
              { label: tr('common.messagesSent'), value: formatNumber(summary.messages) },
              { label: tr('overview.activeUsers'), value: formatNumber(summary.activeUsers) },
          ]
        : [];

    return (
        <>
            <PageHeader help="overview" title={tr('common.serverOverview')} description={tr('overview.serverActivityAtAGlanceJoins')} />
            <GettingStarted />
            <Link to="/servers/$guildId/ai" params={{ guildId }} className="block">
                <Card className="transition-colors hover:border-highlight/50 hover:bg-highlight/5">
                    <CardContent className="flex items-center gap-3 py-4">
                        <Bot className="size-5 text-highlight" />
                        <div>
                            <div className="font-medium">{tr('common.aiChatSettings')}</div>
                            <p className="text-sm text-muted-foreground">{tr('overview.connectTheServersGeminiApiKey')}</p>
                        </div>
                    </CardContent>
                </Card>
            </Link>
            <MiniRelationBoard guildId={guildId} />
            <Card>
                <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <ToggleGroup
                            className="flex-wrap justify-start"
                            type="single"
                            variant="outline"
                            value={preset}
                            onValueChange={(value) => {
                                if (!value) return;
                                setPreset(value);
                                // "กำหนดเอง" รอให้ผู้ใช้กด "ดูข้อมูล" เอง
                                if (value !== 'custom') setRange(rangeFromPreset(value, custom));
                            }}
                        >
                            {PRESETS().map((p) => (
                                <ToggleGroupItem key={p.value} value={p.value}>
                                    {p.label}
                                </ToggleGroupItem>
                            ))}
                        </ToggleGroup>
                        <div className="flex flex-wrap items-center gap-2">
                            <Select value={interval} onValueChange={(value) => setInterval(value as typeof interval)}>
                                <SelectTrigger className="w-48">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="auto">{tr('overview.resolutionAuto')}</SelectItem>
                                    <SelectItem value="hour">{tr('common.hourly')}</SelectItem>
                                    <SelectItem value="day">{tr('common.daily')}</SelectItem>
                                </SelectContent>
                            </Select>
                            <Label className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
                                {tr('common.includeBots')}
                                <Switch checked={includeBots} onCheckedChange={setIncludeBots} />
                            </Label>
                            <Button variant="outline" onClick={refresh}>
                                {/* reduced motion: slow the spin instead of stopping it, so activity stays visible */}
                                <RefreshCw className={isFetching ? 'animate-spin motion-reduce:[animation-duration:6s]' : undefined} /> {tr('common.refresh')}
                            </Button>
                            {/* Always mounted so screen readers pick up the text change */}
                            <span role="status" className="sr-only">
                                {isFetching ? tr('common.loadingData') : ''}
                            </span>
                        </div>
                    </div>
                    {preset === 'custom' && (
                        <div className="flex flex-wrap items-center gap-2">
                            <Label className="gap-2">
                                {tr('overview.from')}{' '}
                                <DateTimeInput
                                    mode="datetime"

                                    className="w-56"
                                    value={custom.from}
                                    onValueChange={(v) => setCustom((c) => ({ ...c, from: v }))}
                                />
                            </Label>
                            <Label className="gap-2">
                                {tr('overview.to')}{' '}
                                <DateTimeInput
                                    mode="datetime"

                                    className="w-56"
                                    value={custom.to}
                                    onValueChange={(v) => setCustom((c) => ({ ...c, to: v }))}
                                />
                            </Label>
                            <Button onClick={() => setRange(rangeFromPreset('custom', custom))}>{tr('overview.viewData')}</Button>
                        </div>
                    )}
                    <p className="text-sm text-muted-foreground">
                        {data
                            ? `${formatDateTime(data.range.from)} — ${formatDateTime(data.range.to)} · ${data.range.interval === 'hour' ? tr('common.hourly') : tr('common.daily')}${
                                  data.summary.totalEvents === 0 ? tr('overview.noDataInThisPeriodYet') : ''
                              }`
                            : tr('common.loadingData2')}
                    </p>
                </CardContent>
            </Card>

            {isLoading ? (
                <OverviewStatsSkeleton />
            ) : error ? (
                <ErrorState error={error} />
            ) : (
                data && (
                    <>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                            {tiles.map((tile) => (
                                <StatTile key={tile.label} {...tile} />
                            ))}
                        </div>
                        <ViewportContent fallback={<ChartsSkeleton />}>
                            <Suspense fallback={<ChartsSkeleton />}>
                                <Charts data={data} />
                            </Suspense>
                        </ViewportContent>
                        <Tables data={data} />
                    </>
                )
            )}
        </>
    );
}
