import { tr } from '../../lib/i18n';
import type { CustomSummaryResponse } from '@notstack/shared';
import { Activity, AlertTriangle, GitPullRequest, MessageSquareText, Terminal, Users, Volume2 } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatThaiDuration } from './timezone';

/** แถว KPI Summary Cards ตามโมดูลที่ผู้ดูแลเลือก */
export function SummaryKpis({ summary }: { summary: CustomSummaryResponse }) {
    const enabled = new Set(summary.filters.modules);
    const { voice, messages, githubPr, devopsOther, activeUsers, totalEvents } = summary.kpis;

    return (
        <div className="space-y-3">
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

                {/* 3. GitHub PR รวม (เปิด / Merge / ปิด) */}
                <Card className={cn('rounded-xl border-border bg-card transition-opacity', !enabled.has('githubPr') && 'opacity-50')}>
                    <CardContent className="pt-5">
                        <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-medium text-muted-foreground">{tr('customSummary.totalGithubPrsOpenedMergedClosed')}</span>
                            <span className="flex size-8 items-center justify-center rounded-lg bg-purple-500/15 text-purple-700 dark:text-purple-400">
                                <GitPullRequest className="size-4" />
                            </span>
                        </div>
                        <div className="mt-2 flex items-baseline gap-2.5">
                            <span className="text-3xl font-bold tracking-tight text-foreground">
                                {enabled.has('githubPr') ? githubPr.totalNotifications.toLocaleString('en-US') : tr('customSummary.notSelected')}
                            </span>
                            {enabled.has('githubPr') && (
                                <span className="text-sm font-semibold text-purple-700 dark:text-purple-400">Merge {githubPr.mergeRatePercent}%</span>
                            )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {enabled.has('githubPr') ? (
                                <>
                                    <span>
                                        {tr('customSummary.openedUpdated')} <strong className="text-highlight">{githubPr.openedOrUpdated}</strong>
                                    </span>
                                    <span>
                                        Merge <strong className="text-purple-700 dark:text-purple-400">{githubPr.merged}</strong>
                                    </span>
                                    <span>
                                        {tr('customSummary.closedPrs')} <strong className="text-amber-700 dark:text-amber-400">{githubPr.closed}</strong>
                                    </span>
                                </>
                            ) : (
                                <span>{tr('customSummary.githubPrModuleHidden')}</span>
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

            {/* แถบสถิติย่อย DevOps & สมาชิกเซิร์ฟเวอร์ (แสดงเมื่อเลือก devopsOther) */}
            {enabled.has('devopsOther') && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
                        <div>
                            <div className="text-[11px] font-medium text-muted-foreground">Grafana Alerts</div>
                            <div className="mt-0.5 text-lg font-bold text-sky-700 dark:text-sky-400">{devopsOther.grafanaSent.toLocaleString('en-US')}</div>
                            <div className="text-[11px] text-muted-foreground">
                                <span className="text-red-700 dark:text-red-400">Firing {devopsOther.grafanaFiring}</span> •{' '}
                                <span className="text-emerald-700 dark:text-emerald-400">Resolved {devopsOther.grafanaResolved}</span>
                            </div>
                        </div>
                        <AlertTriangle className="size-5 text-sky-700/70 dark:text-sky-400/70" />
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
                        <div>
                            <div className="text-[11px] font-medium text-muted-foreground">Jira Card & Issues</div>
                            <div className="mt-0.5 text-lg font-bold text-amber-700 dark:text-amber-400">
                                {(devopsOther.jiraCreated + devopsOther.jiraIssueCreated).toLocaleString('en-US')}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                                {tr('customSummary.cardsOpened')} {devopsOther.jiraCreated} • Issue {devopsOther.jiraIssueCreated} {tr('customSummary.closed')}{' '}
                                {devopsOther.jiraClosed}
                            </div>
                        </div>
                        <Activity className="size-5 text-amber-700/70 dark:text-amber-400/70" />
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
                        <div>
                            <div className="text-[11px] font-medium text-muted-foreground">{tr('customSummary.membersJoiningLeaving')}</div>
                            <div className="mt-0.5 flex items-baseline gap-2 text-lg font-bold">
                                <span className="text-emerald-700 dark:text-emerald-400">+{devopsOther.memberJoin}</span>
                                <span className="text-muted-foreground">/</span>
                                <span className="text-red-700 dark:text-red-400">-{devopsOther.memberLeave}</span>
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                                {tr('customSummary.net')} {devopsOther.netMembers >= 0 ? `+${devopsOther.netMembers}` : devopsOther.netMembers}{' '}
                                {tr('common.people')}
                            </div>
                        </div>
                        <Users className="size-5 text-emerald-700/70 dark:text-emerald-400/70" />
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
                        <div>
                            <div className="text-[11px] font-medium text-muted-foreground">{tr('customSummary.botCommandsUsed')}</div>
                            <div className="mt-0.5 text-lg font-bold text-highlight">{devopsOther.commandsUsed.toLocaleString('en-US')}</div>
                            <div className="text-[11px] text-muted-foreground">{tr('customSummary.slashCommandsInTheFilteredScope')}</div>
                        </div>
                        <Terminal className="size-5 text-highlight/70" />
                    </div>
                </div>
            )}
        </div>
    );
}
