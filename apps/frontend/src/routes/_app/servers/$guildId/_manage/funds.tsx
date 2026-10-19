import {
    calculateDailyAmount,
    calculateDays,
    formatBaht,
    roundMoney,
    type FundMemberStatus,
    type FundMemberView,
    type FundTopicDetail,
    type FundTopicSummary,
} from '@notstack/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Banknote, Calendar, CheckCheck, Download, Lock, LockOpen, Pencil, Plus, Send, Trash2, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { fundApi, fundQuery, fundsKey, fundsQuery } from '@/api/fund';
import { guildChannelsQuery, guildRolesQuery } from '@/api/guilds';
import { ChannelSelect, channelLabel } from '@/components/channel-select';
import { useConfirm } from '@/components/confirm-dialog';
import { Field } from '@/components/field';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { UserPicker } from '@/components/user-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/api';
import { formatDateTime, toLocalInput } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useGuildId } from '@/hooks/use-guild';

const searchSchema = z.object({
    topic: z.coerce.number().int().positive().optional().catch(undefined),
});

export const Route = createFileRoute('/_app/servers/$guildId/_manage/funds')({
    validateSearch: searchSchema,
    component: FundsPage,
});

const STATUS_LABEL: Record<FundMemberStatus, { text: string; className: string }> = {
    paid: { text: 'จ่ายครบ', className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' },
    partial: { text: 'จ่ายบางส่วน', className: 'border-amber-500/40 bg-amber-500/10 text-amber-400' },
    unpaid: { text: 'ยังไม่จ่าย', className: 'border-destructive/40 bg-destructive/10 text-destructive' },
};

const percent = (collected: number, target: number) => (target > 0 ? Math.min(100, Math.round((collected / target) * 100)) : 0);

function ProgressBar({ value, className }: { value: number; className?: string }) {
    return (
        <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
            <div className={cn('h-full rounded-full transition-all', value >= 100 ? 'bg-emerald-500' : 'bg-primary')} style={{ width: `${value}%` }} />
        </div>
    );
}

// <input type="date"> ใช้ YYYY-MM-DD (เวลาท้องถิ่น)
const toDateInput = (iso: string | null) => (iso ? toLocalInput(new Date(iso)).slice(0, 10) : '');
const fromDateInput = (value: string) => (value ? new Date(`${value}T23:59:00`).toISOString() : null);

function useFundRefresh() {
    const guildId = useGuildId();
    const queryClient = useQueryClient();
    return () => queryClient.invalidateQueries({ queryKey: fundsKey(guildId) });
}

const onError = (err: unknown) => toast.error('ข้อผิดพลาด', { description: errorMessage(err) });

// ==========================================
// 📝 สร้าง / แก้ไขหัวข้อ
// ==========================================
function TopicDialog({
    open,
    onOpenChange,
    topic,
    onSaved,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    topic?: FundTopicSummary;
    onSaved?: (topic: FundTopicDetail) => void;
}) {
    const guildId = useGuildId();
    const refresh = useFundRefresh();
    const { data: allChannels = [] } = useQuery(guildChannelsQuery(guildId));
    const textChannels = allChannels.filter((ch) => ch.sendable);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [mode, setMode] = useState<'fixed' | 'daily'>('fixed');
    const [amount, setAmount] = useState('');
    const [dailyRate, setDailyRate] = useState('');
    const [startDate, setStartDate] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [reportChannelId, setReportChannelId] = useState('');

    useEffect(() => {
        if (!open) return;
        setName(topic?.name ?? '');
        setDescription(topic?.description ?? '');
        const isDaily = Boolean(topic?.dailyRate && topic.dailyRate > 0);
        setMode(isDaily ? 'daily' : 'fixed');
        setAmount(topic ? String(topic.amountPerMember) : '');
        setDailyRate(topic?.dailyRate ? String(topic.dailyRate) : '15');
        setStartDate(toDateInput(topic?.startDate ?? null));
        setDueDate(toDateInput(topic?.dueDate ?? null));
        setReportChannelId(topic?.reportChannelId ?? '');
    }, [open, topic]);

    const days = mode === 'daily' && startDate && dueDate ? calculateDays(startDate, dueDate) : 0;
    const computedDailyTotal = days > 0 && Number(dailyRate) > 0 ? calculateDailyAmount(Number(dailyRate), startDate, dueDate) : 0;

    const save = useMutation({
        mutationFn: () => {
            const isDaily = mode === 'daily';
            const rate = isDaily && Number(dailyRate) > 0 ? Number(dailyRate) : null;
            const targetPerMember = isDaily
                ? (computedDailyTotal > 0 ? computedDailyTotal : Number(amount || 0))
                : Number(amount || 0);

            const input = {
                name,
                description,
                amountPerMember: targetPerMember,
                dailyRate: rate,
                startDate: isDaily && startDate ? new Date(`${startDate}T00:00:00`).toISOString() : null,
                dueDate: fromDateInput(dueDate),
                reportChannelId,
            };
            return topic ? fundApi.update(guildId, topic.id, input) : fundApi.create(guildId, input);
        },
        onSuccess: (saved) => {
            toast.success(topic ? 'บันทึกหัวข้อแล้ว' : 'สร้างหัวข้อแล้ว');
            void refresh();
            onSaved?.(saved);
            onOpenChange(false);
        },
        onError,
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{topic ? 'แก้ไขหัวข้อเก็บเงิน' : 'สร้างหัวข้อเก็บเงิน'}</DialogTitle>
                    <DialogDescription>ตั้งชื่อเรื่อง ยอดเก็บต่อคน หรือเลือกเก็บแบบรายวัน (เช่น วันละ 15 บาท)</DialogDescription>
                </DialogHeader>
                <form
                    id="fund-topic-form"
                    className="grid gap-3"
                    onSubmit={(event) => {
                        event.preventDefault();
                        save.mutate();
                    }}
                >
                    <Field label="ชื่อหัวข้อ" htmlFor="fund-name">
                        <Input id="fund-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ค่ากองกลางกลุ่ม / วันละ 15 บาท" maxLength={100} autoFocus />
                    </Field>
                    <Field label="รายละเอียด (ไม่บังคับ)" htmlFor="fund-desc">
                        <Textarea id="fund-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500} placeholder="เลขบัญชี / วิธีโอน / หมายเหตุ" />
                    </Field>

                    <Field label="รูปแบบการเก็บเงิน">
                        <div className="grid grid-cols-2 gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant={mode === 'fixed' ? 'default' : 'outline'}
                                onClick={() => setMode('fixed')}
                            >
                                💰 ยอดคงที่ต่อคน
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant={mode === 'daily' ? 'default' : 'outline'}
                                onClick={() => setMode('daily')}
                            >
                                📅 ยอดรายวัน (เช่น 15 บาท)
                            </Button>
                        </div>
                    </Field>

                    {mode === 'daily' ? (
                        <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Field label="ยอดเก็บต่อวัน (บาท/วัน)" htmlFor="fund-daily-rate">
                                    <Input
                                        id="fund-daily-rate"
                                        type="number"
                                        min={0.01}
                                        step="0.01"
                                        inputMode="decimal"
                                        value={dailyRate}
                                        onChange={(e) => setDailyRate(e.target.value)}
                                        placeholder="15"
                                    />
                                </Field>
                                <Field label="วันที่เริ่มเก็บ" htmlFor="fund-start-date">
                                    <Input
                                        id="fund-start-date"
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                    />
                                </Field>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Field label="วันครบกำหนด (ไม่บังคับ)" htmlFor="fund-due">
                                    <Input
                                        id="fund-due"
                                        type="date"
                                        value={dueDate}
                                        onChange={(e) => setDueDate(e.target.value)}
                                    />
                                </Field>
                                <Field
                                    label="ยอดเป้าหมายต่อคน (บาท)"
                                    htmlFor="fund-amount"
                                    hint={computedDailyTotal > 0 ? `คำนวณจาก ${days} วัน × ${dailyRate} บาท` : 'ปล่อยเป็น 0 หรือใส่เป้าหมาย'}
                                >
                                    <Input
                                        id="fund-amount"
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        inputMode="decimal"
                                        value={amount || (computedDailyTotal > 0 ? String(computedDailyTotal) : '')}
                                        onChange={(e) => setAmount(e.target.value)}
                                        placeholder={computedDailyTotal > 0 ? String(computedDailyTotal) : '0'}
                                    />
                                </Field>
                            </div>
                        </div>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="ยอดเก็บต่อคน (บาท)" htmlFor="fund-amount">
                                <Input id="fund-amount" type="number" min={0} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
                            </Field>
                            <Field label="ครบกำหนด (ไม่บังคับ)" htmlFor="fund-due">
                                <Input id="fund-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                            </Field>
                        </div>
                    )}

                    <Field label="ห้องส่งรายงาน" hint="เปลี่ยนได้ภายหลัง หรือเลือกห้องอื่นตอนกดส่งรายงาน">
                        <ChannelSelect channels={textChannels} value={reportChannelId} onChange={setReportChannelId} noneLabel="ยังไม่เลือก" />
                    </Field>
                </form>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        ยกเลิก
                    </Button>
                    <Button type="submit" form="fund-topic-form" disabled={save.isPending || !name.trim()}>
                        {topic ? 'บันทึก' : 'สร้างหัวข้อ'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ==========================================
// 💵 บันทึกการรับเงิน (รายคน)
// ==========================================
function PaymentDialog({
    topic,
    member,
    open,
    onOpenChange,
}: {
    topic: FundTopicDetail;
    member: FundMemberView | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const guildId = useGuildId();
    const refresh = useFundRefresh();
    const [memberId, setMemberId] = useState('');
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [paidAt, setPaidAt] = useState('');
    const [usePeriod, setUsePeriod] = useState(false);
    const [periodStart, setPeriodStart] = useState('');
    const [periodEnd, setPeriodEnd] = useState('');

    useEffect(() => {
        if (!open) return;
        setMemberId(member ? String(member.id) : '');
        setAmount(member && member.remaining > 0 ? String(member.remaining) : '');
        setNote('');
        setPaidAt(toLocalInput(new Date()));
        const isDaily = Boolean(topic.dailyRate && topic.dailyRate > 0);
        setUsePeriod(isDaily);
        if (isDaily) {
            const today = toDateInput(new Date().toISOString());
            const start = topic.startDate ? toDateInput(topic.startDate) : today;
            setPeriodStart(start);
            setPeriodEnd(today);
            const days = calculateDays(start, today);
            if (days > 0 && topic.dailyRate) {
                setAmount(String(roundMoney(days * topic.dailyRate)));
                setNote(`งวดวันที่ ${start} ถึง ${today} (${days} วัน)`);
            }
        } else {
            setPeriodStart('');
            setPeriodEnd('');
        }
    }, [open, member, topic]);

    const periodDays = usePeriod && periodStart && periodEnd ? calculateDays(periodStart, periodEnd) : 0;

    const handlePeriodChange = (start: string, end: string) => {
        setPeriodStart(start);
        setPeriodEnd(end);
        if (start && end) {
            const days = calculateDays(start, end);
            if (days > 0 && topic.dailyRate && topic.dailyRate > 0) {
                const autoAmount = roundMoney(days * topic.dailyRate);
                setAmount(String(autoAmount));
                setNote((prev) => (!prev || prev.startsWith('งวดวันที่') ? `งวดวันที่ ${start} ถึง ${end} (${days} วัน)` : prev));
            }
        }
    };

    const selected = topic.members.find((m) => String(m.id) === memberId);
    const save = useMutation({
        mutationFn: () =>
            fundApi.addPayment(guildId, topic.id, {
                memberId: Number(memberId),
                amount: Number(amount),
                note,
                paidAt: paidAt ? new Date(paidAt).toISOString() : null,
                periodStart: usePeriod && periodStart ? new Date(`${periodStart}T00:00:00`).toISOString() : null,
                periodEnd: usePeriod && periodEnd ? new Date(`${periodEnd}T23:59:59`).toISOString() : null,
            }),
        onSuccess: () => {
            toast.success('บันทึกการรับเงินแล้ว');
            void refresh();
            onOpenChange(false);
        },
        onError,
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>บันทึกการรับเงิน</DialogTitle>
                    <DialogDescription>{topic.name}</DialogDescription>
                </DialogHeader>
                <form
                    id="fund-payment-form"
                    className="grid gap-3"
                    onSubmit={(event) => {
                        event.preventDefault();
                        save.mutate();
                    }}
                >
                    <Field label="คนที่จ่าย">
                        <Select value={memberId} onValueChange={setMemberId}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="-- เลือกคน --" />
                            </SelectTrigger>
                            <SelectContent className="max-h-80">
                                {topic.members.map((m) => (
                                    <SelectItem key={m.id} value={String(m.id)}>
                                        {m.displayName} {m.remaining > 0 ? `(ค้าง ${formatBaht(m.remaining)})` : '✅'}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>

                    <div className="rounded-lg border bg-muted/20 p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="toggle-period" className="text-xs font-medium cursor-pointer flex items-center gap-1.5">
                                <Calendar className="size-3.5 text-primary" />
                                บันทึกตามห้วงวันที่ (ย้อนหลัง / รายวัน)
                            </Label>
                            <Checkbox
                                id="toggle-period"
                                checked={usePeriod}
                                onCheckedChange={(c) => {
                                    const checked = c === true;
                                    setUsePeriod(checked);
                                    if (checked && !periodStart) {
                                        const today = toDateInput(new Date().toISOString());
                                        const start = topic.startDate ? toDateInput(topic.startDate) : today;
                                        handlePeriodChange(start, today);
                                    }
                                }}
                            />
                        </div>
                        {usePeriod && (
                            <div className="space-y-2 pt-1">
                                <div className="grid grid-cols-2 gap-2">
                                    <Field label="ตั้งแต่วันที่" htmlFor="pay-period-start">
                                        <Input
                                            id="pay-period-start"
                                            type="date"
                                            value={periodStart}
                                            onChange={(e) => handlePeriodChange(e.target.value, periodEnd)}
                                        />
                                    </Field>
                                    <Field label="ถึงวันที่" htmlFor="pay-period-end">
                                        <Input
                                            id="pay-period-end"
                                            type="date"
                                            value={periodEnd}
                                            onChange={(e) => handlePeriodChange(periodStart, e.target.value)}
                                        />
                                    </Field>
                                </div>
                                {periodDays > 0 && (
                                    <p className="text-xs text-muted-foreground">
                                        📅 รวม <span className="font-semibold text-foreground">{periodDays} วัน</span>
                                        {topic.dailyRate && topic.dailyRate > 0 && (
                                            <span> (วันละ {formatBaht(topic.dailyRate)} = <span className="font-semibold text-emerald-400">{formatBaht(periodDays * topic.dailyRate)}</span>)</span>
                                        )}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    <Field
                        label="จำนวนเงิน (บาท)"
                        htmlFor="fund-pay-amount"
                        hint={selected ? `ต้องจ่าย ${formatBaht(selected.target)} · จ่ายแล้ว ${formatBaht(selected.paid)}` : undefined}
                    >
                        <Input id="fund-pay-amount" type="number" min={0.01} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                    </Field>
                    <Field label="วันเวลาที่รับเงิน" htmlFor="fund-pay-at">
                        <Input id="fund-pay-at" type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
                    </Field>
                    <Field label="หมายเหตุ (ไม่บังคับ)" htmlFor="fund-pay-note">
                        <Input id="fund-pay-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="เช่น โอนผ่าน PromptPay" />
                    </Field>
                </form>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        ยกเลิก
                    </Button>
                    <Button type="submit" form="fund-payment-form" disabled={save.isPending || !memberId || !(Number(amount) > 0)}>
                        บันทึก
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ==========================================
// 📅 บันทึกการรับเงินเป็นกลุ่ม / หลายคนตามห้วงเวลา
// ==========================================
function BatchPaymentDialog({
    topic,
    open,
    onOpenChange,
}: {
    topic: FundTopicDetail;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const guildId = useGuildId();
    const refresh = useFundRefresh();
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [periodStart, setPeriodStart] = useState('');
    const [periodEnd, setPeriodEnd] = useState('');
    const [amount, setAmount] = useState('');
    const [paidAt, setPaidAt] = useState('');
    const [note, setNote] = useState('');

    useEffect(() => {
        if (!open) return;
        const unpaid = topic.members.filter((m) => m.status !== 'paid').map((m) => m.id);
        setSelectedIds(unpaid.length > 0 ? unpaid : topic.members.map((m) => m.id));
        setPaidAt(toLocalInput(new Date()));
        const today = toDateInput(new Date().toISOString());
        const start = topic.startDate ? toDateInput(topic.startDate) : today;
        setPeriodStart(start);
        setPeriodEnd(today);
        if (topic.dailyRate && topic.dailyRate > 0) {
            const days = calculateDays(start, today);
            const total = roundMoney(days * topic.dailyRate);
            setAmount(String(total));
            setNote(`งวดวันที่ ${start} ถึง ${today} (${days} วัน)`);
        } else {
            setAmount(String(topic.amountPerMember || ''));
            setNote('');
        }
    }, [open, topic]);

    const handlePeriodChange = (start: string, end: string) => {
        setPeriodStart(start);
        setPeriodEnd(end);
        if (start && end) {
            const days = calculateDays(start, end);
            if (days > 0 && topic.dailyRate && topic.dailyRate > 0) {
                const autoAmount = roundMoney(days * topic.dailyRate);
                setAmount(String(autoAmount));
                setNote(`งวดวันที่ ${start} ถึง ${end} (${days} วัน)`);
            }
        }
    };

    const days = periodStart && periodEnd ? calculateDays(periodStart, periodEnd) : 0;
    const totalCollected = roundMoney(selectedIds.length * Number(amount || 0));

    const toggleMember = (id: number) => {
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const selectAll = () => setSelectedIds(topic.members.map((m) => m.id));
    const selectNone = () => setSelectedIds([]);
    const selectUnpaid = () => setSelectedIds(topic.members.filter((m) => m.status !== 'paid').map((m) => m.id));

    const save = useMutation({
        mutationFn: () =>
            fundApi.batchPayment(guildId, topic.id, {
                memberIds: selectedIds,
                amount: Number(amount),
                note,
                paidAt: paidAt ? new Date(paidAt).toISOString() : null,
                periodStart: periodStart ? new Date(`${periodStart}T00:00:00`).toISOString() : null,
                periodEnd: periodEnd ? new Date(`${periodEnd}T23:59:59`).toISOString() : null,
            }),
        onSuccess: (res) => {
            toast.success(res.message ?? 'บันทึกการรับเงินเรียบร้อยแล้ว');
            void refresh();
            onOpenChange(false);
        },
        onError,
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>บันทึกรับเงินตามห้วงเวลา (หลายคน)</DialogTitle>
                    <DialogDescription>{topic.name} — บันทึกเก็บยอดรายวันย้อนหลังให้สมาชิกหลายคนพร้อมกันในครั้งเดียว</DialogDescription>
                </DialogHeader>
                <form
                    id="fund-batch-form"
                    className="grid gap-3"
                    onSubmit={(event) => {
                        event.preventDefault();
                        save.mutate();
                    }}
                >
                    <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground">📅 กำหนดห้วงเวลาที่จ่าย</p>
                        <div className="grid grid-cols-2 gap-2">
                            <Field label="ตั้งแต่วันที่" htmlFor="batch-period-start">
                                <Input
                                    id="batch-period-start"
                                    type="date"
                                    value={periodStart}
                                    onChange={(e) => handlePeriodChange(e.target.value, periodEnd)}
                                />
                            </Field>
                            <Field label="ถึงวันที่" htmlFor="batch-period-end">
                                <Input
                                    id="batch-period-end"
                                    type="date"
                                    value={periodEnd}
                                    onChange={(e) => handlePeriodChange(periodStart, e.target.value)}
                                />
                            </Field>
                        </div>
                        {days > 0 && (
                            <p className="text-xs text-muted-foreground">
                                📅 รวม <span className="font-semibold text-foreground">{days} วัน</span>
                                {topic.dailyRate && topic.dailyRate > 0 && (
                                    <span> (วันละ {formatBaht(topic.dailyRate)} = <span className="font-semibold text-emerald-400">{formatBaht(days * topic.dailyRate)} ต่อคน</span>)</span>
                                )}
                            </p>
                        )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="ยอดเงินต่อคน (บาท)" htmlFor="batch-amount">
                            <Input
                                id="batch-amount"
                                type="number"
                                min={0.01}
                                step="0.01"
                                inputMode="decimal"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0"
                            />
                        </Field>
                        <Field label="วันเวลาที่บันทึกรับเงิน" htmlFor="batch-paid-at">
                            <Input
                                id="batch-paid-at"
                                type="datetime-local"
                                value={paidAt}
                                onChange={(e) => setPaidAt(e.target.value)}
                            />
                        </Field>
                    </div>

                    <Field label="หมายเหตุ (ไม่บังคับ)" htmlFor="batch-note">
                        <Input
                            id="batch-note"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            maxLength={200}
                            placeholder="เช่น งวดวันที่ 01/10 ถึง 15/10"
                        />
                    </Field>

                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                            <Label className="font-medium">เลือกคนที่จ่าย ({selectedIds.length}/{topic.members.length} คน)</Label>
                            <div className="flex gap-1">
                                <Button type="button" size="xs" variant="ghost" onClick={selectAll}>ทั้งหมด</Button>
                                <Button type="button" size="xs" variant="ghost" onClick={selectUnpaid}>เฉพาะค้าง</Button>
                                <Button type="button" size="xs" variant="ghost" onClick={selectNone}>ล้าง</Button>
                            </div>
                        </div>
                        <div className="max-h-48 overflow-y-auto rounded-lg border divide-y bg-background p-1">
                            {topic.members.map((m) => {
                                const checked = selectedIds.includes(m.id);
                                return (
                                    <label
                                        key={m.id}
                                        className="flex items-center justify-between gap-2 p-1.5 hover:bg-muted/50 rounded cursor-pointer text-xs"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Checkbox
                                                checked={checked}
                                                onCheckedChange={() => toggleMember(m.id)}
                                            />
                                            <span className="truncate font-medium">{m.displayName}</span>
                                        </div>
                                        <span className="text-muted-foreground tabular-nums shrink-0">
                                            {m.remaining > 0 ? `ค้าง ${formatBaht(m.remaining)}` : '✅ จ่ายครบแล้ว'}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                </form>
                <DialogFooter className="flex-row items-center justify-between sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                        ยอดรวม: <span className="font-semibold text-emerald-400">{formatBaht(totalCollected)}</span>
                    </p>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            ยกเลิก
                        </Button>
                        <Button
                            type="submit"
                            form="fund-batch-form"
                            disabled={save.isPending || selectedIds.length === 0 || !(Number(amount) > 0)}
                        >
                            บันทึก {selectedIds.length} คน
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ==========================================
// 🎯 ยอดเฉพาะคน (กดที่ยอดเพื่อแก้)
// ==========================================
function TargetCell({ topic, member }: { topic: FundTopicDetail; member: FundMemberView }) {
    const guildId = useGuildId();
    const refresh = useFundRefresh();
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState('');
    const update = useMutation({
        mutationFn: (targetAmount: number | null) => fundApi.updateMember(guildId, topic.id, member.id, { targetAmount }),
        onSuccess: () => {
            setEditing(false);
            void refresh();
        },
        onError,
    });

    if (!editing) {
        return (
            <button
                type="button"
                className="group inline-flex items-center gap-1.5 rounded px-1 text-left hover:bg-muted"
                onClick={() => {
                    setValue(String(member.target));
                    setEditing(true);
                }}
                title="กดเพื่อตั้งยอดเฉพาะคนนี้"
            >
                {formatBaht(member.target)}
                {member.customTarget && (
                    <Badge variant="outline" className="text-[10px]">
                        เฉพาะคน
                    </Badge>
                )}
                <Pencil className="size-3 opacity-0 group-hover:opacity-60" />
            </button>
        );
    }
    return (
        <form
            className="flex items-center gap-1"
            onSubmit={(event) => {
                event.preventDefault();
                update.mutate(Number(value || 0));
            }}
        >
            <Input type="number" min={0} step="0.01" value={value} onChange={(e) => setValue(e.target.value)} className="h-7 w-24" autoFocus />
            <Button type="submit" size="xs" disabled={update.isPending}>
                บันทึก
            </Button>
            {member.customTarget && (
                <Button type="button" size="xs" variant="ghost" onClick={() => update.mutate(null)} title={`กลับไปใช้ยอดต่อคน (${formatBaht(topic.amountPerMember)})`}>
                    ใช้ยอดกลาง
                </Button>
            )}
            <Button type="button" size="icon-xs" variant="ghost" onClick={() => setEditing(false)} aria-label="ยกเลิก">
                <X />
            </Button>
        </form>
    );
}

// ==========================================
// 👥 รายชื่อ + เพิ่ม/ลบคน
// ==========================================
function MembersTab({ topic, onPay }: { topic: FundTopicDetail; onPay: (member: FundMemberView | null) => void }) {
    const guildId = useGuildId();
    const refresh = useFundRefresh();
    const confirm = useConfirm();
    const { data: roles = [] } = useQuery(guildRolesQuery(guildId));
    const [roleId, setRoleId] = useState('');

    const add = useMutation({
        mutationFn: (input: { userIds?: string[]; roleId?: string }) => fundApi.addMembers(guildId, topic.id, input),
        onSuccess: (res) => {
            toast.success(res.message ?? 'เพิ่มคนแล้ว');
            setRoleId('');
            void refresh();
        },
        onError,
    });
    const payFull = useMutation({
        mutationFn: (member: FundMemberView) => fundApi.addPayment(guildId, topic.id, { memberId: member.id, amount: member.remaining, note: 'จ่ายครบ' }),
        onSuccess: () => {
            toast.success('บันทึกว่าจ่ายครบแล้ว');
            void refresh();
        },
        onError,
    });

    const remove = async (member: FundMemberView) => {
        const ok = await confirm({
            title: 'ลบคนออกจากหัวข้อ?',
            description:
                member.paid > 0
                    ? `${member.displayName} มีรายการรับเงินรวม ${formatBaht(member.paid)} — รายการเหล่านั้นจะถูกลบไปด้วย`
                    : `เอา ${member.displayName} ออกจาก “${topic.name}”`,
            confirmText: 'ลบ',
            destructive: true,
        });
        if (!ok) return;
        try {
            await fundApi.removeMember(guildId, topic.id, member.id);
            toast.success('ลบคนแล้ว');
            void refresh();
        } catch (err) {
            onError(err);
        }
    };

    return (
        <div className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2">
                <Field label="เพิ่มคน">
                    <UserPicker
                        keepSelection={false}
                        placeholder="พิมพ์ชื่อหรือ username..."
                        exclude={topic.members.map((m) => m.userId)}
                        onSelect={(user) => add.mutate({ userIds: [user.userId] })}
                    />
                </Field>
                <Field label="เพิ่มทุกคนในยศ">
                    <div className="flex gap-2">
                        <Select value={roleId} onValueChange={setRoleId}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="-- เลือกยศ --" />
                            </SelectTrigger>
                            <SelectContent className="max-h-80">
                                {roles.map((role) => (
                                    <SelectItem key={role.id} value={role.id}>
                                        @{role.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button variant="outline" disabled={!roleId || add.isPending} onClick={() => add.mutate({ roleId })}>
                            <Users /> เพิ่ม
                        </Button>
                    </div>
                </Field>
            </div>

            {topic.members.length === 0 ? (
                <EmptyState>ยังไม่มีคนในหัวข้อนี้ — เพิ่มทีละคนหรือดึงทั้งยศด้านบน</EmptyState>
            ) : (
                <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-xs text-muted-foreground">
                            <tr>
                                <th className="px-3 py-2 text-left font-medium">ชื่อ</th>
                                <th className="px-3 py-2 text-left font-medium">ต้องจ่าย</th>
                                <th className="px-3 py-2 text-right font-medium">จ่ายแล้ว</th>
                                <th className="px-3 py-2 text-right font-medium">คงค้าง</th>
                                <th className="px-3 py-2 text-left font-medium">สถานะ</th>
                                <th className="px-3 py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {topic.members.map((m) => (
                                <tr key={m.id} className="border-t">
                                    <td className="px-3 py-2">
                                        <div className="flex items-center gap-2">
                                            <img src={m.avatar} alt="" className="size-7 rounded-full" />
                                            <div className="min-w-0">
                                                <p className="truncate font-medium">{m.displayName}</p>
                                                <p className="truncate font-mono text-[11px] text-muted-foreground">{m.userId}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-3 py-2">
                                        <TargetCell topic={topic} member={m} />
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums">{formatBaht(m.paid)}</td>
                                    <td className={cn('px-3 py-2 text-right tabular-nums', m.remaining > 0 && 'text-amber-400')}>{formatBaht(m.remaining)}</td>
                                    <td className="px-3 py-2">
                                        <Badge variant="outline" className={STATUS_LABEL[m.status].className}>
                                            {STATUS_LABEL[m.status].text}
                                        </Badge>
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex justify-end gap-1">
                                            <Button size="xs" variant="outline" disabled={topic.closed} onClick={() => onPay(m)}>
                                                <Banknote /> รับเงิน
                                            </Button>
                                            {m.remaining > 0 && (
                                                <Button size="xs" variant="ghost" disabled={topic.closed || payFull.isPending} onClick={() => payFull.mutate(m)} title={`บันทึกรับ ${formatBaht(m.remaining)}`}>
                                                    <CheckCheck /> จ่ายครบ
                                                </Button>
                                            )}
                                            <Button size="icon-xs" variant="ghost" aria-label="ลบคน" onClick={() => void remove(m)}>
                                                <Trash2 className="text-destructive" />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function PaymentsTab({ topic }: { topic: FundTopicDetail }) {
    const guildId = useGuildId();
    const refresh = useFundRefresh();
    const confirm = useConfirm();

    const remove = async (paymentId: number, label: string) => {
        const ok = await confirm({ title: 'ลบรายการรับเงิน?', description: label, confirmText: 'ลบ', destructive: true });
        if (!ok) return;
        try {
            await fundApi.removePayment(guildId, topic.id, paymentId);
            toast.success('ลบรายการแล้ว');
            void refresh();
        } catch (err) {
            onError(err);
        }
    };

    if (topic.payments.length === 0) return <EmptyState>ยังไม่มีรายการรับเงิน</EmptyState>;
    return (
        <ul className="divide-y rounded-lg border">
            {topic.payments.map((p) => {
                const days = p.periodStart && p.periodEnd ? calculateDays(p.periodStart, p.periodEnd) : 0;
                return (
                    <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 font-medium">
                                <span>{p.memberName}</span>
                                <span className="text-emerald-400 tabular-nums">+{formatBaht(p.amount)}</span>
                                {p.periodStart && p.periodEnd && (
                                    <Badge variant="outline" className="text-[11px] font-normal border-primary/30 bg-primary/5 text-primary">
                                        งวด {new Date(p.periodStart).toLocaleDateString('th-TH')} – {new Date(p.periodEnd).toLocaleDateString('th-TH')}
                                        {days > 0 && ` (${days} วัน)`}
                                    </Badge>
                                )}
                            </div>
                            <p className="truncate text-xs text-muted-foreground">
                                {formatDateTime(p.paidAt)}
                                {p.note && ` · ${p.note}`}
                                {p.recordedBy && ` · บันทึกโดย ${p.recordedBy}`}
                            </p>
                        </div>
                        <Button size="icon-xs" variant="ghost" aria-label="ลบรายการ" onClick={() => void remove(p.id, `${p.memberName} ${formatBaht(p.amount)} (${formatDateTime(p.paidAt)})`)}>
                            <Trash2 className="text-destructive" />
                        </Button>
                    </li>
                );
            })}
        </ul>
    );
}

// ==========================================
// 📊 ส่งรายงาน
// ==========================================
function ReportCard({ topic }: { topic: FundTopicDetail }) {
    const guildId = useGuildId();
    const refresh = useFundRefresh();
    const { data: allChannels = [] } = useQuery(guildChannelsQuery(guildId));
    const textChannels = allChannels.filter((ch) => ch.sendable);
    const [mentionUnpaid, setMentionUnpaid] = useState(false);

    const saveChannel = useMutation({
        mutationFn: (reportChannelId: string) => fundApi.update(guildId, topic.id, { reportChannelId }),
        onSuccess: () => {
            toast.success('บันทึกห้องรายงานแล้ว');
            void refresh();
        },
        onError,
    });
    const send = useMutation({
        mutationFn: () => fundApi.sendReport(guildId, topic.id, { mentionUnpaid }),
        onSuccess: (res) => toast.success(res.message ?? 'ส่งรายงานแล้ว'),
        onError,
    });

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">📊 ส่งรายงาน</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <Field label="ห้องส่งรายงาน" hint={topic.reportChannelId ? `ส่งเข้า ${channelLabel(textChannels, topic.reportChannelId)}` : 'เลือกห้องก่อนส่งรายงาน'}>
                    <ChannelSelect channels={textChannels} value={topic.reportChannelId} onChange={(id) => saveChannel.mutate(id)} noneLabel="ยังไม่เลือก" disabled={saveChannel.isPending} />
                </Field>
                <div className="flex flex-wrap items-center gap-3">
                    <Label className="flex items-center gap-2 font-normal">
                        <Checkbox checked={mentionUnpaid} onCheckedChange={(checked) => setMentionUnpaid(checked === true)} />
                        แท็กคนที่ยังจ่ายไม่ครบ
                    </Label>
                    <Button onClick={() => send.mutate()} disabled={send.isPending || !topic.reportChannelId}>
                        <Send /> ส่งรายงาน
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

function TopicPanel({ topicId, onDeleted }: { topicId: number; onDeleted: () => void }) {
    const guildId = useGuildId();
    const refresh = useFundRefresh();
    const confirm = useConfirm();
    const query = useQuery(fundQuery(guildId, topicId));
    const [editOpen, setEditOpen] = useState(false);
    const [payOpen, setPayOpen] = useState(false);
    const [batchOpen, setBatchOpen] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [payMember, setPayMember] = useState<FundMemberView | null>(null);

    const toggleClosed = useMutation({
        mutationFn: (closed: boolean) => fundApi.update(guildId, topicId, { closed }),
        onSuccess: (topic) => {
            toast.success(topic.closed ? 'ปิดการเก็บเงินแล้ว' : 'เปิดการเก็บเงินอีกครั้ง');
            void refresh();
        },
        onError,
    });

    const handleExport = async () => {
        setExporting(true);
        try {
            await fundApi.exportCsv(guildId, topicId);
            toast.success('ดาวน์โหลดไฟล์ CSV เรียบร้อยแล้ว');
        } catch (err) {
            onError(err);
        } finally {
            setExporting(false);
        }
    };

    if (query.isLoading) return <LoadingState />;
    if (query.error) return <ErrorState error={query.error} />;
    const topic = query.data;
    if (!topic) return null;

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
            onDeleted();
            void refresh();
        } catch (err) {
            onError(err);
        }
    };

    const pct = percent(topic.collected, topic.target);
    const remaining = Math.max(0, topic.target - topic.collected);

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="flex-row items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                        <CardTitle className="flex items-center gap-2 truncate">
                            {topic.name}
                            {topic.closed && (
                                <Badge variant="secondary">
                                    <Lock /> ปิดแล้ว
                                </Badge>
                            )}
                        </CardTitle>
                        {topic.description && <p className="text-sm whitespace-pre-line text-muted-foreground">{topic.description}</p>}
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {topic.dailyRate && topic.dailyRate > 0 ? (
                                <Badge variant="secondary" className="font-normal border-primary/30 bg-primary/10 text-primary">
                                    📅 เก็บวันละ {formatBaht(topic.dailyRate)}
                                    {topic.startDate && ` (เริ่ม ${new Date(topic.startDate).toLocaleDateString('th-TH')})`}
                                </Badge>
                            ) : (
                                <span>ยอดต่อคน {formatBaht(topic.amountPerMember)}</span>
                            )}
                            {topic.dueDate && <span>· ครบกำหนด {new Date(topic.dueDate).toLocaleDateString('th-TH', { dateStyle: 'medium' })}</span>}
                        </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleExport()}
                            disabled={exporting}
                            title="ดาวน์โหลดข้อมูลทั้งหมดเป็นไฟล์ CSV"
                        >
                            <Download /> {exporting ? 'กำลังส่งออก...' : 'Export CSV'}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => toggleClosed.mutate(!topic.closed)} disabled={toggleClosed.isPending}>
                            {topic.closed ? <LockOpen /> : <Lock />} {topic.closed ? 'เปิดอีกครั้ง' : 'ปิดการเก็บ'}
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => setEditOpen(true)} aria-label="แก้ไขหัวข้อ">
                            <Pencil />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => void remove()} aria-label="ลบหัวข้อ">
                            <Trash2 className="text-destructive" />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        {[
                            { label: '🎯 เป้าหมาย', value: formatBaht(topic.target) },
                            { label: '💵 เก็บได้แล้ว', value: formatBaht(topic.collected) },
                            { label: '⏳ คงค้าง', value: formatBaht(remaining) },
                            { label: '👥 จ่ายครบ', value: `${topic.paidCount} / ${topic.memberCount} คน` },
                        ].map((stat) => (
                            <div key={stat.label} className="rounded-lg border bg-muted/30 px-3 py-2">
                                <p className="text-xs text-muted-foreground">{stat.label}</p>
                                <p className="text-lg font-semibold tabular-nums">{stat.value}</p>
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center gap-3">
                        <ProgressBar value={pct} />
                        <span className="w-12 text-right text-sm tabular-nums">{pct}%</span>
                    </div>
                </CardContent>
            </Card>

            <ReportCard topic={topic} />

            <Card>
                <CardContent>
                    <Tabs defaultValue="members">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <TabsList>
                                <TabsTrigger value="members">รายชื่อ ({topic.memberCount})</TabsTrigger>
                                <TabsTrigger value="payments">ประวัติรับเงิน ({topic.payments.length})</TabsTrigger>
                            </TabsList>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={topic.closed || topic.members.length === 0}
                                    onClick={() => setBatchOpen(true)}
                                    title="บันทึกรับเงินสำหรับห้วงเวลาเดียวกันให้กับหลายคนพร้อมกัน"
                                >
                                    <Calendar /> บันทึกตามห้วงเวลา (หลายคน)
                                </Button>
                                <Button
                                    size="sm"
                                    disabled={topic.closed || topic.members.length === 0}
                                    onClick={() => {
                                        setPayMember(null);
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
                                    setPayOpen(true);
                                }}
                            />
                        </TabsContent>
                        <TabsContent value="payments">
                            <PaymentsTab topic={topic} />
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            <TopicDialog open={editOpen} onOpenChange={setEditOpen} topic={topic} />
            <PaymentDialog topic={topic} member={payMember} open={payOpen} onOpenChange={setPayOpen} />
            <BatchPaymentDialog topic={topic} open={batchOpen} onOpenChange={setBatchOpen} />
        </div>
    );
}

function TopicListItem({ topic, active, onSelect }: { topic: FundTopicSummary; active: boolean; onSelect: () => void }) {
    const pct = percent(topic.collected, topic.target);
    return (
        <button
            type="button"
            onClick={onSelect}
            className={cn('w-full space-y-2 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted/50', active && 'border-primary bg-primary/5', topic.closed && 'opacity-70')}
        >
            <div className="flex items-center justify-between gap-2">
                <p className="truncate font-medium">{topic.name}</p>
                {topic.closed && <Lock className="size-3.5 shrink-0 text-muted-foreground" />}
            </div>
            {topic.dailyRate && topic.dailyRate > 0 && (
                <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                    วันละ {formatBaht(topic.dailyRate)}
                </Badge>
            )}
            <ProgressBar value={pct} className="h-1.5" />
            <p className="text-xs text-muted-foreground tabular-nums">
                {formatBaht(topic.collected)} / {formatBaht(topic.target)} · ครบ {topic.paidCount}/{topic.memberCount} คน
            </p>
        </button>
    );
}

function FundsPage() {
    const guildId = useGuildId();
    const { topic: selectedId } = Route.useSearch();
    const navigate = useNavigate();
    const list = useQuery(fundsQuery(guildId));
    const [createOpen, setCreateOpen] = useState(false);

    const select = (topic: number | undefined) => void navigate({ to: '/servers/$guildId/funds', params: { guildId }, search: { topic }, replace: true });
    const topics = list.data ?? [];
    const current = topics.find((t) => t.id === selectedId) ?? topics[0];

    return (
        <>
            <PageHeader
                help="funds"
                title="เก็บเงินตามเป้า"
                description="สร้างหัวข้อเก็บเงินได้หลายเรื่อง ตั้งยอดต่อคน เพิ่ม/ลบคน บันทึกการรับเงิน แล้วส่งรายงานเข้าห้อง Discord"
                actions={
                    <Button onClick={() => setCreateOpen(true)}>
                        <Plus /> สร้างหัวข้อ
                    </Button>
                }
            />

            {list.isLoading ? (
                <LoadingState />
            ) : list.error ? (
                <ErrorState error={list.error} />
            ) : topics.length === 0 ? (
                <EmptyState>ยังไม่มีหัวข้อเก็บเงิน — กด “สร้างหัวข้อ” เพื่อเริ่ม</EmptyState>
            ) : (
                <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
                    <div className="space-y-2">
                        {topics.map((topic) => (
                            <TopicListItem key={topic.id} topic={topic} active={topic.id === current?.id} onSelect={() => select(topic.id)} />
                        ))}
                    </div>
                    {current && <TopicPanel key={current.id} topicId={current.id} onDeleted={() => select(undefined)} />}
                </div>
            )}

            <TopicDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={(topic) => select(topic.id)} />
        </>
    );
}
