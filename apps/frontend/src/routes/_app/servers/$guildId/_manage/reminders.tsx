import { useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import {
    parseDailyCron,
    parseWeeklyCron,
    type CreateReminderInput,
    type ScheduledReminderItem,
    type UpdateReminderInput,
} from '@notstack/shared';
import { toast } from 'sonner';
import { guildChannelsQuery, guildRolesQuery } from '@/api/guilds';
import { remindersListQuery, useReminderMutations } from '@/api/reminders';
import { channelLabel } from '@/components/channel-select';
import { useConfirm } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { AlertTriangle, BellRing, CalendarClock, Loader2, Pencil, Plus, RefreshCw, Send, Trash2 } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { PluginRouteGuard } from '@/components/plugin-gate';
import { SearchInput } from '@/components/search-input';
import { PrBotBodySkeleton } from '@/components/skeleton/guild-pages';
import { EmptyState, ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ReminderDialog } from '@/features/reminders/reminder-dialog';
import { useGuildId } from '@/hooks/use-guild';
import { errorMessage } from '@/lib/api';
import { formatDateTime, formatTimeAgo } from '@/lib/format';
import { tr, useT } from '@/lib/i18n';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/reminders')({
    loader: ({ context, params }) => {
        if (!context.guild.installedPlugins?.includes('scheduled-reminders')) return;
        return Promise.all([
            context.queryClient.ensureQueryData(remindersListQuery(params.guildId)),
            context.queryClient.ensureQueryData(guildChannelsQuery(params.guildId)).catch(() => undefined),
            context.queryClient.ensureQueryData(guildRolesQuery(params.guildId)).catch(() => undefined),
        ]);
    },
    component: RemindersPage,
});

function RemindersPage() {
    return (
        <PluginRouteGuard
            pluginId="scheduled-reminders"
            help="reminders"
            title={tr('common.scheduledReminders')}
            description={tr('common.scheduleMessagesAndEmbedsToDiscord')}
        >
            {() => <RemindersPageContent />}
        </PluginRouteGuard>
    );
}

