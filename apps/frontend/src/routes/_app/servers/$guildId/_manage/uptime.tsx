import { useMemo, useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import type { CreateUptimeTargetInput, UpdateUptimeTargetInput, UptimeTargetSummary } from '@notstack/shared';
import { toast } from 'sonner';
import { guildChannelsQuery, guildRolesQuery } from '@/api/guilds';
import { uptimeOverviewQuery, useUptimeMutations } from '@/api/uptime';
import { channelLabel } from '@/components/channel-select';
import { useConfirm } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { Activity, BarChart3, CheckCircle2, Clock, ExternalLink, Pencil, Play, Plus, RefreshCw, Trash2, XCircle } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { PluginRouteGuard } from '@/components/plugin-gate';
import { SearchInput } from '@/components/search-input';
import { PrBotBodySkeleton } from '@/components/skeleton/guild-pages';
import { EmptyState, ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { LatencyChartCard } from '@/features/uptime/latency-chart-card';
import { UptimeTargetDialog } from '@/features/uptime/target-dialog';
import { useGuildId } from '@/hooks/use-guild';
import { errorMessage } from '@/lib/api';
import { formatTimeAgo } from '@/lib/format';
import { tr, useT } from '@/lib/i18n';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/uptime')({
    loader: ({ context, params }) => {
        if (!context.guild.installedPlugins?.includes('uptime-monitor')) return;
        return Promise.all([
            context.queryClient.ensureQueryData(uptimeOverviewQuery(params.guildId)),
            context.queryClient.ensureQueryData(guildChannelsQuery(params.guildId)).catch(() => undefined),
            context.queryClient.ensureQueryData(guildRolesQuery(params.guildId)).catch(() => undefined),
        ]);
    },
    component: UptimePage,
});

function UptimePage() {
    return (
        <PluginRouteGuard pluginId="uptime-monitor" help="uptime" title={tr('common.uptimeMonitor')} description={tr('common.monitorHttpUrlsAndSendDiscord')}>
            {() => <UptimePageContent />}
        </PluginRouteGuard>
    );
}

function StatusBadge({ target }: { target: UptimeTargetSummary }) {
    const t = useT();
    if (target.lastStatus === 'UP') {
        return (
            <Badge className="gap-1 border border-success/30 bg-success/12 text-success hover:bg-success/15">
                <CheckCircle2 className="size-3" />
                {t('uptime.statusUp')}
                {target.lastStatusCode ? ` (${target.lastStatusCode})` : ''}
            </Badge>
        );
    }
    if (target.lastStatus === 'DOWN') {
        return (
            <Badge className="gap-1 border border-destructive/30 bg-destructive/12 text-destructive hover:bg-destructive/15">
                <XCircle className="size-3" />
                {t('uptime.statusDown')}
                {target.lastStatusCode ? ` (${target.lastStatusCode})` : ''}
            </Badge>
        );
    }
    return (
        <Badge variant="secondary" className="gap-1 text-muted-foreground">
            <Clock className="size-3" />
            {t('uptime.statusUnknown')}
        </Badge>
    );
}

