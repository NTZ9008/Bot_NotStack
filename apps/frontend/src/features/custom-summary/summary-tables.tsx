import type {
    CustomSummaryChannelGroup,
    CustomSummaryChannelRow,
    CustomSummaryContributorRow,
    CustomSummaryLogRow,
    CustomSummaryResponse,
} from '@notstack/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { ChevronDown, ChevronUp, FileSpreadsheet, ListTree, Search, Trophy, Volume2 } from 'lucide-react';
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

const KIND_BADGE: Record<CustomSummaryChannelGroup, { label: string; className: string }> = {
    text: { label: 'ข้อความ', className: 'border-indigo-500/30 bg-indigo-500/15 text-indigo-300' },
    voice: { label: 'ห้องเสียง', className: 'border-sky-500/30 bg-sky-500/15 text-sky-300' },
    devops: { label: 'DevOps', className: 'border-purple-500/30 bg-purple-500/15 text-purple-300' },
};

const SOURCE_BADGE: Record<CustomSummaryLogRow['source'], { label: string; className: string }> = {
    activity: { label: 'Discord', className: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300' },
    pr: { label: 'GitHub PR', className: 'border-purple-500/30 bg-purple-500/15 text-purple-300' },
    grafana: { label: 'Grafana', className: 'border-sky-500/30 bg-sky-500/15 text-sky-300' },
    jira: { label: 'Jira', className: 'border-amber-500/30 bg-amber-500/15 text-amber-300' },
};

/** ตารางสรุปแยกตามห้อง, อันดับผู้ใช้งานสูงสุด และตัวอย่างรายการ Log รายบรรทัด */
export function SummaryTables({ summary }: { summary: CustomSummaryResponse }) {
    const [channelSearch, setChannelSearch] = useState('');
    const [userSearch, setUserSearch] = useState('');
    const [showDetailedPreview, setShowDetailedPreview] = useState(false);

    const channelColumns = useMemo<ColumnDef<CustomSummaryChannelRow>[]>(
        () => [
            {
                accessorKey: 'channelName',
                header: 'ชื่อห้อง',
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <div className="font-medium text-slate-100">#{row.original.channelName}</div>
                        <div className="text-[11px] text-slate-500">{row.original.channelId}</div>
                    </div>
                ),
            },
            {
                accessorKey: 'kind',
                header: 'ประเภท',
                cell: ({ row }) => {
                    const meta = KIND_BADGE[row.original.kind];
                    return (
                        <Badge variant="outline" className={meta.className}>
                            {meta.label}
                        </Badge>
                    );
                },
            },
            {
                accessorKey: 'messages',
                header: 'จำนวนข้อความ',
                cell: ({ row }) => (
                    <span className={row.original.messages > 0 ? 'font-medium text-slate-100 tabular-nums' : 'text-slate-500'}>
                        {row.original.messages > 0 ? row.original.messages.toLocaleString('en-US') : '-'}
                    </span>
                ),
            },
            {
                accessorKey: 'voiceSeconds',
                header: 'เวลาคุยรวม',
                cell: ({ row }) =>
                    row.original.voiceSeconds > 0 ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-sky-400">
                            <Volume2 className="size-3.5 shrink-0" />
                            {formatThaiDuration(row.original.voiceSeconds)}
                        </span>
                    ) : (
                        <span className="text-slate-500">-</span>
                    ),
            },
            {
                id: 'prAndAlerts',
                header: 'PR / Alert / Jira',
                accessorFn: (row) => row.prEvents + row.grafanaAlerts + row.jiraCards + row.otherEvents,
                cell: ({ row }) => {
                    const r = row.original;
                    const total = r.prEvents + r.grafanaAlerts + r.jiraCards + r.otherEvents;
                    if (total === 0) return <span className="text-slate-500">-</span>;
                    return (
                        <div className="flex flex-wrap gap-1.5 text-xs">
                            {r.prEvents > 0 && (
                                <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-purple-300">PR {r.prEvents}</span>
                            )}
                            {r.grafanaAlerts > 0 && (
                                <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-sky-300">Alert {r.grafanaAlerts}</span>
                            )}
                            {r.jiraCards > 0 && (
                                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-300">Jira {r.jiraCards}</span>
                            )}
                            {r.otherEvents > 0 && (
                                <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-slate-300">อื่นๆ {r.otherEvents}</span>
                            )}
                        </div>
                    );
                },
            },
        ],
        [],
    );

    const contributorColumns = useMemo<ColumnDef<CustomSummaryContributorRow>[]>(
        () => [
            {
                id: 'rank',
                header: 'อันดับ',
                enableSorting: false,
                cell: ({ row }) => <RankBadge rank={row.index + 1} />,
            },
            {
                accessorKey: 'userName',
                header: 'ผู้ใช้งาน / User ID',
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium text-slate-100">{row.original.userName}</span>
                            {row.original.isBot && (
                                <Badge variant="outline" className="border-slate-700 bg-slate-800 px-1.5 text-[10px] text-slate-300">
                                    BOT
                                </Badge>
                            )}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">{row.original.userId}</div>
                    </div>
                ),
            },
            {
                accessorKey: 'voiceSeconds',
                header: 'เวลาในห้องเสียงรวม',
                cell: ({ row }) =>
                    row.original.voiceSeconds > 0 ? (
                        <div>
                            <div className="font-medium text-sky-400">{formatThaiDuration(row.original.voiceSeconds)}</div>
                            <div className="text-[11px] text-slate-400">{row.original.voiceSessions} เซสชัน</div>
                        </div>
                    ) : (
                        <span className="text-slate-500">-</span>
                    ),
            },
            {
                accessorKey: 'messages',
                header: 'ข้อความที่ส่ง',
                cell: ({ row }) => (
                    <span className={row.original.messages > 0 ? 'font-medium text-slate-100 tabular-nums' : 'text-slate-500'}>
                        {row.original.messages > 0 ? row.original.messages.toLocaleString('en-US') : '-'}
                    </span>
                ),
            },
            {
                id: 'prJira',
                header: 'กิจกรรม PR / Jira',
                accessorFn: (row) => row.prActivity + row.jiraTickets,
                cell: ({ row }) => {
                    const { prActivity, jiraTickets } = row.original;
                    if (prActivity + jiraTickets === 0) return <span className="text-slate-500">-</span>;
                    return (
                        <div className="flex flex-wrap gap-1.5 text-xs">
                            {prActivity > 0 && (
                                <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-purple-300">{prActivity} PR</span>
                            )}
                            {jiraTickets > 0 && (
                                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-300">{jiraTickets} Jira</span>
                            )}
                        </div>
                    );
                },
            },
        ],
        [],
    );

    const logColumns = useMemo<ColumnDef<CustomSummaryLogRow>[]>(
        () => [
            {
                accessorKey: 'createdAt',
                header: 'เวลา',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap font-mono text-xs text-slate-400">
                        {formatBangkokShortTime(row.original.createdAt)}
                    </span>
                ),
            },
            {
                accessorKey: 'eventLabel',
                header: 'เหตุการณ์',
                cell: ({ row }) => {
                    const badge = SOURCE_BADGE[row.original.source];
                    return (
                        <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className={cn('text-[10px]', badge.className)}>
                                {badge.label}
                            </Badge>
                            <span className="text-xs font-medium text-slate-200">{row.original.eventLabel}</span>
                        </div>
                    );
                },
            },
            {
                accessorKey: 'userName',
                header: 'ผู้กระทำ',
                cell: ({ row }) => (
                    <span className="text-xs text-slate-200">{row.original.userName || row.original.userId || '-'}</span>
                ),
            },
            {
                accessorKey: 'channelName',
                header: 'ห้อง',
                cell: ({ row }) => (
                    <span className="text-xs text-slate-300">
                        {row.original.channelName ? `#${row.original.channelName}` : '-'}
                    </span>
                ),
            },
            {
                accessorKey: 'summary',
                header: 'รายละเอียด',
                cell: ({ row }) => <span className="line-clamp-2 text-xs text-slate-400">{row.original.summary}</span>,
            },
        ],
        [],
    );

    return (
        <div className="space-y-4">
            {/* ตารางที่ 1: สรุปตามห้อง */}
            <Card className="rounded-xl border-[#1e2638] bg-[#111625]">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-base text-slate-100">
                            <FileSpreadsheet className="size-4 text-emerald-400" />
                            ตารางที่ 1: สรุปตามห้อง
                        </CardTitle>
                        <CardDescription className="text-xs text-slate-400">
                            แสดงชื่อห้อง ประเภท จำนวนข้อความ เวลาคุยรวม และกิจกรรม DevOps ในขอบเขตที่เลือก
                        </CardDescription>
                    </div>
                    <div className="relative w-full sm:w-64">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-slate-400" />
                        <Input
                            value={channelSearch}
                            onChange={(e) => setChannelSearch(e.target.value)}
                            placeholder="กรองชื่อห้องในตาราง..."
                            className="h-8 border-[#1e2638] bg-[#0b0e17] pl-8 text-xs text-slate-100"
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    {summary.channelBreakdown.length === 0 ? (
                        <EmptyState>ไม่พบกิจกรรมแยกตามห้องในเงื่อนไขที่เลือก</EmptyState>
                    ) : (
                        <DataTable
                            columns={channelColumns}
                            data={summary.channelBreakdown}
                            globalFilter={channelSearch}
                            className="border-[#1e2638] bg-[#0b0e17]/40"
                            empty="ไม่พบห้องที่ตรงกับคำค้นหา"
                        />
                    )}
                </CardContent>
            </Card>

            {/* ตารางที่ 2: อันดับผู้ใช้งานสูงสุด */}
            <Card className="rounded-xl border-[#1e2638] bg-[#111625]">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-base text-slate-100">
                            <Trophy className="size-4 text-amber-400" />
                            ตารางที่ 2: อันดับผู้ใช้งานสูงสุด
                        </CardTitle>
                        <CardDescription className="text-xs text-slate-400">
                            จัดอันดับตามเวลาในห้องเสียง จำนวนข้อความ และกิจกรรม GitHub PR / Jira ที่เชื่อมโยงกับผู้ใช้
                        </CardDescription>
                    </div>
                    <div className="relative w-full sm:w-64">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-slate-400" />
                        <Input
                            value={userSearch}
                            onChange={(e) => setUserSearch(e.target.value)}
                            placeholder="ค้นหาชื่อผู้ใช้ หรือ User ID..."
                            className="h-8 border-[#1e2638] bg-[#0b0e17] pl-8 text-xs text-slate-100"
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    {summary.topContributors.length === 0 ? (
                        <EmptyState>ไม่พบผู้ใช้งานที่มีกิจกรรมในขอบเขตที่เลือก</EmptyState>
                    ) : (
                        <DataTable
                            columns={contributorColumns}
                            data={summary.topContributors}
                            globalFilter={userSearch}
                            className="border-[#1e2638] bg-[#0b0e17]/40"
                            empty="ไม่พบผู้ใช้งานที่ตรงกับคำค้นหา"
                        />
                    )}
                </CardContent>
            </Card>

            {/* ตารางที่ 3: รายการ Log รายบรรทัด (ย่อ/ขยายได้) */}
            <Card className="rounded-xl border-[#1e2638] bg-[#111625]">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-base text-slate-100">
                            <ListTree className="size-4 text-indigo-400" />
                            รายการ Log รายบรรทัด ({summary.detailedLogs.length} รายการล่าสุด)
                        </CardTitle>
                        <CardDescription className="text-xs text-slate-400">
                            ใช้เป็นข้อมูลท้ายรายงานเมื่อส่งออก PDF แบบ Full Detailed Report
                            {summary.detailedLogsTruncated && ' • แสดงสูงสุด 200 รายการล่าสุด'}
                        </CardDescription>
                    </div>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setShowDetailedPreview((prev) => !prev)}
                        className="border-[#1e2638] bg-[#0b0e17] text-xs text-slate-200 hover:bg-slate-800"
                    >
                        {showDetailedPreview ? (
                            <>
                                <ChevronUp className="mr-1.5 size-3.5" />
                                ซ่อนตารางรายบรรทัด
                            </>
                        ) : (
                            <>
                                <ChevronDown className="mr-1.5 size-3.5" />
                                ดูตัวอย่าง Log รายบรรทัด
                            </>
                        )}
                    </Button>
                </CardHeader>
                {showDetailedPreview && (
                    <CardContent>
                        {summary.detailedLogs.length === 0 ? (
                            <EmptyState>ไม่มีรายการ Log รายบรรทัดในขอบเขตนี้</EmptyState>
                        ) : (
                            <DataTable
                                columns={logColumns}
                                data={summary.detailedLogs}
                                className="border-[#1e2638] bg-[#0b0e17]/40"
                            />
                        )}
                    </CardContent>
                )}
            </Card>
        </div>
    );
}
