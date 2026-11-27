import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { TICKET_LIMITS, formatTicketNumber, type TicketItemDto, type TicketStatus } from '@notstack/shared';
import { toast } from 'sonner';
import { guildKey } from '@/api/guilds';
import { ticketDetailQuery, ticketsApi, ticketsListQuery } from '@/api/tickets';
import { useConfirm } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import {
    Check,
    ChevronLeft,
    ChevronRight,
    Copy,
    Download,
    ExternalLink,
    Eye,
    Loader2,
    Lock,
    RefreshCw,
    Search,
} from '@/components/icons';
import { JiraTicketsBodySkeleton } from '@/components/skeleton/editor-pages';
import { ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { errorMessage } from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/format';
import { byLang, tr, useT } from '@/lib/i18n';

const STATUS_FILTERS = byLang((): { value: 'ALL' | TicketStatus; label: string }[] => [
    { value: 'ALL', label: tr('common.total') },
    { value: 'OPEN', label: tr('tickets.statusOpen') },
    { value: 'CLOSED', label: tr('tickets.statusClosed') },
]);

function TicketStatusBadge({ status }: { status: TicketStatus }) {
    const t = useT();
    if (status === 'OPEN') {
        return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">{t('tickets.statusOpen')}</Badge>;
    }
    return <Badge variant="secondary">{t('tickets.statusClosed')}</Badge>;
}

export function TicketHistoryTab({ guildId }: { guildId: string }) {
    const t = useT();
    const queryClient = useQueryClient();
    const confirm = useConfirm();

    const [status, setStatus] = useState<'ALL' | TicketStatus>('ALL');
    const [page, setPage] = useState(1);
    const [searchText, setSearchText] = useState('');
    const debouncedSearch = useDebouncedValue(searchText, 300);

    const [closingId, setClosingId] = useState<number | null>(null);
    const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
    const [previewTicketId, setPreviewTicketId] = useState<number | null>(null);
    const [copied, setCopied] = useState(false);

    const listQuery = useQuery(ticketsListQuery(guildId, page, status, debouncedSearch));
    const detailQuery = useQuery(ticketDetailQuery(guildId, previewTicketId));

    const data = listQuery.data;
    const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? TICKET_LIMITS.pageSize)));

    const handleClose = async (ticket: TicketItemDto) => {
        const num = formatTicketNumber(ticket.ticketNumber);
        const ok = await confirm({
            title: t('tickets.confirmCloseTitle', { 0: num }),
            description: t('tickets.confirmCloseDesc'),
            confirmText: t('tickets.closeTicketAction'),
            destructive: true,
        });
        if (!ok) return;

        setClosingId(ticket.id);
        try {
            await ticketsApi.closeTicket(guildId, ticket.id);
            await queryClient.invalidateQueries({ queryKey: [...guildKey(guildId), 'tickets'] });
            toast.success(t('tickets.closedToast', { 0: num }));
        } catch (err) {
            toast.error(t('tickets.closeFailed'), { description: errorMessage(err) });
        } finally {
            setClosingId(null);
        }
    };

    const handleDownload = async (ticket: Pick<TicketItemDto, 'id' | 'ticketNumber'>, format: 'md' | 'html') => {
        const key = `${ticket.id}:${format}`;
        setDownloadingKey(key);
        try {
            await ticketsApi.downloadTranscript(guildId, ticket.id, ticket.ticketNumber, format);
        } catch (err) {
            toast.error(t('tickets.downloadFailed'), { description: errorMessage(err) });
        } finally {
            setDownloadingKey(null);
        }
    };

    const handleCopy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            toast.error(t('common.copyFailed'));
        }
    };

    const columns: ColumnDef<TicketItemDto>[] = [
        {
            accessorKey: 'ticketNumber',
            header: t('tickets.colNumber'),
            cell: ({ row }) => {
                const ticket = row.original;
                return (
                    <div>
                        <span className="font-mono font-semibold text-foreground">#{formatTicketNumber(ticket.ticketNumber)}</span>
                        {ticket.subject && <div className="max-w-48 truncate text-xs text-muted-foreground">{ticket.subject}</div>}
                    </div>
                );
            },
        },
        {
            id: 'opener',
            header: t('tickets.colOpener'),
            cell: ({ row }) => {
                const ticket = row.original;
                return (
                    <div>
                        <div className="font-medium">{ticket.openerName ?? ticket.openerId}</div>
                        <div className="font-mono text-xs text-muted-foreground">{ticket.openerId}</div>
                    </div>
                );
            },
        },
        {
            id: 'claimedBy',
            header: t('tickets.colClaimedBy'),
            cell: ({ row }) => {
                const ticket = row.original;
                if (!ticket.claimedById) return <span className="text-muted-foreground">—</span>;
                return (
                    <div>
                        <div className="text-sm font-medium">{ticket.claimedByName ?? ticket.claimedById}</div>
                        <div className="font-mono text-xs text-muted-foreground">{ticket.claimedById}</div>
                    </div>
                );
            },
        },
        {
            accessorKey: 'status',
            header: t('common.status'),
            cell: ({ row }) => <TicketStatusBadge status={row.original.status} />,
        },
        {
            accessorKey: 'createdAt',
            header: t('tickets.colTimestamps'),
            cell: ({ row }) => {
                const ticket = row.original;
                return (
                    <div className="text-xs whitespace-nowrap">
                        <div>{formatDateTime(ticket.createdAt)}</div>
                        {ticket.closedAt && (
                            <div className="text-muted-foreground">
                                {t('tickets.closedAtPrefix')} {formatDateTime(ticket.closedAt)}
                            </div>
                        )}
                    </div>
                );
            },
        },
        {
            id: 'actions',
            header: () => <div className="text-right">{t('common.actions')}</div>,
            cell: ({ row }) => {
                const ticket = row.original;
                return (
                    <div className="flex flex-wrap justify-end gap-1.5 whitespace-nowrap">
                        {ticket.status === 'OPEN' && ticket.channelId && (
                            <Button variant="outline" size="xs" asChild>
                                <a
                                    href={`https://discord.com/channels/${guildId}/${ticket.channelId}`}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    <ExternalLink className="size-3.5" /> {t('tickets.openInDiscord')}
                                </a>
                            </Button>
                        )}
                        {ticket.status === 'OPEN' && (
                            <Button
                                variant="outline"
                                size="xs"
                                disabled={closingId === ticket.id}
                                onClick={() => void handleClose(ticket)}
                            >
                                {closingId === ticket.id ? <Loader2 className="size-3.5 animate-spin" /> : <Lock className="size-3.5" />}{' '}
                                {t('tickets.closeTicketAction')}
                            </Button>
                        )}
                        {ticket.hasTranscript && (
                            <>
                                <Button variant="outline" size="xs" onClick={() => setPreviewTicketId(ticket.id)}>
                                    <Eye className="size-3.5" /> {t('tickets.viewTranscript')}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="xs"
                                    disabled={downloadingKey === `${ticket.id}:md`}
                                    onClick={() => void handleDownload(ticket, 'md')}
                                    title={t('tickets.downloadMd')}
                                >
                                    {downloadingKey === `${ticket.id}:md` ? (
                                        <Loader2 className="size-3.5 animate-spin" />
                                    ) : (
                                        <Download className="size-3.5" />
                                    )}{' '}
                                    .md
                                </Button>
                                <Button
                                    variant="outline"
                                    size="xs"
                                    disabled={downloadingKey === `${ticket.id}:html`}
                                    onClick={() => void handleDownload(ticket, 'html')}
                                    title={t('tickets.downloadHtml')}
                                >
                                    {downloadingKey === `${ticket.id}:html` ? (
                                        <Loader2 className="size-3.5 animate-spin" />
                                    ) : (
                                        <Download className="size-3.5" />
                                    )}{' '}
                                    .html
                                </Button>
                            </>
                        )}
                    </div>
                );
            },
        },
    ];

    return (
        <>
            <Card>
                <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
                    <div>
                        <CardTitle>{t('tickets.historyTitle')}</CardTitle>
                        <CardDescription>
                            {t('tickets.historySummary', {
                                0: formatNumber(data?.openCount),
                                1: formatNumber(data?.closedCount),
                            })}
                        </CardDescription>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={t('common.refresh')}
                        disabled={listQuery.isFetching}
                        onClick={() => void listQuery.refetch()}
                    >
                        <RefreshCw className={listQuery.isFetching ? 'size-4 animate-spin' : 'size-4'} />
                    </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <Tabs
                            value={status}
                            onValueChange={(value) => {
                                setStatus(value as typeof status);
                                setPage(1);
                            }}
                        >
                            <TabsList className="h-auto flex-wrap">
                                {STATUS_FILTERS().map((filter) => (
                                    <TabsTrigger key={filter.value} value={filter.value}>
                                        {filter.label}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>

                        <div className="relative w-full sm:w-64">
                            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                className="pl-8"
                                placeholder={t('tickets.searchPlaceholder')}
                                value={searchText}
                                onChange={(e) => {
                                    setSearchText(e.target.value);
                                    setPage(1);
                                }}
                            />
                        </div>
                    </div>

                    {listQuery.isLoading ? (
                        <JiraTicketsBodySkeleton />
                    ) : listQuery.error ? (
                        <ErrorState error={listQuery.error} />
                    ) : (
                        <DataTable
                            columns={columns}
                            data={data?.items ?? []}
                            empty={t('tickets.noTicketsYet')}
                            label={t('tickets.historyTitle')}
                        />
                    )}

                    {pages > 1 && (
                        <div className="flex items-center justify-end gap-2 text-sm">
                            <Button
                                variant="outline"
                                size="icon"
                                aria-label={t('jira.previousPage')}
                                disabled={page <= 1}
                                onClick={() => setPage((p) => p - 1)}
                            >
                                <ChevronLeft />
                            </Button>
                            <span>
                                {t('common.pages')} {page} / {pages}
                            </span>
                            <Button
                                variant="outline"
                                size="icon"
                                aria-label={t('jira.nextPage')}
                                disabled={page >= pages}
                                onClick={() => setPage((p) => p + 1)}
                            >
                                <ChevronRight />
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={previewTicketId !== null} onOpenChange={(open) => !open && setPreviewTicketId(null)}>
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>
                            {detailQuery.data
                                ? t('tickets.transcriptDialogTitle', { 0: formatTicketNumber(detailQuery.data.ticketNumber) })
                                : t('tickets.viewTranscript')}
                        </DialogTitle>
                        {detailQuery.data && (
                            <DialogDescription>
                                {t('tickets.transcriptDialogMeta', {
                                    0: detailQuery.data.openerName ?? detailQuery.data.openerId,
                                    1: detailQuery.data.closedAt ? formatDateTime(detailQuery.data.closedAt) : '-',
                                })}
                            </DialogDescription>
                        )}
                    </DialogHeader>

                    {detailQuery.isLoading ? (
                        <div className="flex items-center justify-center py-12 text-muted-foreground">
                            <Loader2 className="mr-2 size-4 animate-spin" /> {t('common.loadingData2')}
                        </div>
                    ) : detailQuery.error ? (
                        <ErrorState error={detailQuery.error} />
                    ) : detailQuery.data ? (
                        <div className="space-y-3">
                            <div className="flex flex-wrap justify-end gap-2">
                                {detailQuery.data.transcriptMarkdown && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => void handleCopy(detailQuery.data!.transcriptMarkdown!)}
                                    >
                                        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}{' '}
                                        {copied ? t('tickets.copiedTranscript') : t('tickets.copyMarkdown')}
                                    </Button>
                                )}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={downloadingKey === `${detailQuery.data.id}:md`}
                                    onClick={() => void handleDownload(detailQuery.data!, 'md')}
                                >
                                    <Download className="size-4" /> {t('tickets.downloadMd')}
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled={downloadingKey === `${detailQuery.data.id}:html`}
                                    onClick={() => void handleDownload(detailQuery.data!, 'html')}
                                >
                                    <Download className="size-4" /> {t('tickets.downloadHtml')}
                                </Button>
                            </div>
                            <pre className="max-h-[55vh] overflow-auto rounded-xl border bg-muted/60 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                                {detailQuery.data.transcriptMarkdown ?? t('tickets.noTranscript')}
                            </pre>
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>
        </>
    );
}
