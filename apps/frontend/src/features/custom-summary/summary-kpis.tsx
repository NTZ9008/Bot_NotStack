import type { CustomSummaryResponse } from '@notstack/shared';
import { Activity, AlertTriangle, GitPullRequest, MessageSquareText, Terminal, Users, Volume2 } from 'lucide-react';
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
                <Card
                    className={cn(
                        'rounded-xl border-[#1e2638] bg-[#111625] transition-opacity',
                        !enabled.has('voice') && 'opacity-50',
                    )}
                >
                    <CardContent className="pt-5">
                        <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-medium text-slate-400">เวลารวมในห้องเสียงที่เลือก</span>
                            <span className="flex size-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
                                <Volume2 className="size-4" />
                            </span>
                        </div>
                        <div className="mt-2 text-3xl font-bold tracking-tight text-sky-400">
                            {enabled.has('voice') ? formatThaiDuration(voice.totalSeconds) : 'ไม่ได้เลือก'}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                            {enabled.has('voice') ? (
                                <>
                                    <span>
                                        เข้า <strong className="text-emerald-400">{voice.joins.toLocaleString('en-US')}</strong>
                                    </span>
                                    <span>
                                        ออก <strong className="text-amber-400">{voice.leaves.toLocaleString('en-US')}</strong>
                                    </span>
                                    <span>เฉลี่ย {voice.avgSessionMinutes} นาที/ครั้ง</span>
                                    {voice.activeAtCutoffCount > 0 && (
                                        <Badge className="border-sky-500/30 bg-sky-500/15 text-[10px] text-sky-300" variant="outline">
                                            ยังอยู่ในห้อง {voice.activeAtCutoffCount} คน
                                        </Badge>
                                    )}
                                </>
                            ) : (
                                <span>ปิดการแสดงผลโมดูลห้องเสียง</span>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* 2. ข้อความในห้องที่เลือก */}
                <Card
                    className={cn(
                        'rounded-xl border-[#1e2638] bg-[#111625] transition-opacity',
                        !enabled.has('messages') && 'opacity-50',
                    )}
                >
                    <CardContent className="pt-5">
                        <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-medium text-slate-400">ข้อความในห้องที่เลือก</span>
                            <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                                <MessageSquareText className="size-4" />
                            </span>
                        </div>
                        <div className="mt-2 text-3xl font-bold tracking-tight text-white">
                            {enabled.has('messages') ? messages.totalSent.toLocaleString('en-US') : 'ไม่ได้เลือก'}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                            {enabled.has('messages') ? (
                                <>
                                    {messages.busiestChannel ? (
                                        <span className="truncate">
                                            คึกคักสุด <strong className="text-emerald-400">#{messages.busiestChannel.channelName}</strong> (
                                            {messages.busiestChannel.count.toLocaleString('en-US')})
                                        </span>
                                    ) : (
                                        <span>ลบ {messages.deleted} • แก้ไข {messages.edited}</span>
                                    )}
                                </>
                            ) : (
                                <span>ปิดการแสดงผลโมดูลข้อความ</span>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* 3. GitHub PR รวม (เปิด / Merge / ปิด) */}
                <Card
                    className={cn(
                        'rounded-xl border-[#1e2638] bg-[#111625] transition-opacity',
                        !enabled.has('githubPr') && 'opacity-50',
                    )}
                >
                    <CardContent className="pt-5">
                        <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-medium text-slate-400">GitHub PR รวม (เปิด / Merge / ปิด)</span>
                            <span className="flex size-8 items-center justify-center rounded-lg bg-purple-500/15 text-purple-400">
                                <GitPullRequest className="size-4" />
                            </span>
                        </div>
                        <div className="mt-2 flex items-baseline gap-2.5">
                            <span className="text-3xl font-bold tracking-tight text-slate-100">
                                {enabled.has('githubPr') ? githubPr.totalNotifications.toLocaleString('en-US') : 'ไม่ได้เลือก'}
                            </span>
                            {enabled.has('githubPr') && (
                                <span className="text-sm font-semibold text-purple-400">
                                    Merge {githubPr.mergeRatePercent}%
                                </span>
                            )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                            {enabled.has('githubPr') ? (
                                <>
                                    <span>
                                        เปิด/อัปเดต <strong className="text-indigo-400">{githubPr.openedOrUpdated}</strong>
                                    </span>
                                    <span>
                                        Merge <strong className="text-purple-400">{githubPr.merged}</strong>
                                    </span>
                                    <span>
                                        ปิด PR <strong className="text-amber-400">{githubPr.closed}</strong>
                                    </span>
                                </>
                            ) : (
                                <span>ปิดการแสดงผลโมดูล GitHub PR</span>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* 4. จำนวนผู้ใช้งานที่มีส่วนร่วม */}
                <Card className="rounded-xl border-[#1e2638] bg-[#111625]">
                    <CardContent className="pt-5">
                        <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-medium text-slate-400">จำนวนผู้ใช้งานที่มีส่วนร่วม</span>
                            <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
                                <Users className="size-4" />
                            </span>
                        </div>
                        <div className="mt-2 text-3xl font-bold tracking-tight text-indigo-400">
                            {activeUsers.toLocaleString('en-US')}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                            <span>เหตุการณ์รวม {totalEvents.toLocaleString('en-US')} รายการ</span>
                            <span>{summary.channelBreakdown.length} ห้องที่มีกิจกรรม</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* แถบสถิติย่อย DevOps & สมาชิกเซิร์ฟเวอร์ (แสดงเมื่อเลือก devopsOther) */}
            {enabled.has('devopsOther') && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="flex items-center justify-between rounded-xl border border-[#1e2638] bg-[#111625] px-4 py-3">
                        <div>
                            <div className="text-[11px] font-medium text-slate-400">Grafana Alerts</div>
                            <div className="mt-0.5 text-lg font-bold text-sky-400">
                                {devopsOther.grafanaSent.toLocaleString('en-US')}
                            </div>
                            <div className="text-[11px] text-slate-400">
                                <span className="text-red-400">Firing {devopsOther.grafanaFiring}</span> •{' '}
                                <span className="text-emerald-400">Resolved {devopsOther.grafanaResolved}</span>
                            </div>
                        </div>
                        <AlertTriangle className="size-5 text-sky-400/70" />
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-[#1e2638] bg-[#111625] px-4 py-3">
                        <div>
                            <div className="text-[11px] font-medium text-slate-400">Jira Card & Issues</div>
                            <div className="mt-0.5 text-lg font-bold text-amber-400">
                                {(devopsOther.jiraCreated + devopsOther.jiraIssueCreated).toLocaleString('en-US')}
                            </div>
                            <div className="text-[11px] text-slate-400">
                                เปิด Card {devopsOther.jiraCreated} • Issue {devopsOther.jiraIssueCreated} • ปิด {devopsOther.jiraClosed}
                            </div>
                        </div>
                        <Activity className="size-5 text-amber-400/70" />
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-[#1e2638] bg-[#111625] px-4 py-3">
                        <div>
                            <div className="text-[11px] font-medium text-slate-400">สมาชิกเข้า / ออกเซิร์ฟเวอร์</div>
                            <div className="mt-0.5 flex items-baseline gap-2 text-lg font-bold">
                                <span className="text-emerald-400">+{devopsOther.memberJoin}</span>
                                <span className="text-slate-500">/</span>
                                <span className="text-red-400">-{devopsOther.memberLeave}</span>
                            </div>
                            <div className="text-[11px] text-slate-400">
                                สุทธิ {devopsOther.netMembers >= 0 ? `+${devopsOther.netMembers}` : devopsOther.netMembers} คน
                            </div>
                        </div>
                        <Users className="size-5 text-emerald-400/70" />
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-[#1e2638] bg-[#111625] px-4 py-3">
                        <div>
                            <div className="text-[11px] font-medium text-slate-400">คำสั่งบอทที่ใช้งาน</div>
                            <div className="mt-0.5 text-lg font-bold text-indigo-400">
                                {devopsOther.commandsUsed.toLocaleString('en-US')}
                            </div>
                            <div className="text-[11px] text-slate-400">Slash Commands ในขอบเขตที่กรอง</div>
                        </div>
                        <Terminal className="size-5 text-indigo-400/70" />
                    </div>
                </div>
            )}
        </div>
    );
}
