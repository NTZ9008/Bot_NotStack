import { tr } from '../../lib/i18n';
import type { CustomSummaryResponse, PluginId } from '@notstack/shared';
import { Activity, AlertTriangle, GitPullRequest, MessageSquareText, Terminal, Users, Volume2 } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatThaiDuration } from './timezone';

/** แถว KPI Summary Cards ตามโมดูล Core และปลั๊กอินที่ติดตั้งจริง */
export function SummaryKpis({ summary, installedPlugins }: { summary: CustomSummaryResponse; installedPlugins?: PluginId[] }) {
    const enabled = new Set(summary.filters.modules);
    const { voice, messages, server, githubPr, devops, activeUsers, totalEvents } = summary.kpis;
    const pluginSource = installedPlugins ?? summary.installedPlugins;
    const hasPlugin = (id: PluginId) => (pluginSource ? pluginSource.includes(id) : true);
    const prInstalled = hasPlugin('github-pr');
    const grafanaInstalled = hasPlugin('grafana-alert');
    const jiraInstalled = hasPlugin('jira-card');
    const showPrCard = prInstalled && enabled.has('githubPr');
    const showGrafanaCard = grafanaInstalled && enabled.has('devops');
    const showJiraCard = jiraInstalled && enabled.has('devops');
    const visiblePluginCardCount = Number(showPrCard) + Number(showGrafanaCard) + Number(showJiraCard);

    return (
        <div className="space-y-3">
            {/* กลุ่ม Core KPIs */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {/* 1. เวลารวมในห้องเสียง */}
                <Card className={cn('rounded-xl border-border bg-card transition-opacity', !enabled.has('voice') && 'opacity-50')}>
                    <CardContent className="pt-5">
                        <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-medium text-muted-foreground">{tr('customSummary.totalTimeInSelectedVoiceChannels')}</span>
                            <span className="flex size-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-700 dark:text-sky-400">
                                <Volume2 className="size-4" />
                            </span>
                        </div>
                        <div className="mt-2 text-3xl font-bold tracking-tight text-sky-700 dark:text-sky-400">
                            {enabled.has('voice') ? formatThaiDuration(voice.totalSeconds) : tr('customSummary.notSelected')}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {enabled.has('voice') ? (
                                <>
                                    <span>
                                        {tr('common.joins')}{' '}
                                        <strong className="text-emerald-700 dark:text-emerald-400">{voice.joins.toLocaleString('en-US')}</strong>
                                    </span>
                                    <span>
                                        {tr('customSummary.leaves2')}{' '}
                                        <strong className="text-amber-700 dark:text-amber-400">{voice.leaves.toLocaleString('en-US')}</strong>
                                    </span>
                                    <span>
                                        {tr('customSummary.avg2')} {voice.avgSessionMinutes} {tr('customSummary.minSession')}
                                    </span>
                                    {voice.activeAtCutoffCount > 0 && (
                                        <Badge className="border-sky-500/30 bg-sky-500/15 text-[10px] text-sky-700 dark:text-sky-300" variant="outline">
                                            {tr('customSummary.stillInChannel')} {voice.activeAtCutoffCount} {tr('common.people')}
                                        </Badge>
                                    )}
                                </>
                            ) : (
                                <span>{tr('customSummary.voiceModuleHidden')}</span>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* 2. ข้อความในห้องที่เลือก */}
                <Card className={cn('rounded-xl border-border bg-card transition-opacity', !enabled.has('messages') && 'opacity-50')}>
                    <CardContent className="pt-5">
                        <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-medium text-muted-foreground">{tr('customSummary.messagesInSelectedChannels')}</span>
                            <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                                <MessageSquareText className="size-4" />
                            </span>
                        </div>
                        <div className="mt-2 text-3xl font-bold tracking-tight text-foreground">
                            {enabled.has('messages') ? messages.totalSent.toLocaleString('en-US') : tr('customSummary.notSelected')}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {enabled.has('messages') ? (
                                <>
                                    {messages.busiestChannel ? (
                                        <span className="truncate">
                                            {tr('customSummary.busiest')}{' '}
                                            <strong className="text-emerald-700 dark:text-emerald-400">#{messages.busiestChannel.channelName}</strong> (
                                            {messages.busiestChannel.count.toLocaleString('en-US')})
                                        </span>
                                    ) : (
                                        <span>
                                            {tr('common.deleted')} {messages.deleted} {tr('customSummary.edited')} {messages.edited}
                                        </span>
                                    )}
                                </>
                            ) : (
                                <span>{tr('customSummary.messageModuleHidden')}</span>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* 3. สมาชิกเข้า-ออก & คำสั่งระบบ (Core server) */}
                <Card className={cn('rounded-xl border-border bg-card transition-opacity', !enabled.has('server') && 'opacity-50')}>
                    <CardContent className="pt-5">
                        <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-medium text-muted-foreground">{tr('customSummary.serverMembersAndCommands')}</span>
                            <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-700 dark:text-indigo-400">
                                <Terminal className="size-4" />
                            </span>
                        </div>
                        {enabled.has('server') ? (
                            <div className="mt-2 flex items-baseline gap-2.5">
                                <span className="text-3xl font-bold tracking-tight">
                                    <span className="text-emerald-700 dark:text-emerald-400">+{server.memberJoin}</span>
                                    <span className="mx-1 text-muted-foreground">/</span>
                                    <span className="text-red-700 dark:text-red-400">-{server.memberLeave}</span>
                                </span>
                                <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-400">
                                    {tr('customSummary.net')} {server.netMembers >= 0 ? `+${server.netMembers}` : server.netMembers}
                                </span>
                            </div>
                        ) : (
                            <div className="mt-2 text-3xl font-bold tracking-tight text-foreground">{tr('customSummary.notSelected')}</div>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {enabled.has('server') ? (
                                <span>{tr('customSummary.commandsCount', { 0: server.commandsUsed.toLocaleString('en-US') })}</span>
                            ) : (
                                <span>{tr('customSummary.serverModuleHidden')}</span>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* 4. จำนวนผู้ใช้งานที่มีส่วนร่วม */}
                <Card className="rounded-xl border-border bg-card">
                    <CardContent className="pt-5">
                        <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-medium text-muted-foreground">{tr('customSummary.activeParticipants')}</span>
                            <span className="flex size-8 items-center justify-center rounded-lg bg-highlight/15 text-highlight">
                                <Users className="size-4" />
                            </span>
                        </div>
                        <div className="mt-2 text-3xl font-bold tracking-tight text-highlight">{activeUsers.toLocaleString('en-US')}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>
                                {tr('customSummary.totalEvents')} {totalEvents.toLocaleString('en-US')} {tr('customSummary.entries')}
                            </span>
                            <span>
                                {summary.channelBreakdown.length} {tr('customSummary.activeChannels')}
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* กลุ่ม Plugin KPIs — แสดงเฉพาะปลั๊กอินที่ติดตั้งและเปิดใช้งานจริง */}
            {visiblePluginCardCount > 0 && (
                <div
                    className={cn(
                        'grid gap-3',
                        visiblePluginCardCount === 1
                            ? 'grid-cols-1'
                            : visiblePluginCardCount === 2
                              ? 'sm:grid-cols-2'
                              : 'sm:grid-cols-2 xl:grid-cols-3',
                    )}
                >
                    {showPrCard && (
                        <Card className="rounded-xl border-border bg-card">
                            <CardContent className="pt-5">
                                <div className="flex items-start justify-between gap-2">
                                    <span className="text-xs font-medium text-muted-foreground">{tr('customSummary.totalGithubPrsOpenedMergedClosed')}</span>
                                    <span className="flex size-8 items-center justify-center rounded-lg bg-purple-500/15 text-purple-700 dark:text-purple-400">
                                        <GitPullRequest className="size-4" />
                                    </span>
                                </div>
                                <div className="mt-2 flex items-baseline gap-2.5">
                                    <span className="text-3xl font-bold tracking-tight text-foreground">
                                        {githubPr.totalNotifications.toLocaleString('en-US')}
                                    </span>
                                    <span className="text-sm font-semibold text-purple-700 dark:text-purple-400">
                                        Merge {githubPr.mergeRatePercent}%
                                    </span>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                    <span>
                                        {tr('customSummary.openedUpdated')} <strong className="text-highlight">{githubPr.openedOrUpdated}</strong>
                                    </span>
                                    <span>
                                        Merge <strong className="text-purple-700 dark:text-purple-400">{githubPr.merged}</strong>
                                    </span>
                                    <span>
                                        {tr('customSummary.closedPrs')} <strong className="text-amber-700 dark:text-amber-400">{githubPr.closed}</strong>
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {showGrafanaCard && (
                        <Card className="rounded-xl border-border bg-card">
                            <CardContent className="flex items-center justify-between pt-5">
                                <div>
                                    <div className="text-xs font-medium text-muted-foreground">Grafana Alerts</div>
                                    <div className="mt-1 text-2xl font-bold text-sky-700 dark:text-sky-400">
                                        {devops.grafanaSent.toLocaleString('en-US')}
                                    </div>
                                    <div className="mt-1 text-xs text-muted-foreground">
                                        <span className="text-red-700 dark:text-red-400">Firing {devops.grafanaFiring}</span> •{' '}
                                        <span className="text-emerald-700 dark:text-emerald-400">Resolved {devops.grafanaResolved}</span>
                                    </div>
                                </div>
                                <span className="flex size-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-700 dark:text-sky-400">
                                    <AlertTriangle className="size-4" />
                                </span>
                            </CardContent>
                        </Card>
                    )}

                    {showJiraCard && (
                        <Card className="rounded-xl border-border bg-card">
                            <CardContent className="flex items-center justify-between pt-5">
                                <div>
                                    <div className="text-xs font-medium text-muted-foreground">Jira Card & Issues</div>
                                    <div className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-400">
                                        {(devops.jiraCreated + devops.jiraIssueCreated).toLocaleString('en-US')}
                                    </div>
                                    <div className="mt-1 text-xs text-muted-foreground">
                                        {tr('customSummary.cardsOpened')} {devops.jiraCreated} • Issue {devops.jiraIssueCreated}{' '}
                                        {tr('customSummary.closed')} {devops.jiraClosed}
                                    </div>
                                </div>
                                <span className="flex size-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400">
                                    <Activity className="size-4" />
                                </span>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}
        </div>
    );
}
