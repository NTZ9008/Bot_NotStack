import { tr, byLang } from '../../lib/i18n';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Spinner } from '@/components/ui/spinner';
import type { JiraTicket, JiraTicketStatus } from '@notstack/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Lock } from '@/components/icons';
import { PAGE_SIZE, Pagination } from '@/components/pagination';
import { useState } from 'react';
import { toast } from 'sonner';
import { jiraApi, jiraTicketsQuery } from '@/api/jira';
import { guildKey } from '@/api/guilds';
import { useConfirm } from '@/components/confirm-dialog';
import { JiraTicketsBodySkeleton } from '@/components/skeleton/editor-pages';
import { EmptyState, ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { errorMessage } from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/format';

const FILTERS = byLang((): { value: 'all' | JiraTicketStatus; label: string }[] => [
    { value: 'all', label: tr('common.total') },
    { value: 'open', label: tr('jira.waitingForCard') },
    { value: 'created', label: tr('jira.cardCreated') },
    { value: 'closed', label: tr('jira.channelClosed') },
]);

function StatusBadge({ status }: { status: JiraTicketStatus }) {
    if (status === 'created') return <Badge variant="success">{tr('jira.cardCreated')}</Badge>;
    if (status === 'open') return <Badge variant="warning">{tr('jira.waitingForCard')}</Badge>;
    return <Badge variant="secondary">{tr('jira.channelClosed')}</Badge>;
}

// รายการห้องส่วนตัวที่สมาชิกเปิด + card ที่สร้าง — ปิดห้องที่ค้างอยู่จากหน้านี้ได้
export function JiraTicketsCard({ guildId }: { guildId: string }) {
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const [status, setStatus] = useState<'all' | JiraTicketStatus>('all');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(PAGE_SIZE);
    const [closing, setClosing] = useState<number | null>(null);
    const { data, isLoading, error } = useQuery(jiraTicketsQuery(guildId, page, status, pageSize));
    const pages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));

    const close = async (ticket: JiraTicket) => {
        const ok = await confirm({
            title: tr('jira.closeSChannel', { 0: ticket.userName }),
            description: ticket.issueKey ? tr('jira.theDiscordChannelWillBeDeleted', { 0: ticket.issueKey }) : tr('jira.theDiscordChannelWillBeDeleted2'),
            confirmText: tr('jira.closeChannel'),
            destructive: true,
        });
        if (!ok) return;
        setClosing(ticket.id);
        try {
            await jiraApi.closeTicket(guildId, ticket.id);
            await queryClient.invalidateQueries({ queryKey: [...guildKey(guildId), 'jira', 'tickets'] });
            toast.success(tr('jira.channelClosed'));
        } catch (err) {
            toast.error(tr('jira.failedToCloseChannel'), { description: errorMessage(err) });
        } finally {
            setClosing(null);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>{tr('jira.recentChannelsAndCards')}</CardTitle>
                <CardDescription>
                    {tr('jira.openChannels')} {formatNumber(data?.openCount)} {tr('jira.channelsCardsCreatedInTotal')} {formatNumber(data?.createdCount)}{' '}
                    {tr('jira.cards')}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <ToggleGroup
                    type="single"
                    variant="outline"
                    className="flex-wrap"
                    aria-label={tr('common.status')}
                    value={status}
                    onValueChange={(value) => {
                        if (!value) return;
                        setStatus(value as typeof status);
                        setPage(1);
                    }}
                >
                    {FILTERS().map((filter) => (
                        <ToggleGroupItem key={filter.value} value={filter.value}>
                            {filter.label}
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>

                {isLoading ? (
                    <JiraTicketsBodySkeleton />
                ) : error ? (
                    <ErrorState error={error} />
                ) : !data?.items.length ? (
                    <EmptyState>{tr('jira.noEntriesYet')}</EmptyState>
                ) : (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{tr('jira.openedBy')}</TableHead>
                                    <TableHead>Card</TableHead>
                                    <TableHead>{tr('common.status')}</TableHead>
                                    <TableHead>{tr('jira.openedAt')}</TableHead>
                                    <TableHead className="text-right">{tr('common.actions')}</TableHead>
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
                                                    className="inline-flex items-center gap-1 font-medium text-info hover:underline"
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
                                                            <ExternalLink /> {tr('jira.goToChannel')}
                                                        </a>
                                                    </Button>
                                                    <Button variant="outline" size="sm" disabled={closing === ticket.id} onClick={() => void close(ticket)}>
                                                        {closing === ticket.id ? <Spinner /> : <Lock />} {tr('jira.closeChannel')}
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

                <Pagination
                    page={page}
                    pageCount={pages}
                    total={data?.total}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={(size) => {
                        setPageSize(size);
                        setPage(1);
                    }}
                />
            </CardContent>
        </Card>
    );
}
