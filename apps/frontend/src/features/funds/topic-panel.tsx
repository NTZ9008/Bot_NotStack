import { tr, dateLocale } from '../../lib/i18n';
import { roundMoney, type FundMemberView, type FundPaymentView } from '@notstack/shared';
import { formatBaht } from './money';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
    AlertTriangle,
    Banknote,
    BarChart3,
    Calendar,
    Check,
    CheckCircle2,
    Clock,
    Copy,
    Download,
    Loader2,
    Lock,
    LockOpen,
    Pencil,
    Receipt,
    Target,
    Trash2,
    Users,
} from '@/components/icons';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { fundApi, fundQuery } from '@/api/fund';
import { useConfirm } from '@/components/confirm-dialog';
import { FundTopicPanelSkeleton } from '@/components/skeleton/editor-pages';
import { ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useGuildId } from '@/hooks/use-guild';
import { TopicAnalyticsTab } from './analytics-tab';
import { BatchPaymentDialog } from './batch-payment-dialog';
import { MembersTab } from './members-tab';
import { PaymentDialog } from './payment-dialog';
import { PaymentsTab } from './payments-tab';
import { ProgressBar } from './progress-bar';
import { ReportCard } from './report-card';
import { StatTile } from './stat-tile';
import { TopicDialog } from './topic-dialog';
import { dailyRateOf, downloadFundCsv, dueDateStatus, extractAccountDigits, onFundError, percent, useFundRefresh } from './utils';

type TopicTab = 'members' | 'payments' | 'analytics';

