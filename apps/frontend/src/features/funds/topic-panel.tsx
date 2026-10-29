import { formatBaht, roundMoney, type FundMemberView, type FundPaymentView } from '@notstack/shared';
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
} from 'lucide-react';
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
            toast.success(topic.closed ? 'ปิดการเก็บเงินแล้ว' : 'เปิดการเก็บเงินอีกครั้ง');
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
            toast.success(`คัดลอก${label}แล้ว`);
            setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2000);
        } catch {
            toast.error('ไม่สามารถคัดลอกข้อความได้');
        }
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            // ส่งออกทันทีจากข้อมูลที่โหลดอยู่ในหน้าเว็บ (รวดเร็ว ไม่ติดปัญหา CORS/Session หมดอายุ)
            downloadFundCsv(topic);
            toast.success('ดาวน์โหลดไฟล์ CSV เรียบร้อยแล้ว');
        } catch {
            // Fallback เรียก API กรณีฉุกเฉิน
            try {
                await fundApi.exportCsv(guildId, topicId);
                toast.success('ดาวน์โหลดไฟล์ CSV เรียบร้อยแล้ว');
            } catch (err) {
                onFundError(err);
            }
        } finally {
            setExporting(false);
        }
    };

    const remove = async () => {
        const ok = await confirm({
            title: 'ลบหัวข้อเก็บเงิน?',
            description: `“${topic.name}” พร้อมรายชื่อ ${topic.memberCount} คนและรายการรับเงินทั้งหมดจะถูกลบถาวร`,
            confirmText: 'ลบหัวข้อ',
            destructive: true,
        });
        if (!ok) return;
        try {
            await fundApi.remove(guildId, topic.id);
            toast.success('ลบหัวข้อแล้ว');
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
        <div className="space-y-4">
            <Card>
                <CardHeader className="flex-row items-start justify-between gap-2 pb-3">
                    <div className="min-w-0 flex-1 space-y-2">
                        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                            <span className="truncate">{topic.name}</span>
                            {topic.closed ? (
                                <Badge variant="secondary">
                                    <Lock /> ปิดแล้ว
                                </Badge>
                            ) : isCompleted ? (
                                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                                    <CheckCircle2 /> เก็บครบตามเป้าแล้ว
                                </Badge>
                            ) : null}
                        </CardTitle>

                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            {dailyRate ? (
                                <Badge variant="secondary" className="gap-1 border-primary/30 bg-primary/10 font-normal text-primary">
                                    <Calendar className="size-3" />
                                    เก็บรายวัน วันละ {formatBaht(dailyRate)}
                                    {topic.startDate && ` (เริ่ม ${new Date(topic.startDate).toLocaleDateString('th-TH')})`}
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="gap-1 font-normal">
                                    <Banknote className="size-3 text-muted-foreground" />
                                    ยอดต่อคน {formatBaht(topic.amountPerMember)}
                                </Badge>
                            )}

                            {due && (
                                <Badge
                                    variant="outline"
                                    className={
                                        due.tone === 'overdue'
                                            ? 'border-destructive/40 bg-destructive/10 font-normal text-destructive'
                                            : due.tone === 'soon'
                                              ? 'border-amber-500/40 bg-amber-500/10 font-normal text-amber-400'
                                              : 'font-normal text-muted-foreground'
                                    }
                                >
                                    {due.tone === 'overdue' ? <AlertTriangle className="size-3" /> : <Clock className="size-3" />}
                                    {due.label}
                                </Badge>
                            )}
                        </div>

                        {topic.description && (
                            <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border bg-muted/25 px-3 py-2 text-xs">
                                <p className="whitespace-pre-line text-muted-foreground">{topic.description}</p>
                                <div className="flex shrink-0 items-center gap-1">
                                    {accountDigits && (
                                        <Button
                                            type="button"
                                            size="xs"
                                            variant="outline"
                                            className="h-6 text-[11px]"
                                            onClick={() => void copyText(accountDigits.replace(/[^\d]/g, ''), 'account', `เลขบัญชี/พร้อมเพย์ (${accountDigits})`)}
                                        >
                                            {copiedKey === 'account' ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                                            คัดลอกเลข {accountDigits}
                                        </Button>
                                    )}
                                    <Button
                                        type="button"
                                        size="xs"
                                        variant="ghost"
                                        className="h-6 text-[11px]"
                                        onClick={() => void copyText(topic.description, 'desc', 'รายละเอียดการโอน')}
                                    >
                                        {copiedKey === 'desc' ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                                        คัดลอกข้อความ
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleExport()}
                            disabled={exporting}
                            title="ดาวน์โหลดข้อมูลสรุป รายชื่อสมาชิก และประวัติการรับเงินเป็นไฟล์ CSV (เปิดใน Excel ได้ทันที)"
                        >
                            {exporting ? <Loader2 className="animate-spin" /> : <Download />}
                            {exporting ? 'กำลังส่งออก...' : 'Export CSV'}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => toggleClosed.mutate(!topic.closed)} disabled={toggleClosed.isPending}>
                            {topic.closed ? <LockOpen /> : <Lock />} {topic.closed ? 'เปิดอีกครั้ง' : 'ปิดการเก็บ'}
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => setEditOpen(true)} aria-label="แก้ไขหัวข้อ" title="แก้ไขรายละเอียดหัวข้อ">
                            <Pencil />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => void remove()} aria-label="ลบหัวข้อ" title="ลบหัวข้อเก็บเงิน">
                            <Trash2 className="text-destructive" />
                        </Button>
                    </div>
                </CardHeader>

                <CardContent className="space-y-3">
                    {topic.closed && (
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                            <div className="flex items-center gap-2">
                                <Lock className="size-4 shrink-0" />
                                <span>หัวข้อนี้ปิดการเก็บเงินแล้ว — กด “เปิดอีกครั้ง” หากต้องการเพิ่ม/ลบคนหรือบันทึกรับเงินเพิ่ม</span>
                            </div>
                            <Button
                                size="xs"
                                variant="outline"
                                className="shrink-0 border-amber-500/40 text-amber-200 hover:bg-amber-500/20"
                                onClick={() => toggleClosed.mutate(false)}
                                disabled={toggleClosed.isPending}
                            >
                                <LockOpen className="size-3" /> เปิดอีกครั้ง
                            </Button>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        <StatTile
                            label="เป้าหมายรวม"
                            value={formatBaht(topic.target)}
                            subtext={dailyRate ? `วันละ ${formatBaht(dailyRate)} · ${topic.memberCount} คน` : `คนละ ${formatBaht(topic.amountPerMember)} · ${topic.memberCount} คน`}
                            icon={<Target className="size-3.5 text-rose-400" />}
                            variant="summary"
                        />
                        <StatTile
                            label="เก็บได้แล้ว"
                            value={formatBaht(topic.collected)}
                            subtext={`คิดเป็น ${pct}% ของเป้าหมาย (${topic.payments.length} รายการโอน)`}
                            icon={<Banknote className="size-3.5 text-emerald-400" />}
                            valueClassName="text-emerald-400"
                            tone="emerald"
                            variant="summary"
                        />
                        <StatTile
                            label="คงค้างรวม"
                            value={formatBaht(remaining)}
                            subtext={
                                remaining > 0
                                    ? `ค้างชำระ ${statusCounts.partial + statusCounts.unpaid} คน`
                                    : 'ไม่มีค้างชำระ เก็บครบทุกคนแล้ว'
                            }
                            icon={<Clock className="size-3.5 text-amber-400" />}
                            valueClassName={remaining > 0 ? 'text-amber-400' : 'text-muted-foreground'}
                            tone={remaining > 0 ? 'amber' : 'default'}
                            variant="summary"
                        />
                        <StatTile
                            label="สถานะสมาชิก"
                            value={`${topic.paidCount} / ${topic.memberCount} คน`}
                            subtext={`บางส่วน ${statusCounts.partial} · ยังไม่จ่าย ${statusCounts.unpaid}`}
                            icon={<Users className="size-3.5 text-sky-400" />}
                            tone="sky"
                            variant="summary"
                        />
                    </div>

                    <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>ความคืบหน้าการเก็บเงิน</span>
                            <span className="font-semibold text-foreground tabular-nums">
                                {formatBaht(topic.collected)} / {formatBaht(topic.target)} ({pct}%)
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
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <TabsList>
                                <TabsTrigger value="members" className="gap-1.5">
                                    <Users className="size-3.5" /> รายชื่อสมาชิก ({topic.memberCount})
                                </TabsTrigger>
                                <TabsTrigger value="payments" className="gap-1.5">
                                    <Receipt className="size-3.5" /> ประวัติรับเงิน ({topic.payments.length})
                                </TabsTrigger>
                                <TabsTrigger value="analytics" className="gap-1.5">
                                    <BarChart3 className="size-3.5" /> แดชบอร์ด & กราฟ
                                </TabsTrigger>
                            </TabsList>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={topic.closed || topic.members.length === 0}
                                    onClick={() => {
                                        setBatchInitialIds(null);
                                        setBatchOpen(true);
                                    }}
                                    title="บันทึกรับเงินสำหรับห้วงเวลาเดียวกันให้กับหลายคนพร้อมกัน"
                                >
                                    <Calendar /> บันทึกตามห้วงเวลา (หลายคน)
                                </Button>
                                <Button
                                    size="sm"
                                    disabled={topic.closed || topic.members.length === 0}
                                    onClick={() => {
                                        setPayMember(null);
                                        setEditingPayment(null);
                                        setPayOpen(true);
                                    }}
                                >
                                    <Banknote /> บันทึกการรับเงิน
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
