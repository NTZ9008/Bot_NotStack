import { tr, byLang } from '../../../../../lib/i18n';
import type { ActivityStats } from '@notstack/shared';
import { DateTimeInput } from '@/components/date-time-input';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Activity, CalendarDays, Clock3, Crown, Headphones, MessageSquare, RefreshCw, TrendingDown, TrendingUp, UserPlus, Users } from '@/components/icons';
import { lazy, Suspense, useMemo, useState } from 'react';
import { ViewportContent } from '@/components/viewport-content';
import { activityStatsQuery, type StatsParams } from '@/api/admin';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { GettingStarted } from '@/components/getting-started';
import { RankBadge } from '@/components/rank-badge';
import { OverviewStatsSkeleton } from '@/components/skeleton/guild-pages';
import { ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { formatDateTime, formatMinutes, formatNumber, shortBucketLabel, toLocalInput } from '@/lib/format';
import { KpiStrip, PillTabs, RankList, ReportCard, type Kpi } from '@/components/report';
import { useGuildId } from '@/hooks/use-guild';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/overview')({
    loader: ({ context, params }) => context.queryClient.ensureQueryData(activityStatsQuery(params.guildId, { includeBots: false })),
    component: OverviewPage,
});

const Charts = lazy(() => import('@/features/overview/charts'));
function ChartsSkeleton() {
    return <div role="status" className="h-72 animate-pulse rounded-xl bg-muted/50" aria-label={tr('overview.loadingChart')} />;
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

type TopUser = ActivityStats['topUsers'][number] & { rank: number };

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

// ไฮไลต์: ประโยคสั้นๆ ที่ไม่ซ้ำกับโพเดียม/รายการด้านล่าง (สมาชิกเพิ่ม-ลด + ช่วงที่คึกคักที่สุด)
function highlights(data: ActivityStats): { icon: typeof Crown; text: string; tone?: 'up' | 'down' }[] {
    const { summary } = data;
    const net = summary.serverJoin - summary.serverLeave;
    const list: { icon: typeof Crown; text: string; tone?: 'up' | 'down' }[] = [
        net > 0
            ? { icon: TrendingUp, text: tr('report.hlGrow', { count: formatNumber(net) }), tone: 'up' }
            : net < 0
              ? { icon: TrendingDown, text: tr('report.hlShrink', { count: formatNumber(-net) }), tone: 'down' }
              : { icon: Users, text: tr('report.hlSteady') },
    ];
    const totals = data.datasets.total;
    const peak = totals.reduce((best, v, i) => (v > (totals[best] ?? 0) ? i : best), 0);
    if ((totals[peak] ?? 0) > 0)
        list.push({
            icon: Clock3,
            text: tr('report.hlBusiest', { label: shortBucketLabel(data.labels[peak] ?? '', data.range.interval), count: formatNumber(totals[peak] ?? 0) }),
        });
    return list;
}

// แท่นรางวัล 3 อันดับแรก (เรียง 2-1-3 แบบโพเดียมจริง) — แท่นค่อยๆ ยกขึ้นทีละแท่น แล้วรูปโผล่ตาม
const PODIUM = [
    { place: 2, height: 'h-20', delay: 120, tone: 'from-[oklch(0.75_0.03_270)] to-[oklch(0.6_0.04_270)]' },
    { place: 1, height: 'h-28', delay: 240, tone: 'from-primary to-[#1c2fd6]' },
    { place: 3, height: 'h-14', delay: 0, tone: 'from-[oklch(0.72_0.1_55)] to-[oklch(0.58_0.11_45)]' },
] as const;

function Podium({ users }: { users: ActivityStats['topUsers'] }) {
    if (users.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">{tr('overview.noDataInThisPeriodYet2')}</p>;
    return (
        <ol className="grid grid-cols-3 items-end gap-2 pt-6">
            {PODIUM.map(({ place, height, delay, tone }) => {
                const user = users[place - 1];
                return (
                    <li key={place} className="group/podium flex flex-col items-center text-center" aria-label={tr('report.rank', { rank: place })}>
                        {user && (
                            <div className="dash-pop mb-2 flex w-full flex-col items-center gap-1" style={{ animationDelay: `${delay + 350}ms` }}>
                                <span className="relative">
                                    {place === 1 && (
                                        <Crown className="absolute -top-5 left-1/2 size-5 -translate-x-1/2 fill-amber-400 text-amber-500 drop-shadow transition-transform duration-500 ease-spring group-hover/podium:-translate-y-0.5" />
                                    )}
                                    <span
                                        className={cn(
                                            'grid place-items-center overflow-hidden rounded-full bg-gradient-to-br font-bold text-white uppercase shadow-lg ring-4 ring-card transition-transform duration-500 ease-spring group-hover/podium:-translate-y-0.5',
                                            tone,
                                            place === 1 ? 'size-14 text-lg' : 'size-11 text-base',
                                        )}
                                    >
                                        {user.avatarUrl ? (
                                            <img src={user.avatarUrl} alt="" width={56} height={56} loading="lazy" className="size-full rounded-full object-cover" />
                                        ) : (
                                            user.userName.slice(0, 1)
                                        )}
                                    </span>
                                </span>
                                <span className="w-full truncate text-sm font-semibold">{user.userName}</span>
                                <span className="text-xs text-muted-foreground tabular-nums">
                                    {tr('report.timesCount', { count: formatNumber(user.total) })}
                                </span>
                            </div>
                        )}
                        {/* แท่น: ตัวเลขอันดับตัวโตแบบเส้นขอบ (สไตล์เดียวกับลายน้ำพื้นหลัง) */}
                        <div
                            className={cn(
                                'dash-rise relative grid w-full place-items-center overflow-hidden rounded-t-2xl bg-gradient-to-b shadow-[inset_0_1px_0_oklch(1_0_0/30%)] transition-[filter,transform] duration-500 ease-spring group-hover/podium:-translate-y-1 group-hover/podium:brightness-110',
                                height,
                                tone,
                            )}
                            style={{ animationDelay: `${delay}ms` }}
                        >
                            <span className="text-4xl font-black text-white/90 [-webkit-text-stroke:1px_oklch(1_0_0/40%)]">{place}</span>
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}

function Report({ data }: { data: ActivityStats }) {
    const { summary } = data;
    const net = summary.serverJoin - summary.serverLeave;
    const empty = tr('overview.noDataInThisPeriodYet2');
    const minutesByChannel = new Map(data.voiceChannelMinutes.map((row) => [row.channelId, row.minutes]));
    const kpis: Kpi[] = [
        {
            label: tr('report.activeUsers'),
            value: formatNumber(summary.activeUsers),
            unit: tr('common.people'),
            icon: Users,
            hint: tr('report.activeUsersHint'),
            foot: `${tr('overview.allEvents')} ${formatNumber(summary.totalEvents)}`,
        },
        {
            label: tr('report.messages'),
            value: formatNumber(summary.messages),
            icon: MessageSquare,
            hint: tr('report.messagesHint'),
            foot: tr('report.perPerson', { count: formatNumber(summary.activeUsers ? Math.round(summary.messages / summary.activeUsers) : 0) }),
        },
        {
            label: tr('report.voiceTime'),
            value: formatMinutes(summary.voiceMinutes),
            icon: Headphones,
            hint: tr('report.voiceHint'),
            foot: tr('report.voiceJoinsCount', { count: formatNumber(summary.voiceJoin) }),
        },
        {
            label: tr('report.memberChange'),
            value: `${net > 0 ? '+' : ''}${formatNumber(net)}`,
            unit: tr('common.people'),
            icon: UserPlus,
            tone: net > 0 ? 'up' : net < 0 ? 'down' : undefined,
            hint: tr('report.memberChangeHint'),
            foot: tr('report.joinLeave', { join: formatNumber(summary.serverJoin), leave: formatNumber(summary.serverLeave) }),
        },
    ];
    return (
        <>
            <section aria-label={tr('report.summary')}>
                <KpiStrip items={kpis} />
            </section>

            {/* ไฮไลต์เป็นชิปสั้นๆ แถวเดียว — สมาชิกเพิ่ม/ลด + ช่วงที่คึกคักที่สุด */}
            <ul aria-label={tr('report.highlights')} className="flex flex-wrap gap-2">
                {highlights(data).map((item) => (
                    <li
                        key={item.text}
                        className="group/hl flex items-center gap-2 rounded-full bg-card py-1.5 pr-4 pl-1.5 text-sm shadow-soft ring-1 ring-border transition-transform duration-500 ease-spring hover:-translate-y-0.5"
                    >
                        <span
                            className={cn(
                                'grid size-7 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground transition-transform duration-500 ease-spring group-hover/hl:scale-105',
                                item.tone === 'up' && 'bg-success/15 text-success',
                                item.tone === 'down' && 'bg-destructive/15 text-destructive',
                            )}
                        >
                            <item.icon className="size-4" />
                        </span>
                        <span className="font-medium">{item.text}</span>
                    </li>
                ))}
            </ul>

            <div className="grid gap-6 lg:grid-cols-3">
                <ReportCard className="lg:col-span-2" title={tr('report.trend')}>
                    <ViewportContent fallback={<ChartsSkeleton />}>
                        <Suspense fallback={<ChartsSkeleton />}>
                            <Charts data={data} part="trend" />
                        </Suspense>
                    </ViewportContent>
                </ReportCard>
                <ReportCard title={tr('report.podium')}>
                    <Podium users={data.topUsers} />
                    {data.topUsers.length > 3 && (
                        <div className="mt-4 border-t pt-3">
                            <RankList
                                empty={empty}
                                rows={data.topUsers.slice(3, 5).map((u, i) => ({
                                    key: u.userId,
                                    name: u.userName,
                                    value: u.total,
                                    display: formatNumber(u.total),
                                    lead: (
                                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold text-muted-foreground tabular-nums">
                                            {i + 4}
                                        </span>
                                    ),
                                }))}
                            />
                        </div>
                    )}
                </ReportCard>
            </div>

            <h2 className="flex items-center gap-2 pt-2 text-lg font-semibold">
                <Activity className="size-5 text-ink" /> {tr('report.deepDive')}
            </h2>
            <div className="grid gap-6 lg:grid-cols-3">
                <ReportCard title={tr('report.topVoiceUsers')}>
                    <RankList
                        empty={empty}
                        rows={data.topVoiceUsers.slice(0, 6).map((u) => ({
                            key: u.userId,
                            name: u.userName,
                            value: u.minutes,
                            display: formatMinutes(u.minutes),
                            sub: tr('report.sessions', { count: formatNumber(u.sessions) }),
                        }))}
                    />
                </ReportCard>
                <ReportCard title={tr('report.topVoiceChannels')}>
                    <RankList
                        empty={empty}
                        rows={data.topVoiceChannels.slice(0, 6).map((c) => ({
                            key: c.channelId,
                            name: c.channelName,
                            value: c.joins,
                            display: tr('report.timesCount', { count: formatNumber(c.joins) }),
                            sub: `${tr('report.membersCount', { count: formatNumber(c.members) })} · ${formatMinutes(minutesByChannel.get(c.channelId) ?? 0)}`,
                        }))}
                    />
                </ReportCard>
                <ReportCard title={tr('report.eventShare')}>
                    <ViewportContent fallback={<ChartsSkeleton />}>
                        <Suspense fallback={<ChartsSkeleton />}>
                            <Charts data={data} part="share" />
                        </Suspense>
                    </ViewportContent>
                </ReportCard>
            </div>

            <ReportCard title={tr('report.allActiveUsers')}>
                <DataTable
                    label={tr('report.allActiveUsers')}
                    columns={topUserColumns()}
                    data={data.topUsers.map((u, i) => ({ ...u, rank: i + 1 }))}
                    empty={empty}
                />
            </ReportCard>
        </>
    );
}

function OverviewPage() {
    const guildId = useGuildId();
    const queryClient = useQueryClient();
    const [preset, setPreset] = useState('168');
    const [includeBots, setIncludeBots] = useState(false);
    const [custom, setCustom] = useState({ from: toLocalInput(new Date(Date.now() - 7 * 86400000)), to: toLocalInput(new Date()) });
    // ช่วงเวลาที่ใช้ดึงข้อมูลจริง (คำนวณใหม่เมื่อเลือกช่วง / กดรีเฟรช / กดดูข้อมูล)
    // The API defaults to the last seven days. Keep its cache key stable on remount.
    const [range, setRange] = useState<Pick<StatsParams, 'from' | 'to' | 'hours'>>({});

    const params = useMemo<StatsParams>(
        // ความละเอียด (รายชั่วโมง/รายวัน) ให้ API เลือกเองตามช่วงเวลา
        () => ({ ...range, includeBots }),
        [range, includeBots],
    );
    const { data, isLoading, isFetching, error } = useQuery({ ...activityStatsQuery(guildId, params), placeholderData: keepPreviousData });

    const refresh = () => {
        const nextRange = rangeFromPreset(preset, custom);
        setRange(nextRange);
        // Bypass both freshness layers on an explicit refresh, including identical custom dates.
        void queryClient
            .fetchQuery({
                ...activityStatsQuery(guildId, { ...nextRange, includeBots }, true),
                staleTime: 0,
            })
            .catch(() => undefined);
    };
    return (
        <>
            <PageHeader help="overview" title={tr('common.serverOverview')} />
            <GettingStarted />
            <Card>
                <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <PillTabs
                            label={tr('relations.timeRange')}
                            value={preset}
                            options={PRESETS()}
                            onChange={(value) => {
                                setPreset(value);
                                // "กำหนดเอง" รอให้ผู้ใช้กด "ดูข้อมูล" เอง
                                if (value !== 'custom') setRange(rangeFromPreset(value, custom));
                            }}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                            <Label className="flex h-9 items-center gap-2 rounded-full border px-3">
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
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <CalendarDays className="size-4 shrink-0" />
                        {data
                            ? `${formatDateTime(data.range.from)} — ${formatDateTime(data.range.to)} · ${data.range.interval === 'hour' ? tr('common.hourly') : tr('common.daily')}${
                                  data.summary.totalEvents === 0 ? tr('overview.noDataInThisPeriodYet') : ''
                              }`
                            : tr('common.loadingData2')}
                    </p>
                </CardContent>
            </Card>

            {isLoading ? <OverviewStatsSkeleton /> : error ? <ErrorState error={error} /> : data && <Report data={data} />}
        </>
    );
}
