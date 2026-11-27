import { tr, byLang } from '../../lib/i18n';
import type {
    CustomSummaryChannelGroup,
    CustomSummaryChannelRow,
    CustomSummaryContributorRow,
    CustomSummaryLogRow,
    CustomSummaryResponse,
    PluginId,
} from '@notstack/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { ChevronDown, ChevronUp, FileSpreadsheet, ListTree, Search, Trophy, Volume2 } from '@/components/icons';
import { useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table';
import { RankBadge } from '@/components/rank-badge';
import { EmptyState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatBangkokShortTime, formatThaiDuration } from './timezone';

const KIND_BADGE = byLang((): Record<CustomSummaryChannelGroup, { label: string; className: string }> => ({
    text: { label: tr('common.messages'), className: 'border-highlight/30 bg-highlight/15 text-highlight' },
    voice: { label: tr('common.voiceChannels'), className: 'border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300' },
    devops: { label: 'DevOps', className: 'border-purple-500/30 bg-purple-500/15 text-purple-700 dark:text-purple-300' },
}));

const SOURCE_BADGE: Record<CustomSummaryLogRow['source'], { label: string; className: string }> = {
    activity: { label: 'Discord', className: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
    pr: { label: 'GitHub PR', className: 'border-purple-500/30 bg-purple-500/15 text-purple-700 dark:text-purple-300' },
    grafana: { label: 'Grafana', className: 'border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300' },
    jira: { label: 'Jira', className: 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300' },
};

/** ตารางสรุปแยกตามห้อง, อันดับผู้ใช้งานสูงสุด และตัวอย่างรายการ Log รายบรรทัด */
export function SummaryTables({ summary, installedPlugins }: { summary: CustomSummaryResponse; installedPlugins?: PluginId[] }) {
    const [channelSearch, setChannelSearch] = useState('');
    const [userSearch, setUserSearch] = useState('');
    const [showDetailedPreview, setShowDetailedPreview] = useState(false);

    const pluginSource = installedPlugins ?? summary.installedPlugins;
    const hasPlugin = (id: PluginId) => (pluginSource ? pluginSource.includes(id) : true);
    const prInstalled = hasPlugin('github-pr');
    const grafanaInstalled = hasPlugin('grafana-alert');
    const jiraInstalled = hasPlugin('jira-card');
    const anyPluginInstalled = prInstalled || grafanaInstalled || jiraInstalled;

    const contributorRows = useMemo(
        () => (prInstalled ? summary.topContributors : summary.topContributors.filter((c) => !c.userId.startsWith('github:'))),
        [summary.topContributors, prInstalled],
    );

    const channelExtraHeader = anyPluginInstalled
        ? [
              ...(prInstalled ? ['PR'] : []),
              ...(grafanaInstalled ? ['Alert'] : []),
              ...(jiraInstalled ? ['Jira'] : []),
              tr('customSummary.other'),
          ].join(' / ')
        : tr('customSummary.otherEventsCol');

    const channelColumns = useMemo<ColumnDef<CustomSummaryChannelRow>[]>(
        () => [
            {
                accessorKey: 'channelName',
                header: tr('customSummary.channel'),
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <div className="font-medium text-foreground">#{row.original.channelName}</div>
                        <div className="text-[11px] text-muted-foreground">{row.original.channelId}</div>
                    </div>
                ),
            },
            {
                accessorKey: 'kind',
                header: tr('common.type'),
                cell: ({ row }) => {
                    const displayKind = !anyPluginInstalled && row.original.kind === 'devops' ? 'text' : row.original.kind;
                    const meta = KIND_BADGE()[displayKind];
                    return (
                        <Badge variant="outline" className={meta.className}>
                            {meta.label}
                        </Badge>
                    );
                },
            },
            {
                accessorKey: 'messages',
                header: tr('customSummary.messages'),
                cell: ({ row }) => (
                    <span className={row.original.messages > 0 ? 'font-medium text-foreground tabular-nums' : 'text-muted-foreground'}>
                        {row.original.messages > 0 ? row.original.messages.toLocaleString('en-US') : '-'}
                    </span>
                ),
            },
            {
                accessorKey: 'voiceSeconds',
                header: tr('customSummary.totalTalkTime'),
                cell: ({ row }) =>
                    row.original.voiceSeconds > 0 ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-sky-700 dark:text-sky-400">
                            <Volume2 className="size-3.5 shrink-0" />
                            {formatThaiDuration(row.original.voiceSeconds)}
                        </span>
                    ) : (
                        <span className="text-muted-foreground">-</span>
                    ),
            },
            {
                id: 'prAndAlerts',
                header: channelExtraHeader,
                accessorFn: (row) =>
                    (prInstalled ? row.prEvents : 0) +
                    (grafanaInstalled ? row.grafanaAlerts : 0) +
                    (jiraInstalled ? row.jiraCards : 0) +
                    row.otherEvents,
                cell: ({ row }) => {
                    const r = row.original;
                    const prCount = prInstalled ? r.prEvents : 0;
                    const grafanaCount = grafanaInstalled ? r.grafanaAlerts : 0;
                    const jiraCount = jiraInstalled ? r.jiraCards : 0;
                    const total = prCount + grafanaCount + jiraCount + r.otherEvents;
                    if (total === 0) return <span className="text-muted-foreground">-</span>;
                    return (
                        <div className="flex flex-wrap gap-1.5 text-xs">
                            {prCount > 0 && (
                                <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-purple-700 dark:text-purple-300">PR {prCount}</span>
                            )}
                            {grafanaCount > 0 && (
                                <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-sky-700 dark:text-sky-300">Alert {grafanaCount}</span>
                            )}
                            {jiraCount > 0 && (
                                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">Jira {jiraCount}</span>
                            )}
                            {r.otherEvents > 0 && (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                                    {tr('customSummary.other')} {r.otherEvents}
                                </span>
                            )}
                        </div>
                    );
                },
            },
        ],
        [anyPluginInstalled, channelExtraHeader, grafanaInstalled, jiraInstalled, prInstalled],
    );

    const contributorColumns = useMemo<ColumnDef<CustomSummaryContributorRow>[]>(
        () => [
            {
                id: 'rank',
                header: tr('common.rank'),
                enableSorting: false,
                cell: ({ row }) => <RankBadge rank={row.index + 1} />,
            },
            {
                accessorKey: 'userName',
                header: tr('customSummary.userUserId'),
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium text-foreground">{row.original.userName}</span>
                            {row.original.isBot && (
                                <Badge variant="outline" className="border-border bg-muted px-1.5 text-[10px] text-muted-foreground">
                                    BOT
                                </Badge>
                            )}
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground">{row.original.userId}</div>
                    </div>
                ),
            },
            {
                accessorKey: 'voiceSeconds',
                header: tr('customSummary.totalVoiceTime'),
                cell: ({ row }) =>
                    row.original.voiceSeconds > 0 ? (
                        <div>
                            <div className="font-medium text-sky-700 dark:text-sky-400">{formatThaiDuration(row.original.voiceSeconds)}</div>
                            <div className="text-[11px] text-muted-foreground">
                                {row.original.voiceSessions} {tr('customSummary.sessions')}
                            </div>
                        </div>
                    ) : (
                        <span className="text-muted-foreground">-</span>
                    ),
            },
            {
                accessorKey: 'messages',
                header: tr('common.messagesSent'),
                cell: ({ row }) => (
                    <span className={row.original.messages > 0 ? 'font-medium text-foreground tabular-nums' : 'text-muted-foreground'}>
                        {row.original.messages > 0 ? row.original.messages.toLocaleString('en-US') : '-'}
                    </span>
                ),
            },
            {
                accessorKey: 'commandsUsed',
                header: tr('common.command'),
                cell: ({ row }) => (
                    <span className={row.original.commandsUsed > 0 ? 'font-medium text-foreground tabular-nums' : 'text-muted-foreground'}>
                        {row.original.commandsUsed > 0 ? row.original.commandsUsed.toLocaleString('en-US') : '-'}
                    </span>
                ),
            },
            ...(prInstalled || jiraInstalled
                ? [
                      {
                          id: 'prJira',
                          header: prInstalled && jiraInstalled ? tr('customSummary.prJiraActivity') : prInstalled ? 'GitHub PR' : 'Jira Card',
                          accessorFn: (row) => (prInstalled ? row.prActivity : 0) + (jiraInstalled ? row.jiraTickets : 0),
                          cell: ({ row }) => {
                              const prActivity = prInstalled ? row.original.prActivity : 0;
                              const jiraTickets = jiraInstalled ? row.original.jiraTickets : 0;
                              if (prActivity + jiraTickets === 0) return <span className="text-muted-foreground">-</span>;
                              return (
                                  <div className="flex flex-wrap gap-1.5 text-xs">
                                      {prActivity > 0 && (
                                          <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-purple-700 dark:text-purple-300">
                                              {prActivity} PR
                                          </span>
                                      )}
                                      {jiraTickets > 0 && (
                                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
                                              {jiraTickets} Jira
                                          </span>
                                      )}
                                  </div>
                              );
                          },
                      } satisfies ColumnDef<CustomSummaryContributorRow>,
                  ]
                : []),
        ],
        [jiraInstalled, prInstalled],
    );

    const logColumns = useMemo<ColumnDef<CustomSummaryLogRow>[]>(
        () => [
            {
                accessorKey: 'createdAt',
                header: tr('common.time'),
                cell: ({ row }) => (
                    <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">{formatBangkokShortTime(row.original.createdAt)}</span>
                ),
            },
            {
                accessorKey: 'eventLabel',
                header: tr('common.event'),
                cell: ({ row }) => {
                    const badge = SOURCE_BADGE[row.original.source];
                    return (
                        <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className={cn('text-[10px]', badge.className)}>
                                {badge.label}
                            </Badge>
                            <span className="text-xs font-medium text-foreground">{row.original.eventLabel}</span>
                        </div>
                    );
                },
            },
            {
                accessorKey: 'userName',
                header: tr('common.actor'),
                cell: ({ row }) => <span className="text-xs text-foreground">{row.original.userName || row.original.userId || '-'}</span>,
            },
            {
                accessorKey: 'channelName',
                header: tr('common.channel'),
                cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.channelName ? `#${row.original.channelName}` : '-'}</span>,
            },
            {
                accessorKey: 'summary',
                header: tr('common.details'),
                cell: ({ row }) => <span className="line-clamp-2 text-xs text-muted-foreground">{row.original.summary}</span>,
            },
        ],
        [],
    );

    return (
        <div className="space-y-4">
            {/* ตารางที่ 1: สรุปตามห้อง */}
            <Card className="rounded-xl border-border bg-card">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-base text-foreground">
                            <FileSpreadsheet className="size-4 text-emerald-700 dark:text-emerald-400" />

                            {tr('customSummary.table1SummaryByChannel')}
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground">
                            {anyPluginInstalled ? tr('customSummary.channelNameTypeMessageCountTotal') : tr('customSummary.channelTableDescCore')}
                        </CardDescription>
                    </div>
                    <div className="relative w-full sm:w-64">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={channelSearch}
                            onChange={(e) => setChannelSearch(e.target.value)}
                            placeholder={tr('customSummary.filterChannelsInTheTable')}
                            className="h-8 border-border bg-background pl-8 text-xs text-foreground"
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    {summary.channelBreakdown.length === 0 ? (
                        <EmptyState>{tr('customSummary.noPerChannelActivityForThe')}</EmptyState>
                    ) : (
                        <DataTable
                            columns={channelColumns}
                            data={summary.channelBreakdown}
                            globalFilter={channelSearch}
                            className="border-border bg-background/40"
                            empty={tr('customSummary.noChannelsMatchYourSearch')}
                        />
                    )}
                </CardContent>
            </Card>

            {/* ตารางที่ 2: อันดับผู้ใช้งานสูงสุด */}
            <Card className="rounded-xl border-border bg-card">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-base text-foreground">
                            <Trophy className="size-4 text-amber-700 dark:text-amber-400" />

                            {tr('customSummary.table2TopUsers')}
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground">
                            {prInstalled || jiraInstalled ? tr('customSummary.rankedByVoiceTimeMessageCount') : tr('customSummary.contributorTableDescCore')}
                        </CardDescription>
                    </div>
                    <div className="relative w-full sm:w-64">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={userSearch}
                            onChange={(e) => setUserSearch(e.target.value)}
                            placeholder={tr('customSummary.searchUsernameOrUserId')}
                            className="h-8 border-border bg-background pl-8 text-xs text-foreground"
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    {contributorRows.length === 0 ? (
                        <EmptyState>{tr('customSummary.noUsersWithActivityInThe')}</EmptyState>
                    ) : (
                        <DataTable
                            columns={contributorColumns}
                            data={contributorRows}
                            globalFilter={userSearch}
                            className="border-border bg-background/40"
                            empty={tr('customSummary.noUsersMatchYourSearch')}
                        />
                    )}
                </CardContent>
            </Card>

            {/* ตารางที่ 3: รายการ Log รายบรรทัด (ย่อ/ขยายได้) */}
            <Card className="rounded-xl border-border bg-card">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-base text-foreground">
                            <ListTree className="size-4 text-highlight" />
                            {tr('customSummary.lineByLineLog')}
                            {summary.detailedLogs.length} {tr('customSummary.mostRecent')}
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground">
                            {tr('customSummary.usedAsTheAppendixWhenExporting')}
                            {summary.detailedLogsTruncated && tr('customSummary.showingUpToTheLatest200')}
                        </CardDescription>
                    </div>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setShowDetailedPreview((prev) => !prev)}
                        className="border-border bg-background text-xs text-foreground hover:bg-muted"
                    >
                        {showDetailedPreview ? (
                            <>
                                <ChevronUp className="mr-1.5 size-3.5" />

                                {tr('customSummary.hideLineByLineTable')}
                            </>
                        ) : (
                            <>
                                <ChevronDown className="mr-1.5 size-3.5" />

                                {tr('customSummary.previewLineByLineLog')}
                            </>
                        )}
                    </Button>
                </CardHeader>
                {showDetailedPreview && (
                    <CardContent>
                        {summary.detailedLogs.length === 0 ? (
                            <EmptyState>{tr('customSummary.noLogEntriesInThisScope')}</EmptyState>
                        ) : (
                            <DataTable columns={logColumns} data={summary.detailedLogs} className="border-border bg-background/40" />
                        )}
                    </CardContent>
                )}
            </Card>
        </div>
    );
}
