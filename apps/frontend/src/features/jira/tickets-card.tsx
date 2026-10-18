import type { JiraTicket, JiraTicketStatus } from '@notstack/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, Lock } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { jiraApi, jiraTicketsQuery } from '@/api/jira';
import { guildKey } from '@/api/guilds';
import { useConfirm } from '@/components/confirm-dialog';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorMessage } from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/format';

const PAGE_SIZE = 20;

const FILTERS: { value: 'all' | JiraTicketStatus; label: string }[] = [
    { value: 'all', label: 'ทั้งหมด' },
    { value: 'open', label: 'รอสร้าง card' },
    { value: 'created', label: 'สร้าง card แล้ว' },
    { value: 'closed', label: 'ปิดห้องแล้ว' },
];

function StatusBadge({ status }: { status: JiraTicketStatus }) {
    if (status === 'created') return <Badge className="bg-emerald-500/15 text-emerald-300">สร้าง card แล้ว</Badge>;
    if (status === 'open') return <Badge className="bg-amber-500/15 text-amber-300">รอสร้าง card</Badge>;
    return <Badge variant="secondary">ปิดห้องแล้ว</Badge>;
}

// รายการห้องส่วนตัวที่สมาชิกเปิด + card ที่สร้าง — ปิดห้องที่ค้างอยู่จากหน้านี้ได้
export function JiraTicketsCard({ guildId }: { guildId: string }) {
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const [status, setStatus] = useState<'all' | JiraTicketStatus>('all');
    const [page, setPage] = useState(1);
    const [closing, setClosing] = useState<number | null>(null);
    const { data, isLoading, error } = useQuery(jiraTicketsQuery(guildId, page, status));
    const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

    const close = async (ticket: JiraTicket) => {
        const ok = await confirm({
            title: `ปิดห้องของ ${ticket.userName}?`,
            description: ticket.issueKey
                ? `ห้องใน Discord จะถูกลบ — card ${ticket.issueKey} ใน Jira ยังอยู่ตามเดิม`
                : 'ห้องใน Discord จะถูกลบ — ยังไม่ได้สร้าง card จากห้องนี้',
            confirmText: 'ปิดห้อง',
            destructive: true,
        });
        if (!ok) return;
        setClosing(ticket.id);
        try {
            await jiraApi.closeTicket(guildId, ticket.id);
            await queryClient.invalidateQueries({ queryKey: [...guildKey(guildId), 'jira', 'tickets'] });
            toast.success('ปิดห้องแล้ว');
        } catch (err) {
            toast.error('ปิดห้องไม่สำเร็จ', { description: errorMessage(err) });
        } finally {
            setClosing(null);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>ห้องและ card ล่าสุด</CardTitle>
                <CardDescription>
                    ห้องที่เปิดอยู่ {formatNumber(data?.openCount)} ห้อง · สร้าง card ไปแล้วทั้งหมด {formatNumber(data?.createdCount)} ใบ
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Tabs
                    value={status}
                    onValueChange={(value) => {
                        setStatus(value as typeof status);
                        setPage(1);
                    }}
                >
                    <TabsList className="h-auto flex-wrap">
                        {FILTERS.map((filter) => (
                            <TabsTrigger key={filter.value} value={filter.value}>
                                {filter.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>

                {isLoading ? (
                    <LoadingState />
                ) : error ? (
                    <ErrorState error={error} />
                ) : !data?.items.length ? (
                    <EmptyState>ยังไม่มีรายการ</EmptyState>
                ) : (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>ผู้เปิด</TableHead>
                                    <TableHead>Card</TableHead>
                                    <TableHead>สถานะ</TableHead>
                                    <TableHead>เปิดเมื่อ</TableHead>
                                    <TableHead className="text-right">จัดการ</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.items.map((ticket) => (
                                    <TableRow key={ticket.id}>
                                        <TableCell>
                                            <div className="font-medium">{ticket.userName}</div>
                                            <div className="font-mono text-xs text-muted-foreground">{ticket.userId}</div>
                                        </TableCell>
                                        <TableCell className="max-w-80">
                                            {ticket.issueKey && ticket.issueUrl ? (
                                                <a
                                                    href={ticket.issueUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-1 font-medium text-sky-400 hover:underline"
                                                >
                                                    {ticket.issueKey} <ExternalLink className="size-3" />
                                                </a>
                                            ) : (
                                                <span className="text-muted-foreground">—</span>
                                            )}
                                            {ticket.title && <div className="truncate text-sm">{ticket.title}</div>}
                                            {ticket.issueType && <div className="text-xs text-muted-foreground">{ticket.issueType}</div>}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={ticket.status} />
                                        </TableCell>
                                        <TableCell className="text-sm whitespace-nowrap">{formatDateTime(ticket.createdAt)}</TableCell>
                                        <TableCell className="text-right whitespace-nowrap">
                                            {ticket.status !== 'closed' && ticket.channelId && (
                                                <div className="flex justify-end gap-2">
                                                    <Button variant="outline" size="sm" asChild>
                                                        <a
                                                            href={`https://discord.com/channels/${guildId}/${ticket.channelId}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                        >
                                                            <ExternalLink /> ไปที่ห้อง
                                                        </a>
                                                    </Button>
                                                    <Button variant="outline" size="sm" disabled={closing === ticket.id} onClick={() => void close(ticket)}>
                                                        {closing === ticket.id ? <Loader2 className="animate-spin" /> : <Lock />} ปิดห้อง
                                                    </Button>
                                                </div>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}

                {pages > 1 && (
                    <div className="flex items-center justify-end gap-2 text-sm">
                        <Button variant="outline" size="icon" aria-label="หน้าก่อน" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                            <ChevronLeft />
                        </Button>
                        <span>
                            หน้า {page} / {pages}
                        </span>
                        <Button variant="outline" size="icon" aria-label="หน้าถัดไป" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                            <ChevronRight />
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