function UptimePageContent() {
    const t = useT();
    const guildId = useGuildId();
    const confirm = useConfirm();

    const { data, isLoading, isFetching, error, refetch } = useQuery(uptimeOverviewQuery(guildId));
    const { data: channels = [] } = useQuery(guildChannelsQuery(guildId));
    const { data: roles = [] } = useQuery(guildRolesQuery(guildId));
    const { create, update, remove, checkNow } = useUptimeMutations(guildId);

    const [search, setSearch] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingTarget, setEditingTarget] = useState<UptimeTargetSummary | null>(null);
    const [selectedTargetId, setSelectedTargetId] = useState<number | null>(null);
    const [checkingId, setCheckingId] = useState<number | null>(null);

    const targets = useMemo(() => data?.targets ?? [], [data?.targets]);
    const roleMap = useMemo(() => new Map(roles.map((r) => [r.id, r.name])), [roles]);

    const openCreate = () => {
        setEditingTarget(null);
        setDialogOpen(true);
    };

    const openEdit = (target: UptimeTargetSummary) => {
        setEditingTarget(target);
        setDialogOpen(true);
    };

    const handleSubmitDialog = async (payload: CreateUptimeTargetInput | UpdateUptimeTargetInput) => {
        try {
            if (editingTarget) {
                await update.mutateAsync({ id: editingTarget.id, body: payload });
                toast.success(t('uptime.targetUpdatedToast'));
            } else {
                const created = await create.mutateAsync(payload as CreateUptimeTargetInput);
                setSelectedTargetId(created.id);
                toast.success(t('uptime.targetCreatedToast'));
            }
            setDialogOpen(false);
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };

    const handleDelete = async (target: UptimeTargetSummary) => {
        const ok = await confirm({
            title: t('uptime.confirmDeleteTitle', { 0: target.name }),
            description: t('uptime.confirmDeleteDesc', { 0: target.url }),
            confirmText: t('common.delete'),
            destructive: true,
        });
        if (!ok) return;
        try {
            await remove.mutateAsync(target.id);
            toast.success(t('uptime.targetDeletedToast'));
            if (selectedTargetId === target.id) setSelectedTargetId(null);
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };

    const handleCheckNow = async (target: UptimeTargetSummary) => {
        setCheckingId(target.id);
        try {
            await checkNow.mutateAsync(target.id);
            setSelectedTargetId(target.id);
            toast.success(t('uptime.checkCompletedToast', { 0: target.name }));
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setCheckingId(null);
        }
    };

    const handleToggleEnabled = async (target: UptimeTargetSummary, nextEnabled: boolean) => {
        try {
            await update.mutateAsync({ id: target.id, body: { enabled: nextEnabled } });
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };

    const columns: ColumnDef<UptimeTargetSummary>[] = [
        {
            accessorKey: 'lastStatus',
            header: t('uptime.colStatus'),
            cell: ({ row }) => <StatusBadge target={row.original} />,
        },
        {
            accessorKey: 'name',
            header: t('uptime.colTarget'),
            cell: ({ row }) => (
                <div className="min-w-44">
                    <div className="font-medium text-foreground">{row.original.name}</div>
                    <a
                        href={row.original.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex max-w-xs items-center gap-1 truncate text-xs text-muted-foreground hover:text-primary"
                    >
                        <span className="truncate">{row.original.url}</span>
                        <ExternalLink className="size-3 shrink-0" />
                    </a>
                </div>
            ),
        },
        {
            accessorKey: 'intervalMinutes',
            header: t('uptime.colInterval'),
            cell: ({ row }) => <span className="text-xs whitespace-nowrap">{t('uptime.everyMinutes', { 0: row.original.intervalMinutes })}</span>,
        },
        {
            accessorKey: 'lastLatencyMs',
            header: t('uptime.colLatency'),
            cell: ({ row }) => (
                <div className="text-xs tabular-nums">
                    <div className="font-medium text-foreground">{row.original.lastLatencyMs !== null ? `${row.original.lastLatencyMs} ms` : '—'}</div>
                    {row.original.lastCheckedAt && <div className="text-[11px] text-muted-foreground">{formatTimeAgo(row.original.lastCheckedAt)}</div>}
                </div>
            ),
        },
        {
            accessorKey: 'uptime24hPercent',
            header: t('uptime.uptime24h'),
            cell: ({ row }) => (
                <div className="text-xs tabular-nums">
                    <div className="font-semibold text-foreground">{row.original.uptime24hPercent !== null ? `${row.original.uptime24hPercent}%` : '—'}</div>
                    <div className="text-[11px] text-muted-foreground">
                        {row.original.up24hCount}/{row.original.checks24hCount}
                    </div>
                </div>
            ),
        },
        {
            id: 'channel',
            header: t('uptime.alertChannel'),
            cell: ({ row }) => {
                const roleName = row.original.mentionRoleId ? (roleMap.get(row.original.mentionRoleId) ?? row.original.mentionRoleId) : null;
                return (
                    <div className="space-y-0.5 text-xs">
                        <div className="text-foreground">{channelLabel(channels, row.original.channelId) ?? row.original.channelId}</div>
                        {roleName && (
                            <Badge variant="outline" className="text-[10px]">
                                @{roleName}
                            </Badge>
                        )}
                    </div>
                );
            },
        },
        {
            accessorKey: 'enabled',
            header: t('uptime.colEnabled'),
            cell: ({ row }) => (
                <Switch
                    checked={row.original.enabled}
                    onCheckedChange={(checked) => void handleToggleEnabled(row.original, checked)}
                    aria-label={row.original.name}
                />
            ),
        },
        {
            id: 'actions',
            header: () => <span className="sr-only">{t('common.actions')}</span>,
            enableSorting: false,
            cell: ({ row }) => {
                const item = row.original;
                const isChecking = checkingId === item.id;
                return (
                    <div className="flex items-center justify-end gap-1">
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            title={t('uptime.checkNow')}
                            aria-label={t('uptime.checkNow')}
                            disabled={isChecking}
                            onClick={() => void handleCheckNow(item)}
                        >
                            {isChecking ? <Spinner className="size-4" /> : <Play className="size-4" />}
                        </Button>
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            title={t('uptime.viewChart')}
                            aria-label={t('uptime.viewChart')}
                            onClick={() => setSelectedTargetId(item.id)}
                        >
                            <BarChart3 className="size-4" />
                        </Button>
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            title={t('uptime.editTarget')}
                            aria-label={t('uptime.editTarget')}
                            onClick={() => openEdit(item)}
                        >
                            <Pencil className="size-4" />
                        </Button>
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            title={t('common.delete')}
                            aria-label={t('common.delete')}
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => void handleDelete(item)}
                        >
                            <Trash2 className="size-4" />
                        </Button>
                    </div>
                );
            },
        },
    ];

    const summary = data?.summary;

    return (
        <>
            <PageHeader
                help="uptime"
                title={t('common.uptimeMonitor')}
                description={t('common.monitorHttpUrlsAndSendDiscord')}
                actions={
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={t('common.refresh')}
                            disabled={isFetching}
                            onClick={() => void refetch()}
                        >
                            <RefreshCw className={isFetching ? 'size-4 animate-spin' : 'size-4'} />
                        </Button>
                        <Button type="button" onClick={openCreate} className="gap-1.5">
                            <Plus className="size-4" />
                            {t('uptime.addTarget')}
                        </Button>
                    </div>
                }
            />

            {isLoading ? (
                <PrBotBodySkeleton />
            ) : error ? (
                <ErrorState error={error} />
            ) : (
                <div className="space-y-5">
                    {summary && (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <Card>
                                <CardContent className="pt-4">
                                    <div className="text-xs font-medium text-muted-foreground">{t('uptime.totalTargets')}</div>
                                    <div className="mt-1 text-2xl font-bold tabular-nums">
                                        {summary.totalTargets}
                                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                            ({summary.enabledTargets} {t('uptime.active')})
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-4">
                                    <div className="text-xs font-medium text-muted-foreground">{t('uptime.statusUp')}</div>
                                    <div className="mt-1 text-2xl font-bold text-success tabular-nums">{summary.upCount}</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-4">
                                    <div className="text-xs font-medium text-muted-foreground">{t('uptime.statusDown')}</div>
                                    <div className="mt-1 text-2xl font-bold text-destructive tabular-nums">{summary.downCount}</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-4">
                                    <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                                        <span>{t('uptime.overallUptime24h')}</span>
                                        <Activity className="size-3.5 text-destructive" />
                                    </div>
                                    <div className="mt-1 text-2xl font-bold tabular-nums">
                                        {summary.overallUptime24hPercent !== null ? `${summary.overallUptime24hPercent}%` : '—'}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {targets.length === 0 ? (
                        <EmptyState className="py-12">
                            <p className="text-sm font-medium text-foreground">{t('uptime.emptyTitle')}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{t('uptime.emptyDesc')}</p>
                            <Button type="button" size="sm" onClick={openCreate} className="mt-4 gap-1.5">
                                <Plus className="size-4" />
                                {t('uptime.addTarget')}
                            </Button>
                        </EmptyState>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <SearchInput value={search} onChange={setSearch} placeholder={t('uptime.searchPlaceholder')} className="w-full sm:w-72" />
                            </div>
                            <DataTable label={t('common.uptimeMonitor')} columns={columns} data={targets} globalFilter={search} />
                            <LatencyChartCard guildId={guildId} targets={targets} selectedTargetId={selectedTargetId} onSelectTarget={setSelectedTargetId} />
                        </>
                    )}
                </div>
            )}

            <UptimeTargetDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                target={editingTarget}
                channels={channels}
                roles={roles}
                busy={create.isPending || update.isPending}
                onSubmit={handleSubmitDialog}
            />
        </>
    );
}