// ==========================================
// แผงจัดการหัวข้อที่เลือก — สรุปยอด / ส่งรายงาน / แท็บรายชื่อ-ประวัติ-กราฟ / dialog ต่างๆ
// ==========================================
export function TopicPanel({ topicId, onDeleted }: { topicId: number; onDeleted: () => void }) {
    const guildId = useGuildId();
    const refresh = useFundRefresh();
    const confirm = useConfirm();
    const query = useQuery(fundQuery(guildId, topicId));
    const [activeTab, setActiveTab] = useState<TopicTab>('members');
    const [editOpen, setEditOpen] = useState(false);
    const [payOpen, setPayOpen] = useState(false);
    const [batchOpen, setBatchOpen] = useState(false);
    const [batchInitialIds, setBatchInitialIds] = useState<number[] | null>(null);
    const [exporting, setExporting] = useState(false);
    const [copiedKey, setCopiedKey] = useState<'account' | 'desc' | null>(null);
    const [payMember, setPayMember] = useState<FundMemberView | null>(null);
    const [editingPayment, setEditingPayment] = useState<FundPaymentView | null>(null);
    const [paymentMemberFilter, setPaymentMemberFilter] = useState<number | null>(null);

    const toggleClosed = useMutation({
        mutationFn: (closed: boolean) => fundApi.update(guildId, topicId, { closed }),
        onSuccess: (topic) => {
            toast.success(topic.closed ? tr('funds.collectionClosed') : tr('funds.collectionReopened'));
            void refresh();
        },
        onError: onFundError,
    });

    const topic = query.data;

    const statusCounts = useMemo(() => {
        if (!topic) return { paid: 0, partial: 0, unpaid: 0 };
        let paid = 0;
        let partial = 0;
        let unpaid = 0;
        for (const m of topic.members) {
            if (m.status === 'paid') paid++;
            else if (m.status === 'partial') partial++;
            else unpaid++;
        }
        return { paid, partial, unpaid };
    }, [topic]);

    if (query.isLoading) return <FundTopicPanelSkeleton />;
    if (query.error) return <ErrorState error={query.error} />;
    if (!topic) return null;

    const copyText = async (text: string, key: 'account' | 'desc', label: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedKey(key);
            toast.success(tr('common.copied', { 0: label }));
            setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2000);
        } catch {
            toast.error(tr('funds.couldntCopyTheText'));
        }
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            // ส่งออกทันทีจากข้อมูลที่โหลดอยู่ในหน้าเว็บ (รวดเร็ว ไม่ติดปัญหา CORS/Session หมดอายุ)
            downloadFundCsv(topic);
            toast.success(tr('funds.csvDownloaded'));
        } catch {
            // Fallback เรียก API กรณีฉุกเฉิน
            try {
                await fundApi.exportCsv(guildId, topicId);
                toast.success(tr('funds.csvDownloaded'));
            } catch (err) {
                onFundError(err);
            }
        } finally {
            setExporting(false);
        }
    };

    const remove = async () => {
        const ok = await confirm({
            title: tr('funds.deleteFundTopic2'),
            description: tr('funds.withItsMembersAndAllPayments', { 0: topic.name, 1: topic.memberCount }),
            confirmText: tr('funds.deleteTopic'),
            destructive: true,
        });
        if (!ok) return;
        try {
            await fundApi.remove(guildId, topic.id);
            toast.success(tr('funds.topicDeleted'));
            await refresh();
            onDeleted();
        } catch (err) {
            onFundError(err);
        }
    };

    const dailyRate = dailyRateOf(topic);
    const pct = percent(topic.collected, topic.target);
    const remaining = Math.max(0, roundMoney(topic.target - topic.collected));
    const due = dueDateStatus(topic.dueDate, topic.closed);
    const accountDigits = extractAccountDigits(topic.description);
    const isCompleted = topic.target > 0 && remaining === 0;

    return (
        <div className="min-w-0 space-y-4">
            <Card>
                <CardHeader className="flex flex-col items-stretch justify-between gap-3 pb-3 sm:flex-row sm:items-start sm:gap-2">
                    <div className="min-w-0 flex-1 space-y-2">
                        <CardTitle className="flex flex-wrap items-center gap-2 text-base sm:text-lg">
                            <span className="break-words sm:truncate">{topic.name}</span>
                            {topic.closed ? (
                                <Badge variant="secondary">
                                    <Lock /> {tr('funds.closed')}
                                </Badge>
                            ) : isCompleted ? (
                                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                                    <CheckCircle2 /> {tr('funds.targetReached')}
                                </Badge>
                            ) : null}
                        </CardTitle>

                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            {dailyRate ? (
                                <Badge variant="secondary" className="max-w-full gap-1 border-primary/30 bg-primary/10 font-normal text-primary">
                                    <Calendar className="size-3 shrink-0" />
                                    <span className="truncate">
                                        {tr('funds.dailyCollectionPerDay')} {formatBaht(dailyRate)}
                                        {topic.startDate && tr('funds.started', { 0: new Date(topic.startDate).toLocaleDateString(dateLocale()) })}
                                    </span>
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="gap-1 font-normal">
                                    <Banknote className="size-3 shrink-0 text-muted-foreground" />
                                    {tr('funds.perPerson3')} {formatBaht(topic.amountPerMember)}
                                </Badge>
                            )}

                            {due && (
                                <Badge
                                    variant="outline"
                                    className={
                                        due.tone === 'overdue'
                                            ? 'border-destructive/40 bg-destructive/10 font-normal text-destructive'
                                            : due.tone === 'soon'
                                              ? 'border-amber-500/40 bg-amber-500/10 font-normal text-amber-700 dark:text-amber-400'
                                              : 'font-normal text-muted-foreground'
                                    }
                                >
                                    {due.tone === 'overdue' ? <AlertTriangle className="size-3 shrink-0" /> : <Clock className="size-3 shrink-0" />}
                                    {due.label}
                                </Badge>
                            )}
                        </div>

                        {topic.description && (
                            <div className="flex flex-col gap-2 rounded-lg border bg-muted/25 px-3 py-2 text-xs sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                                <p className="min-w-0 break-words whitespace-pre-line text-muted-foreground">{topic.description}</p>
                                <div className="flex shrink-0 flex-wrap items-center gap-1">
                                    {accountDigits && (
                                        <Button
                                            type="button"
                                            size="xs"
                                            variant="outline"
                                            className="h-6 text-[11px]"
                                            onClick={() =>
                                                void copyText(
                                                    accountDigits.replace(/[^\d]/g, ''),
                                                    'account',
                                                    tr('funds.accountPromptpay', { 0: accountDigits }),
                                                )
                                            }
                                        >
                                            {copiedKey === 'account' ? (
                                                <Check className="size-3 text-emerald-700 dark:text-emerald-400" />
                                            ) : (
                                                <Copy className="size-3" />
                                            )}
                                            {tr('funds.copyNumber')} {accountDigits}
                                        </Button>
                                    )}
                                    <Button
                                        type="button"
                                        size="xs"
                                        variant="ghost"
                                        className="h-6 text-[11px]"
                                        onClick={() => void copyText(topic.description, 'desc', tr('funds.transferDetails'))}
                                    >
                                        {copiedKey === 'desc' ? (
                                            <Check className="size-3 text-emerald-700 dark:text-emerald-400" />
                                        ) : (
                                            <Copy className="size-3" />
                                        )}

                                        {tr('funds.copyText')}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:shrink-0 sm:gap-1">
                        <Button
                            variant="outline"
                            size="sm"
                            className="min-w-0 flex-1 sm:flex-initial"
                            onClick={() => void handleExport()}
                            disabled={exporting}
                            title={tr('funds.downloadTheSummaryMemberListAnd')}
                        >
                            {exporting ? <Loader2 className="animate-spin" /> : <Download />}
                            {exporting ? tr('funds.exporting') : tr('funds.exportCsv')}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="min-w-0 flex-1 sm:flex-initial"
                            onClick={() => toggleClosed.mutate(!topic.closed)}
                            disabled={toggleClosed.isPending}
                        >
                            {topic.closed ? <LockOpen /> : <Lock />} {topic.closed ? tr('funds.reopen') : tr('funds.closeCollection')}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setEditOpen(true)}
                            aria-label={tr('funds.editTopic')}
                            title={tr('funds.editTopicDetails')}
                        >
                            <Pencil />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => void remove()}
                            aria-label={tr('funds.deleteTopic')}
                            title={tr('funds.deleteFundTopic')}
                        >
                            <Trash2 className="text-destructive" />
                        </Button>
                    </div>
                </CardHeader>

                <CardContent className="space-y-3">
                    {topic.closed && (
                        <div className="flex flex-col items-start justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 sm:flex-row sm:items-center">
                            <div className="flex items-start gap-2 sm:items-center">
                                <Lock className="mt-0.5 size-4 shrink-0 sm:mt-0" />
                                <span>{tr('funds.thisTopicIsClosedPressReopen')}</span>
                            </div>
                            <Button
                                size="xs"
                                variant="outline"
                                className="w-full shrink-0 border-amber-500/40 text-amber-800 dark:text-amber-200 hover:bg-amber-500/20 sm:w-auto"
                                onClick={() => toggleClosed.mutate(false)}
                                disabled={toggleClosed.isPending}
                            >
                                <LockOpen className="size-3" /> {tr('funds.reopen')}
                            </Button>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
                        <StatTile
                            label={tr('funds.totalTarget')}
                            value={formatBaht(topic.target)}
                            subtext={
                                dailyRate
                                    ? tr('funds.perDayPeople', { 0: formatBaht(dailyRate), 1: topic.memberCount })
                                    : tr('funds.eachPeople', { 0: formatBaht(topic.amountPerMember), 1: topic.memberCount })
                            }
                            icon={<Target className="size-3.5 text-rose-700 dark:text-rose-400" />}
                            variant="summary"
                        />
                        <StatTile
                            label={tr('funds.collected')}
                            value={formatBaht(topic.collected)}
                            subtext={tr('funds.ofTargetTransfers', { 0: pct, 1: topic.payments.length })}
                            icon={<Banknote className="size-3.5 text-emerald-700 dark:text-emerald-400" />}
                            valueClassName="text-emerald-700 dark:text-emerald-400"
                            tone="emerald"
                            variant="summary"
                        />
                        <StatTile
                            label={tr('funds.totalOutstanding')}
                            value={formatBaht(remaining)}
                            subtext={
                                remaining > 0
                                    ? tr('funds.peopleOweMoney', { 0: statusCounts.partial + statusCounts.unpaid })
                                    : tr('funds.nothingOutstandingEveryoneHasPaid')
                            }
                            icon={<Clock className="size-3.5 text-amber-700 dark:text-amber-400" />}
                            valueClassName={remaining > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}
                            tone={remaining > 0 ? 'amber' : 'default'}
                            variant="summary"
                        />
                        <StatTile
                            label={tr('funds.memberStatus')}
                            value={tr('funds.paidOfMembers', { 0: topic.paidCount, 1: topic.memberCount })}
                            subtext={tr('funds.partialUnpaid', { 0: statusCounts.partial, 1: statusCounts.unpaid })}
                            icon={<Users className="size-3.5 text-sky-700 dark:text-sky-400" />}
                            tone="sky"
                            variant="summary"
                        />
                    </div>

                    <div className="space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground">
                            <span>{tr('funds.collectionProgress')}</span>
                            <span className="font-semibold text-foreground tabular-nums">
                                {formatBaht(topic.collected)} / {formatBaht(topic.target)} · {pct}%
                            </span>
                        </div>
                        <ProgressBar value={pct} className="h-2.5" />
                    </div>
                </CardContent>
            </Card>

            <ReportCard topic={topic} />

            <Card>
                <CardContent className="pt-4">
                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TopicTab)}>
                        <div className="mb-3 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
                            <TabsList className="grid h-auto w-full grid-cols-3 sm:inline-flex sm:h-8 sm:w-fit">
                                <TabsTrigger
                                    value="members"
                                    className="min-w-0 gap-1 overflow-hidden px-1.5 py-1.5 text-xs sm:gap-1.5 sm:px-2.5 sm:py-0.5 sm:text-sm"
                                >
                                    <Users className="size-3.5 shrink-0" />
                                    <span className="truncate">
                                        <span className="hidden sm:inline">{tr('funds.members')}</span>
                                        {tr('common.members')}
                                    </span>
                                    <Badge variant="secondary" className="h-4 shrink-0 px-1 text-[10px]">
                                        {topic.memberCount}
                                    </Badge>
                                </TabsTrigger>
                                <TabsTrigger
                                    value="payments"
                                    className="min-w-0 gap-1 overflow-hidden px-1.5 py-1.5 text-xs sm:gap-1.5 sm:px-2.5 sm:py-0.5 sm:text-sm"
                                >
                                    <Receipt className="size-3.5 shrink-0" />
                                    <span className="truncate">
                                        {tr('common.history')}
                                        <span className="hidden sm:inline">{tr('funds.receive')}</span>
                                    </span>
                                    <Badge variant="secondary" className="h-4 shrink-0 px-1 text-[10px]">
                                        {topic.payments.length}
                                    </Badge>
                                </TabsTrigger>
                                <TabsTrigger
                                    value="analytics"
                                    className="min-w-0 gap-1 overflow-hidden px-1.5 py-1.5 text-xs sm:gap-1.5 sm:px-2.5 sm:py-0.5 sm:text-sm"
                                >
                                    <BarChart3 className="size-3.5 shrink-0" />
                                    <span className="truncate">
                                        <span className="hidden sm:inline">{tr('funds.summary')}</span>
                                        {tr('common.charts')}
                                    </span>
                                </TabsTrigger>
                            </TabsList>
                            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-full sm:w-auto"
                                    disabled={topic.closed || topic.members.length === 0}
                                    onClick={() => {
                                        setBatchInitialIds(null);
                                        setBatchOpen(true);
                                    }}
                                    title={tr('funds.recordPaymentsForTheSamePeriod')}
                                >
                                    <Calendar /> {tr('funds.recordPaymentsForMany')}
                                </Button>
                                <Button
                                    size="sm"
                                    className="w-full sm:w-auto"
                                    disabled={topic.closed || topic.members.length === 0}
                                    onClick={() => {
                                        setPayMember(null);
                                        setEditingPayment(null);
                                        setPayOpen(true);
                                    }}
                                >
                                    <Banknote /> {tr('funds.recordPayment')}
                                </Button>
                            </div>
                        </div>

                        <TabsContent value="members">
                            <MembersTab
                                topic={topic}
                                onPay={(member) => {
                                    setPayMember(member);
                                    setEditingPayment(null);
                                    setPayOpen(true);
                                }}
                                onBatchPay={(memberIds) => {
                                    setBatchInitialIds(memberIds);
                                    setBatchOpen(true);
                                }}
                                onViewHistory={(memberId) => {
                                    setPaymentMemberFilter(memberId);
                                    setActiveTab('payments');
                                }}
                            />
                        </TabsContent>

                        <TabsContent value="payments">
                            <PaymentsTab
                                topic={topic}
                                memberFilter={paymentMemberFilter}
                                onMemberFilterChange={setPaymentMemberFilter}
                                onEditPayment={(payment) => {
                                    setPayMember(null);
                                    setEditingPayment(payment);
                                    setPayOpen(true);
                                }}
                            />
                        </TabsContent>

                        <TabsContent value="analytics">
                            <TopicAnalyticsTab topic={topic} />
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            <TopicDialog open={editOpen} onOpenChange={setEditOpen} topic={topic} />
            <PaymentDialog
                topic={topic}
                member={payMember}
                payment={editingPayment}
                open={payOpen}
                onOpenChange={(open) => {
                    setPayOpen(open);
                    if (!open) setEditingPayment(null);
                }}
            />
            <BatchPaymentDialog
                topic={topic}
                initialMemberIds={batchInitialIds}
                open={batchOpen}
                onOpenChange={(open) => {
                    setBatchOpen(open);
                    if (!open) setBatchInitialIds(null);
                }}
            />
        </div>
    );
}