function RemindersPageContent() {
    const t = useT();
    const guildId = useGuildId();
    const confirm = useConfirm();

    const { data, isLoading, isFetching, error, refetch } = useQuery(remindersListQuery(guildId));
    const { data: channels = [] } = useQuery(guildChannelsQuery(guildId));
    const { data: roles = [] } = useQuery(guildRolesQuery(guildId));
    const { create, update, remove, testSend } = useReminderMutations(guildId);

    const [search, setSearch] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingReminder, setEditingReminder] = useState<ScheduledReminderItem | null>(null);
    const [testingId, setTestingId] = useState<number | null>(null);

    const reminders = useMemo(() => data?.reminders ?? [], [data?.reminders]);
    const roleMap = useMemo(() => new Map(roles.map((r) => [r.id, r.name])), [roles]);

    const dayLabel = (day: number) => {
        switch (day) {
            case 0:
                return t('reminders.day0');
            case 1:
                return t('reminders.day1');
            case 2:
                return t('reminders.day2');
            case 3:
                return t('reminders.day3');
            case 4:
                return t('reminders.day4');
            case 5:
                return t('reminders.day5');
            default:
                return t('reminders.day6');
        }
    };

    const describeSchedule = (item: ScheduledReminderItem): { badge: string; detail: string } => {
        if (item.scheduleType === 'ONCE') {
            return {
                badge: t('reminders.scheduleOnce'),
                detail: item.runAt ? t('reminders.scheduleOnceAt', { 0: formatDateTime(item.runAt) }) : '—',
            };
        }
        if (item.scheduleType === 'DAILY') {
            const hhmm = parseDailyCron(item.cronExpression);
            return {
                badge: t('reminders.scheduleDaily'),
                detail: hhmm ? t('reminders.scheduleDailyAt', { 0: hhmm }) : (item.cronExpression ?? '—'),
            };
        }
        if (item.scheduleType === 'WEEKLY') {
            const parsed = parseWeeklyCron(item.cronExpression);
            return {
                badge: t('reminders.scheduleWeekly'),
                detail: parsed
                    ? t('reminders.scheduleWeeklyAt', { 0: parsed.days.map(dayLabel).join(', '), 1: parsed.time })
                    : (item.cronExpression ?? '—'),
            };
        }
        return {
            badge: t('reminders.scheduleCron'),
            detail: item.cronExpression ?? '—',
        };
    };

    const openCreate = () => {
        setEditingReminder(null);
        setDialogOpen(true);
    };

    const openEdit = (item: ScheduledReminderItem) => {
        setEditingReminder(item);
        setDialogOpen(true);
    };

    const handleSubmitDialog = async (payload: CreateReminderInput | UpdateReminderInput) => {
        try {
            if (editingReminder) {
                await update.mutateAsync({ id: editingReminder.id, body: payload });
                toast.success(t('reminders.reminderUpdatedToast'));
            } else {
                await create.mutateAsync(payload as CreateReminderInput);
                toast.success(t('reminders.reminderCreatedToast'));
            }
            setDialogOpen(false);
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };

    const handleDelete = async (item: ScheduledReminderItem) => {
        const ok = await confirm({
            title: t('reminders.confirmDeleteTitle', { 0: item.title }),
            description: t('reminders.confirmDeleteDesc', { 0: item.title }),
            confirmText: t('common.delete'),
            destructive: true,
        });
        if (!ok) return;
        try {
            await remove.mutateAsync(item.id);
            toast.success(t('reminders.deletedToast'));
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };

    const handleTestSend = async (item: ScheduledReminderItem) => {
        setTestingId(item.id);
        try {
            await testSend.mutateAsync(item.id);
            toast.success(t('reminders.testSentToast', { 0: item.title }));
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setTestingId(null);
        }
    };

    const handleToggleEnabled = async (item: ScheduledReminderItem, nextEnabled: boolean) => {
        try {
            await update.mutateAsync({ id: item.id, body: { enabled: nextEnabled } });
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };

    const columns: ColumnDef<ScheduledReminderItem>[] = [
        {
            accessorKey: 'title',
            header: t('reminders.colTitle'),
            cell: ({ row }) => {
                const item = row.original;
                return (
                    <div className="min-w-44 space-y-1">
                        <div className="font-medium text-foreground">{item.title}</div>
                        <p className="line-clamp-1 max-w-xs text-xs text-muted-foreground">{item.message}</p>
                        {item.lastError && (
                            <div className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] text-destructive">
                                <AlertTriangle className="size-3 shrink-0" />
                                <span className="line-clamp-1 max-w-60">{t('reminders.lastErrorPrefix', { 0: item.lastError })}</span>
                            </div>
                        )}
                    </div>
                );
            },
        },
        {
            accessorKey: 'useEmbed',
            header: t('reminders.colFormat'),
            cell: ({ row }) =>
                row.original.useEmbed ? (
                    <Badge variant="outline" className="gap-1.5 text-[11px]">
                        <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: row.original.embedColor ?? '#5865f2' }}
                        />
                        {t('reminders.formatEmbed')}
                    </Badge>
                ) : (
                    <Badge variant="secondary" className="text-[11px]">
                        {t('reminders.formatText')}
                    </Badge>
                ),
        },
        {
            accessorKey: 'scheduleType',
            header: t('reminders.colSchedule'),
            cell: ({ row }) => {
                const info = describeSchedule(row.original);
                return (
                    <div className="space-y-0.5 text-xs">
                        <Badge variant="secondary" className="text-[10px]">
                            {info.badge}
                        </Badge>
                        <div className="font-mono text-[11px] text-muted-foreground">{info.detail}</div>
                    </div>
                );
            },
        },
        {
            id: 'channel',
            header: t('reminders.colChannel'),
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
            accessorKey: 'nextRunAt',
            header: t('reminders.colNextRun'),
            cell: ({ row }) => (
                <div className="text-xs tabular-nums">
                    <div className="font-medium text-foreground">
                        {row.original.nextRunAt ? formatDateTime(row.original.nextRunAt) : t('reminders.noNextRun')}
                    </div>
                    {row.original.lastRunAt && (
                        <div className="text-[11px] text-muted-foreground">
                            {t('reminders.lastRunAgo', { 0: formatTimeAgo(row.original.lastRunAt) })}
                        </div>
                    )}
                </div>
            ),
        },
        {
            accessorKey: 'enabled',
            header: t('reminders.colEnabled'),
            cell: ({ row }) => (
                <Switch
                    checked={row.original.enabled}
                    onCheckedChange={(checked) => void handleToggleEnabled(row.original, checked)}
                    aria-label={row.original.title}
                />
            ),
        },
        {
            id: 'actions',
            header: '',
            enableSorting: false,
            cell: ({ row }) => {
                const item = row.original;
                const isTesting = testingId === item.id;
                return (
                    <div className="flex items-center justify-end gap-1">
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            title={t('reminders.testSend')}
                            aria-label={t('reminders.testSend')}
                            disabled={isTesting}
                            onClick={() => void handleTestSend(item)}
                        >
                            {isTesting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                        </Button>
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            title={t('reminders.editReminder')}
                            aria-label={t('reminders.editReminder')}
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
                help="reminders"
                title={t('common.scheduledReminders')}
                description={t('common.scheduleMessagesAndEmbedsToDiscord')}
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
                            {t('reminders.addReminder')}
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
                                    <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                                        <span>{t('reminders.totalReminders')}</span>
                                        <CalendarClock className="size-3.5 text-teal-500" />
                                    </div>
                                    <div className="mt-1 text-2xl font-bold tabular-nums">{summary.total}</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-4">
                                    <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                                        <span>{t('reminders.enabledReminders')}</span>
                                        <BellRing className="size-3.5 text-emerald-500" />
                                    </div>
                                    <div className="mt-1 text-2xl font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                                        {summary.enabled}
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-4">
                                    <div className="text-xs font-medium text-muted-foreground">{t('reminders.recurringCount')}</div>
                                    <div className="mt-1 text-2xl font-bold tabular-nums">{summary.recurring}</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-4">
                                    <div className="text-xs font-medium text-muted-foreground">{t('reminders.oncePending')}</div>
                                    <div className="mt-1 text-2xl font-bold tabular-nums">{summary.oncePending}</div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {reminders.length === 0 ? (
                        <EmptyState className="py-12">
                            <p className="text-sm font-medium text-foreground">{t('reminders.emptyTitle')}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{t('reminders.emptyDesc')}</p>
                            <Button type="button" size="sm" onClick={openCreate} className="mt-4 gap-1.5">
                                <Plus className="size-4" />
                                {t('reminders.addReminder')}
                            </Button>
                        </EmptyState>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <SearchInput
                                    value={search}
                                    onChange={setSearch}
                                    placeholder={t('reminders.searchPlaceholder')}
                                    className="w-full sm:w-72"
                                />
                            </div>
                            <DataTable
                                label={t('common.scheduledReminders')}
                                columns={columns}
                                data={reminders}
                                globalFilter={search}
                            />
                        </>
                    )}
                </div>
            )}

            <ReminderDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                reminder={editingReminder}
                channels={channels}
                roles={roles}
                busy={create.isPending || update.isPending}
                onSubmit={handleSubmitDialog}
            />
        </>
    );
}
