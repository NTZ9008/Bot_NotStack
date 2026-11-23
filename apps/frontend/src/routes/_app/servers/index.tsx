import { tr } from '../../../lib/i18n';
import type { GuildSummary } from '@notstack/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { AlertTriangle, ArrowRight, Bot, Headphones, LayoutGrid, MessageSquare, Plus, RefreshCw, ShieldCheck, Trophy, Users } from '@/components/icons';
import { activityStatsQuery } from '@/api/admin';
import { KpiStrip, Sparkline, spotlight } from '@/components/report';
import { guildsQuery } from '@/api/guilds';
import { DiscordIcon } from '@/components/discord-icon';
import { LiveGlobe } from '@/features/live/live-globe';
import { GuildIcon } from '@/components/guild-icon';
import { PageHeader } from '@/components/page-header';
import { GuildListSkeleton } from '@/components/skeleton/app-pages';
import { ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { apiUrl } from '@/lib/api';
import { formatMinutes, formatNumber } from '@/lib/format';

// ?denied=true → เพิ่งถูกพากลับมาเพราะไม่มีสิทธิ์ในเซิร์ฟเวอร์ที่เปิด
export const Route = createFileRoute('/_app/servers/')({
    loader: ({ context }) => context.queryClient.ensureQueryData(guildsQuery),
    validateSearch: (search: Record<string, unknown>): { denied?: boolean } => (search.denied === true || search.denied === 'true' ? { denied: true } : {}),
    component: ServersPage,
});

// ตัวเลขกิจกรรม 7 วันของเซิร์ฟเวอร์ที่จัดการได้ (ใช้ cache เดียวกับหน้าภาพรวม)
function GuildActivity({ guildId }: { guildId: string }) {
    const { data, isLoading } = useQuery(activityStatsQuery(guildId, { includeBots: false }));
    if (isLoading) return <div className="h-[4.5rem] animate-pulse rounded-xl bg-muted/60" />;
    if (!data) return null;
    const stats = [
        { icon: Users, label: tr('report.activeUsers'), value: formatNumber(data.summary.activeUsers) },
        { icon: MessageSquare, label: tr('report.messages'), value: formatNumber(data.summary.messages) },
        { icon: Headphones, label: tr('report.voiceTime'), value: formatMinutes(data.summary.voiceMinutes) },
    ];
    return (
        <div className="rounded-xl bg-muted/50 p-3">
            <div className="flex items-end gap-3">
                <dl className="grid flex-1 grid-cols-3 gap-2">
                    {stats.map((stat) => (
                        <div key={stat.label} className="min-w-0">
                            <dt className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                                <stat.icon className="size-3 shrink-0" /> {stat.label}
                            </dt>
                            <dd className="truncate text-base font-bold tabular-nums">{stat.value}</dd>
                        </div>
                    ))}
                </dl>
                <Sparkline values={data.datasets.total} label={tr('report.activity7d')} className="w-24 shrink-0" />
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">{tr('report.last7Days')}</p>
        </div>
    );
}

function GuildCard({ guild }: { guild: GuildSummary }) {
    const manage = guild.access === 'manage';
    return (
        <article
            onPointerMove={spotlight}
            className="dash-spot group flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-soft ring-1 ring-border transition-[transform,box-shadow] duration-700 ease-spring-soft hover:-translate-y-1 hover:ring-primary/40"
        >
            <div className="flex items-center gap-3.5">
                <GuildIcon guild={guild} className="size-12 text-base" />
                <div className="min-w-0 flex-1 space-y-1">
                    <h3 className="truncate font-semibold">{guild.name}</h3>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {guild.memberCount > 0 && (
                            <span className="inline-flex items-center gap-1">
                                <Users className="size-3" /> {formatNumber(guild.memberCount)} {tr('common.people')}
                            </span>
                        )}
                        {guild.isHome && <Badge variant="secondary">{tr('servers.homeServer')}</Badge>}
                        {manage ? (
                            <Badge className="bg-success/15 text-success">
                                <ShieldCheck /> {tr('common.canManage')}
                            </Badge>
                        ) : (
                            <Badge variant="outline">{tr('common.viewRankingsOnly')}</Badge>
                        )}
                    </div>
                </div>
            </div>
            {manage && <GuildActivity guildId={guild.id} />}
            <div className="mt-auto flex flex-wrap gap-2">
                {manage && (
                    <Button asChild size="sm">
                        <Link to="/servers/$guildId/overview" params={{ guildId: guild.id }}>
                            {tr('report.openOverview')} <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                        </Link>
                    </Button>
                )}
                <Button asChild size="sm" variant={manage ? 'outline' : 'default'}>
                    <Link to="/servers/$guildId/levels" params={{ guildId: guild.id }}>
                        <Trophy /> {tr('report.openLevels')}
                    </Link>
                </Button>
            </div>
        </article>
    );
}

// ==========================================
// 🏰 เลือกเซิร์ฟเวอร์ — เซิร์ฟเวอร์ที่บอทอยู่และผู้ใช้เข้าถึงได้ + ปุ่มเชิญบอทเข้าเซิร์ฟเวอร์ของตัวเอง
// ==========================================
function ServersPage() {
    const { denied } = Route.useSearch();
    const { discordEnabled } = useAuth();
    const { data, isLoading, error, refetch, isFetching } = useQuery(guildsQuery);

    return (
        <>
            <PageHeader
                help="servers"
                title={tr('servers.yourServers')}
                actions={
                    <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
                        <RefreshCw className={isFetching ? 'animate-spin' : undefined} /> {tr('common.refresh')}
                    </Button>
                }
            />

            {denied && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" />
                    <p>{tr('servers.youDontHaveAccessToThat')}</p>
                </div>
            )}

            {data?.needsDiscordLink && (
                <Card>
                    <CardHeader>
                        <CardTitle>{tr('servers.connectYourDiscordAccountFirst')}</CardTitle>
                        <CardDescription>{tr('servers.yourDiscordAccountIsUsedTo')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {discordEnabled ? (
                            <Button asChild className="bg-[#5865F2] text-white hover:bg-[#4752C4]">
                                <a href={apiUrl('/auth/discord/link')}>
                                    <DiscordIcon /> {tr('common.connectDiscordAccount')}
                                </a>
                            </Button>
                        ) : (
                            <p className="text-sm text-muted-foreground">{tr('common.theSystemAdminHasntSetUp')}</p>
                        )}
                    </CardContent>
                </Card>
            )}

            {data && !data.botOnline && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" />
                    <p>{tr('servers.theBotIsntOnlineYetThe')}</p>
                </div>
            )}

            {data && (
                <KpiStrip
                    items={[
                        { label: tr('report.servers'), value: formatNumber(data.guilds.length), icon: LayoutGrid, hint: tr('report.serversHint') },
                        {
                            label: tr('report.totalMembers'),
                            value: formatNumber(data.guilds.reduce((sum, guild) => sum + guild.memberCount, 0)),
                            unit: tr('common.people'),
                            icon: Users,
                            hint: tr('report.totalMembersHint'),
                        },
                        {
                            label: tr('report.manageable'),
                            value: formatNumber(data.guilds.filter((guild) => guild.access === 'manage').length),
                            icon: ShieldCheck,
                            hint: tr('report.manageableHint'),
                        },
                        {
                            label: tr('report.botStatus'),
                            value: data.botOnline ? tr('report.botOnline') : tr('report.botOffline'),
                            icon: Bot,
                            tone: data.botOnline ? 'up' : 'down',
                            hint: tr('report.botStatusHint'),
                        },
                    ]}
                />
            )}

            <h2 className="pt-1 text-lg font-semibold">{tr('report.yourServers')}</h2>
            {isLoading ? (
                <GuildListSkeleton />
            ) : error ? (
                <ErrorState error={error} />
            ) : (
                <div className="grid gap-4 md:grid-cols-2">
                    {data?.guilds.map((guild) => (
                        <GuildCard key={guild.id} guild={guild} />
                    ))}

                    {/* เชิญบอทเข้าเซิร์ฟเวอร์ใหม่ — Discord ให้เลือกได้เฉพาะเซิร์ฟเวอร์ที่ผู้ใช้มีสิทธิ์ Manage Server */}
                    <div className="flex flex-wrap items-center gap-4 rounded-2xl border-2 border-dashed p-5 transition-colors hover:border-primary/40">
                        <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                            <Plus className="size-6" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                            <p className="font-semibold">{tr('servers.addTheBotToYourServer')}</p>
                        </div>
                        {data?.inviteUrl ? (
                            <Button asChild className="bg-[#5865F2] text-white hover:bg-[#4752C4]">
                                <a href={data.inviteUrl} target="_blank" rel="noopener noreferrer">
                                    <DiscordIcon /> {tr('servers.inviteBot')}
                                </a>
                            </Button>
                        ) : (
                            <Button disabled title={tr('servers.botIsntOnlineYet')}>
                                <DiscordIcon /> {tr('servers.inviteBot')}
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {data && data.guilds.length === 0 && !data.needsDiscordLink && (
                <p className="text-center text-sm text-muted-foreground">{tr('servers.noServersYouCanAccessYet')}</p>
            )}

            {/* กิจกรรมสดของทุกเซิร์ฟเวอร์ที่จัดการได้ (สิทธิ์ดูอย่างเดียวไม่เห็นกิจกรรม เหมือนหน้า Activity Log) */}
            {data?.botOnline && data.guilds.some((guild) => guild.access === 'manage') && <LiveGlobe />}
        </>
    );
}
