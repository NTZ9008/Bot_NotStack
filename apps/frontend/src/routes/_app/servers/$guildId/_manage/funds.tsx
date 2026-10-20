import {
    calculateDailyAmount,
    calculateDays,
    formatBaht,
    generateFundCsv,
    roundMoney,
    type FundMemberStatus,
    type FundMemberView,
    type FundPaymentView,
    type FundTopicDetail,
    type FundTopicSummary,
} from '@notstack/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
    AlertCircle,
    ArrowUpDown,
    Banknote,
    BarChart3,
    Calendar,
    CheckCheck,
    Download,
    Loader2,
    Lock,
    LockOpen,
    Pencil,
    PieChart as PieChartIcon,
    Plus,
    Search,
    Send,
    TrendingUp,
    Trash2,
    Users,
    X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from 'recharts';
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
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
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

const STATUS_LABEL: Record<FundMemberStatus, { text: string; className: string; color: string }> = {
    paid: { text: 'จ่ายครบ', className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400', color: '#10b981' },
    partial: { text: 'จ่ายบางส่วน', className: 'border-amber-500/40 bg-amber-500/10 text-amber-400', color: '#f59e0b' },
    unpaid: { text: 'ยังไม่จ่าย', className: 'border-destructive/40 bg-destructive/10 text-destructive', color: '#ef4444' },
};

const percent = (collected: number, target: number) => (target > 0 ? Math.min(100, Math.round((collected / target) * 100)) : 0);

function ProgressBar({ value, className }: { value: number; className?: string }) {
    const barColor = value >= 100 ? 'bg-emerald-500' : value >= 50 ? 'bg-amber-500' : 'bg-primary';
    return (
        <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
            <div className={cn('h-full rounded-full transition-all duration-300', barColor)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
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

// ดาวน์โหลด CSV ทันทีจากข้อมูลในหน้าเว็บ (ไม่ต้องรอโหลดซ้ำจากเซิร์ฟเวอร์ และรองรับ UTF-8 BOM สำหรับ Excel)
function downloadFundCsvClient(topic: FundTopicDetail) {
    const csv = generateFundCsv(topic);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (topic.name || 'fund').replace(/[/\\?%*:|"<>]/g, '_').slice(0, 50);
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `fund-${safeName}-${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

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
    const [manualAmount, setManualAmount] = useState(false);
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
        setManualAmount(false);
        setDailyRate(topic?.dailyRate ? String(topic.dailyRate) : '15');
        setStartDate(toDateInput(topic?.startDate ?? null));
        setDueDate(toDateInput(topic?.dueDate ?? null));
        setReportChannelId(topic?.reportChannelId ?? '');
    }, [open, topic]);

    const invalidDateRange = Boolean(startDate && dueDate && startDate > dueDate);
    const days = mode === 'daily' && startDate && dueDate && !invalidDateRange ? calculateDays(startDate, dueDate) : 0;
    const computedDailyTotal = days > 0 && Number(dailyRate) > 0 ? calculateDailyAmount(Number(dailyRate), startDate, dueDate) : 0;

    // อัปเดตยอดเป้าหมายอัตโนมัติในโหมดรายวัน ถ้าผู้ใช้ยังไม่ได้แก้ตัวเลขเอง
    useEffect(() => {
        if (mode === 'daily' && !manualAmount && computedDailyTotal > 0) {
            setAmount(String(computedDailyTotal));
        }
    }, [mode, manualAmount, computedDailyTotal]);

    const save = useMutation({
        mutationFn: () => {
            const isDaily = mode === 'daily';
            const rate = isDaily && Number(dailyRate) > 0 ? Number(dailyRate) : null;
            const targetPerMember = isDaily
                ? (manualAmount ? Number(amount || 0) : computedDailyTotal > 0 ? computedDailyTotal : Number(amount || 0))
                : Number(amount || 0);

            const input = {
                name: name.trim(),
                description: description.trim(),
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
                        if (invalidDateRange) return;
                        save.mutate();
                    }}
                >
                    <Field label="ชื่อหัวข้อ" htmlFor="fund-name">
                        <Input id="fund-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ค่ากองกลางกลุ่ม / เก็บเงินรายวัน" maxLength={100} autoFocus />
                    </Field>
                    <Field label="รายละเอียด (ไม่บังคับ)" htmlFor="fund-desc">
                        <Textarea id="fund-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500} placeholder="เลขบัญชี / พร้อมเพย์ / วิธีโอน / หมายเหตุ" />
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
                                onClick={() => {
                                    setMode('daily');
                                    setManualAmount(false);
                                }}
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
                                        onChange={(e) => {
                                            setDailyRate(e.target.value);
                                            setManualAmount(false);
                                        }}
                                        placeholder="15"
                                    />
                                </Field>
                                <Field label="วันที่เริ่มเก็บ" htmlFor="fund-start-date">
                                    <Input
                                        id="fund-start-date"
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => {
                                            setStartDate(e.target.value);
                                            setManualAmount(false);
                                        }}
                                    />
                                </Field>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Field label="วันครบกำหนด (ไม่บังคับ)" htmlFor="fund-due">
                                    <Input
                                        id="fund-due"
                                        type="date"
                                        value={dueDate}
                                        onChange={(e) => {
                                            setDueDate(e.target.value);
                                            setManualAmount(false);
                                        }}
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
                                        value={amount}
                                        onChange={(e) => {
                                            setAmount(e.target.value);
                                            setManualAmount(true);
                                        }}
                                        placeholder={computedDailyTotal > 0 ? String(computedDailyTotal) : '0'}
                                    />
                                </Field>
                            </div>
                            {invalidDateRange && (
                                <p className="flex items-center gap-1.5 text-xs text-destructive">
                                    <AlertCircle className="size-3.5 shrink-0" />
                                    วันที่เริ่มเก็บต้องไม่หลังวันครบกำหนด
                                </p>
                            )}
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
                    <Button type="submit" form="fund-topic-form" disabled={save.isPending || !name.trim() || invalidDateRange}>
                        {save.isPending && <Loader2 className="animate-spin" />}
                        {topic ? 'บันทึก' : 'สร้างหัวข้อ'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ==========================================
// 💵 บันทึก / แก้ไขการรับเงิน (รายคน / รายรายการ)
// ==========================================
function PaymentDialog({
    topic,
    member,
    payment,
    open,
    onOpenChange,
}: {
    topic: FundTopicDetail;
    member: FundMemberView | null;
    payment?: FundPaymentView | null;
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
        if (payment) {
            setMemberId(String(payment.memberId));
            setAmount(String(payment.amount));
            setNote(payment.note ?? '');
            setPaidAt(toLocalInput(new Date(payment.paidAt)));
            const hasPeriod = Boolean(payment.periodStart && payment.periodEnd);
            setUsePeriod(hasPeriod);
            setPeriodStart(toDateInput(payment.periodStart));
            setPeriodEnd(toDateInput(payment.periodEnd));
            return;
        }

        const initialMember = member ?? topic.members.find((m) => m.remaining > 0) ?? topic.members[0] ?? null;
        setMemberId(initialMember ? String(initialMember.id) : '');
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
                const calc = roundMoney(days * topic.dailyRate);
                setAmount(String(initialMember && initialMember.remaining > 0 ? initialMember.remaining : calc));
                setNote(`งวดวันที่ ${start} ถึง ${today} (${days} วัน)`);
            } else {
                setAmount(initialMember && initialMember.remaining > 0 ? String(initialMember.remaining) : '');
            }
        } else {
            setPeriodStart('');
            setPeriodEnd('');
            setAmount(initialMember && initialMember.remaining > 0 ? String(initialMember.remaining) : '');
        }
    }, [open, member, payment, topic]);

    const handleMemberSelect = (newId: string) => {
        setMemberId(newId);
        if (payment) return;
        const targetMember = topic.members.find((m) => String(m.id) === newId);
        if (targetMember && targetMember.remaining > 0 && !usePeriod) {
            setAmount(String(targetMember.remaining));
        }
    };

    const invalidPeriod = Boolean(usePeriod && periodStart && periodEnd && periodStart > periodEnd);
    const periodDays = usePeriod && periodStart && periodEnd && !invalidPeriod ? calculateDays(periodStart, periodEnd) : 0;

    const handlePeriodChange = (start: string, end: string) => {
        setPeriodStart(start);
        setPeriodEnd(end);
        if (start && end && start <= end) {
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
        mutationFn: () => {
            const payload = {
                memberId: Number(memberId),
                amount: Number(amount),
                note: note.trim(),
                paidAt: paidAt ? new Date(paidAt).toISOString() : null,
                periodStart: usePeriod && periodStart ? new Date(`${periodStart}T00:00:00`).toISOString() : null,
                periodEnd: usePeriod && periodEnd ? new Date(`${periodEnd}T23:59:59`).toISOString() : null,
            };
            return payment ? fundApi.updatePayment(guildId, topic.id, payment.id, payload) : fundApi.addPayment(guildId, topic.id, payload);
        },
        onSuccess: () => {
            toast.success(payment ? 'แก้ไขรายการรับเงินแล้ว' : 'บันทึกการรับเงินแล้ว');
            void refresh();
            onOpenChange(false);
        },
        onError,
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{payment ? 'แก้ไขรายการรับเงิน' : 'บันทึกการรับเงิน'}</DialogTitle>
                    <DialogDescription>{topic.name}</DialogDescription>
                </DialogHeader>
                <form
                    id="fund-payment-form"
                    className="grid gap-3"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (invalidPeriod) return;
                        save.mutate();
                    }}
                >
                    <Field label="คนที่จ่าย">
                        <Select value={memberId} onValueChange={handleMemberSelect}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="-- เลือกคน --" />
                            </SelectTrigger>
                            <SelectContent className="max-h-80">
                                {topic.members.map((m) => (
                                    <SelectItem key={m.id} value={String(m.id)}>
                                        {m.displayName} {m.remaining > 0 ? `(ค้าง ${formatBaht(m.remaining)})` : '✅ จ่ายครบ'}
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
                                {invalidPeriod ? (
                                    <p className="flex items-center gap-1 text-xs text-destructive">
                                        <AlertCircle className="size-3.5 shrink-0" />
                                        วันที่เริ่มต้นต้องไม่หลังวันที่สิ้นสุด
                                    </p>
                                ) : (
                                    periodDays > 0 && (
                                        <p className="text-xs text-muted-foreground">
                                            📅 รวม <span className="font-semibold text-foreground">{periodDays} วัน</span>
                                            {topic.dailyRate && topic.dailyRate > 0 && (
                                                <span> (วันละ {formatBaht(topic.dailyRate)} = <span className="font-semibold text-emerald-400">{formatBaht(periodDays * topic.dailyRate)}</span>)</span>
                                            )}
                                        </p>
                                    )
                                )}
                            </div>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Field
                            label="จำนวนเงิน (บาท)"
                            htmlFor="fund-pay-amount"
                            hint={selected ? `เป้าหมาย ${formatBaht(selected.target)} · จ่ายแล้ว ${formatBaht(selected.paid)} · ค้าง ${formatBaht(selected.remaining)}` : undefined}
                        >
                            <div className="flex gap-2">
                                <Input
                                    id="fund-pay-amount"
                                    type="number"
                                    min={0.01}
                                    step="0.01"
                                    inputMode="decimal"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    className="flex-1"
                                />
                                {!payment && selected && selected.remaining > 0 && Number(amount) !== selected.remaining && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setAmount(String(selected.remaining))}
                                        title="กรอกยอดคงค้างทั้งหมดของคนนี้"
                                    >
                                        ยอดค้าง ({formatBaht(selected.remaining)})
                                    </Button>
                                )}
                            </div>
                        </Field>
                    </div>
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
                    <Button type="submit" form="fund-payment-form" disabled={save.isPending || !memberId || !(Number(amount) > 0) || invalidPeriod}>
                        {save.isPending && <Loader2 className="animate-spin" />}
                        {payment ? 'บันทึกการแก้ไข' : 'บันทึก'}
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
    const [searchQuery, setSearchQuery] = useState('');
    const [periodStart, setPeriodStart] = useState('');
    const [periodEnd, setPeriodEnd] = useState('');
    const [amount, setAmount] = useState('');
    const [paidAt, setPaidAt] = useState('');
    const [note, setNote] = useState('');

    useEffect(() => {
        if (!open) return;
        const unpaid = topic.members.filter((m) => m.status !== 'paid').map((m) => m.id);
        setSelectedIds(unpaid.length > 0 ? unpaid : topic.members.map((m) => m.id));
        setSearchQuery('');
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

    const invalidPeriod = Boolean(periodStart && periodEnd && periodStart > periodEnd);

    const handlePeriodChange = (start: string, end: string) => {
        setPeriodStart(start);
        setPeriodEnd(end);
        if (start && end && start <= end) {
            const days = calculateDays(start, end);
            if (days > 0 && topic.dailyRate && topic.dailyRate > 0) {
                const autoAmount = roundMoney(days * topic.dailyRate);
                setAmount(String(autoAmount));
                setNote(`งวดวันที่ ${start} ถึง ${end} (${days} วัน)`);
            }
        }
    };

    const days = periodStart && periodEnd && !invalidPeriod ? calculateDays(periodStart, periodEnd) : 0;
    const totalCollected = roundMoney(selectedIds.length * Number(amount || 0));

    const filteredMembers = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return topic.members;
        return topic.members.filter((m) => m.displayName.toLowerCase().includes(q) || m.userId.includes(q));
    }, [topic.members, searchQuery]);

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
                note: note.trim(),
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
                        if (invalidPeriod) return;
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
                        {invalidPeriod ? (
                            <p className="flex items-center gap-1 text-xs text-destructive">
                                <AlertCircle className="size-3.5 shrink-0" />
                                วันที่เริ่มต้นต้องไม่หลังวันที่สิ้นสุด
                            </p>
                        ) : (
                            days > 0 && (
                                <p className="text-xs text-muted-foreground">
                                    📅 รวม <span className="font-semibold text-foreground">{days} วัน</span>
                                    {topic.dailyRate && topic.dailyRate > 0 && (
                                        <span> (วันละ {formatBaht(topic.dailyRate)} = <span className="font-semibold text-emerald-400">{formatBaht(days * topic.dailyRate)} ต่อคน</span>)</span>
                                    )}
                                </p>
                            )
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

                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                            <Label className="font-medium">เลือกคนที่จ่าย ({selectedIds.length}/{topic.members.length} คน)</Label>
                            <div className="flex gap-1">
                                <Button type="button" size="xs" variant="ghost" onClick={selectAll}>ทั้งหมด</Button>
                                <Button type="button" size="xs" variant="ghost" onClick={selectUnpaid}>เฉพาะค้าง</Button>
                                <Button type="button" size="xs" variant="ghost" onClick={selectNone}>ล้าง</Button>
                            </div>
                        </div>
                        {topic.members.length > 5 && (
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="ค้นหาชื่อสมาชิกในรายการ..."
                                    className="h-8 pl-8 text-xs"
                                />
                            </div>
                        )}
                        <div className="max-h-48 overflow-y-auto rounded-lg border divide-y bg-background p-1">
                            {filteredMembers.length === 0 ? (
                                <p className="py-4 text-center text-xs text-muted-foreground">ไม่พบสมาชิกที่ค้นหา</p>
                            ) : (
                                filteredMembers.map((m) => {
                                    const checked = selectedIds.includes(m.id);
                                    const checkboxId = `batch-member-${m.id}`;
                                    return (
                                        <div
                                            key={m.id}
                                            className="flex items-center justify-between gap-2 p-1.5 hover:bg-muted/50 rounded text-xs"
                                        >
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                <Checkbox
                                                    id={checkboxId}
                                                    checked={checked}
                                                    onCheckedChange={() => toggleMember(m.id)}
                                                />
                                                <Label htmlFor={checkboxId} className="truncate font-medium cursor-pointer flex-1">
                                                    {m.displayName}
                                                </Label>
                                            </div>
                                            <span className="text-muted-foreground tabular-nums shrink-0">
                                                {m.remaining > 0 ? `ค้าง ${formatBaht(m.remaining)}` : '✅ จ่ายครบแล้ว'}
                                            </span>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </form>
                <DialogFooter className="flex-row items-center justify-between sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                        ยอดรวมทั้งหมด: <span className="font-semibold text-emerald-400">{formatBaht(totalCollected)}</span>
                    </p>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            ยกเลิก
                        </Button>
                        <Button
                            type="submit"
                            form="fund-batch-form"
                            disabled={save.isPending || selectedIds.length === 0 || !(Number(amount) > 0) || invalidPeriod}
                        >
                            {save.isPending && <Loader2 className="animate-spin" />}
                            บันทึก {selectedIds.length} คน
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ==========================================
// 🎯 ยอดต้องจ่ายเฉพาะคน (กดที่ยอดเพื่อแก้)
// ==========================================
function TargetCell({ topic, member }: { topic: FundTopicDetail; member: FundMemberView }) {
    const guildId = useGuildId();
    const refresh = useFundRefresh();
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState('');
    const update = useMutation({
        mutationFn: (targetAmount: number | null) => fundApi.updateMember(guildId, topic.id, member.id, { targetAmount }),
        onSuccess: () => {
            toast.success('บันทึกยอดที่ต้องจ่ายแล้ว');
            setEditing(false);
            void refresh();
        },
        onError,
    });

    if (topic.closed) {
        return (
            <span className="inline-flex items-center gap-1.5 tabular-nums text-muted-foreground">
                {formatBaht(member.target)}
                {member.customTarget && (
                    <Badge variant="outline" className="text-[10px]">
                        เฉพาะคน
                    </Badge>
                )}
            </span>
        );
    }

    if (!editing) {
        return (
            <button
                type="button"
                className="group inline-flex items-center gap-1.5 rounded px-1 text-left tabular-nums hover:bg-muted"
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
// 💰 ยอดจ่ายแล้วรายคน (กดที่ยอดเพื่อแก้ไขยอดที่จ่ายแล้วได้โดยตรง)
// ==========================================
function PaidCell({ topic, member }: { topic: FundTopicDetail; member: FundMemberView }) {
    const guildId = useGuildId();
    const refresh = useFundRefresh();
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState('');
    const update = useMutation({
        mutationFn: (paidAmount: number) => fundApi.updateMember(guildId, topic.id, member.id, { paidAmount }),
        onSuccess: () => {
            toast.success('แก้ไขยอดที่จ่ายแล้วเรียบร้อย');
            setEditing(false);
            void refresh();
        },
        onError,
    });

    if (topic.closed) {
        return <span className="tabular-nums font-medium text-emerald-400">{formatBaht(member.paid)}</span>;
    }

    if (!editing) {
        return (
            <button
                type="button"
                className="group inline-flex items-center justify-end gap-1.5 rounded px-1 text-right tabular-nums font-medium text-emerald-400 hover:bg-muted"
                onClick={() => {
                    setValue(String(member.paid));
                    setEditing(true);
                }}
                title="กดเพื่อแก้ไขยอดที่จ่ายแล้วของคนนี้"
            >
                {formatBaht(member.paid)}
                <Pencil className="size-3 text-foreground opacity-0 group-hover:opacity-60" />
            </button>
        );
    }

    return (
        <form
            className="flex items-center justify-end gap-1"
            onSubmit={(event) => {
                event.preventDefault();
                update.mutate(Number(value || 0));
            }}
        >
            <Input type="number" min={0} step="0.01" value={value} onChange={(e) => setValue(e.target.value)} className="h-7 w-24 text-right" autoFocus />
            <Button type="submit" size="xs" disabled={update.isPending}>
                บันทึก
            </Button>
            <Button type="button" size="icon-xs" variant="ghost" onClick={() => setEditing(false)} aria-label="ยกเลิก">
                <X />
            </Button>
        </form>
    );
}

// ==========================================
// 👥 รายชื่อ + เพิ่ม/ลบคน + ค้นหา/กรอง/เรียงลำดับ
// ==========================================
type MemberFilter = 'all' | 'unpaid' | 'paid';
type MemberSort = 'default' | 'remaining_desc' | 'paid_desc' | 'name_asc';

function MembersTab({ topic, onPay }: { topic: FundTopicDetail; onPay: (member: FundMemberView | null) => void }) {
    const guildId = useGuildId();
    const refresh = useFundRefresh();
    const confirm = useConfirm();
    const { data: roles = [] } = useQuery(guildRolesQuery(guildId));
    const [roleId, setRoleId] = useState('');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<MemberFilter>('all');
    const [sortBy, setSortBy] = useState<MemberSort>('default');
    const [payingMemberId, setPayingMemberId] = useState<number | null>(null);

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
        mutationFn: async (member: FundMemberView) => {
            setPayingMemberId(member.id);
            return fundApi.addPayment(guildId, topic.id, { memberId: member.id, amount: member.remaining, note: 'จ่ายครบ' });
        },
        onSuccess: () => {
            toast.success('บันทึกว่าจ่ายครบแล้ว');
            void refresh();
        },
        onError,
        onSettled: () => setPayingMemberId(null),
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

    const unpaidCount = useMemo(() => topic.members.filter((m) => m.status !== 'paid').length, [topic.members]);
    const paidCount = useMemo(() => topic.members.filter((m) => m.status === 'paid').length, [topic.members]);

    const filteredMembers = useMemo(() => {
        const q = search.trim().toLowerCase();
        const filtered = topic.members.filter((m) => {
            if (statusFilter === 'paid' && m.status !== 'paid') return false;
            if (statusFilter === 'unpaid' && m.status === 'paid') return false;
            if (q && !m.displayName.toLowerCase().includes(q) && !m.userId.includes(q)) return false;
            return true;
        });

        if (sortBy === 'remaining_desc') {
            return [...filtered].sort((a, b) => b.remaining - a.remaining);
        }
        if (sortBy === 'paid_desc') {
            return [...filtered].sort((a, b) => b.paid - a.paid);
        }
        if (sortBy === 'name_asc') {
            return [...filtered].sort((a, b) => a.displayName.localeCompare(b.displayName, 'th'));
        }
        return filtered;
    }, [topic.members, search, statusFilter, sortBy]);

    return (
        <div className="space-y-3">
            {!topic.closed && (
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
                                {add.isPending ? <Loader2 className="animate-spin" /> : <Users />} เพิ่ม
                            </Button>
                        </div>
                    </Field>
                </div>
            )}

            {topic.members.length === 0 ? (
                <EmptyState>ยังไม่มีคนในหัวข้อนี้ — เพิ่มทีละคนหรือดึงทั้งยศด้านบน</EmptyState>
            ) : (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <Button
                                type="button"
                                size="xs"
                                variant={statusFilter === 'all' ? 'default' : 'outline'}
                                onClick={() => setStatusFilter('all')}
                            >
                                ทั้งหมด ({topic.members.length})
                            </Button>
                            <Button
                                type="button"
                                size="xs"
                                variant={statusFilter === 'unpaid' ? 'default' : 'outline'}
                                onClick={() => setStatusFilter('unpaid')}
                            >
                                ค้างชำระ ({unpaidCount})
                            </Button>
                            <Button
                                type="button"
                                size="xs"
                                variant={statusFilter === 'paid' ? 'default' : 'outline'}
                                onClick={() => setStatusFilter('paid')}
                            >
                                จ่ายครบแล้ว ({paidCount})
                            </Button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative w-48 sm:w-56">
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="ค้นหาชื่อ หรือ User ID..."
                                    className="h-8 pl-8 text-xs"
                                />
                                {search && (
                                    <button
                                        type="button"
                                        onClick={() => setSearch('')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        <X className="size-3.5" />
                                    </button>
                                )}
                            </div>
                            <Select value={sortBy} onValueChange={(v) => setSortBy(v as MemberSort)}>
                                <SelectTrigger className="h-8 w-40 text-xs">
                                    <ArrowUpDown className="mr-1 size-3 text-muted-foreground" />
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="default">เรียงตามลำดับเพิ่ม</SelectItem>
                                    <SelectItem value="remaining_desc">คงค้างมากสุด</SelectItem>
                                    <SelectItem value="paid_desc">จ่ายแล้วมากสุด</SelectItem>
                                    <SelectItem value="name_asc">ชื่อ (ก-ฮ / A-Z)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {filteredMembers.length === 0 ? (
                        <EmptyState>ไม่พบสมาชิกที่ตรงกับเงื่อนไขการค้นหา</EmptyState>
                    ) : (
                        <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/40 text-xs text-muted-foreground">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-medium">ชื่อสมาชิก</th>
                                        <th className="px-3 py-2 text-left font-medium">ต้องจ่าย</th>
                                        <th className="px-3 py-2 text-right font-medium">จ่ายแล้ว (กดแก้ได้)</th>
                                        <th className="px-3 py-2 text-right font-medium">คงค้าง</th>
                                        <th className="px-3 py-2 text-left font-medium">สถานะ</th>
                                        <th className="px-3 py-2" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredMembers.map((m) => {
                                        const isPayingThis = payingMemberId === m.id;
                                        return (
                                            <tr key={m.id} className="border-t transition-colors hover:bg-muted/20">
                                                <td className="px-3 py-2">
                                                    <div className="flex items-center gap-2">
                                                        <img src={m.avatar} alt="" className="size-7 rounded-full object-cover" />
                                                        <div className="min-w-0">
                                                            <p className="truncate font-medium">{m.displayName}</p>
                                                            <p className="truncate font-mono text-[11px] text-muted-foreground">{m.userId}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <TargetCell topic={topic} member={m} />
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                    <PaidCell topic={topic} member={m} />
                                                </td>
                                                <td className={cn('px-3 py-2 text-right tabular-nums', m.remaining > 0 ? 'font-medium text-amber-400' : 'text-muted-foreground')}>
                                                    {formatBaht(m.remaining)}
                                                </td>
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
                                                            <Button
                                                                size="xs"
                                                                variant="ghost"
                                                                disabled={topic.closed || payFull.isPending}
                                                                onClick={() => payFull.mutate(m)}
                                                                title={`บันทึกรับ ${formatBaht(m.remaining)}`}
                                                            >
                                                                {isPayingThis ? <Loader2 className="animate-spin" /> : <CheckCheck />} จ่ายครบ
                                                            </Button>
                                                        )}
                                                        <Button
                                                            size="icon-xs"
                                                            variant="ghost"
                                                            aria-label="ลบคน"
                                                            disabled={topic.closed}
                                                            onClick={() => void remove(m)}
                                                        >
                                                            <Trash2 className="text-destructive" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ==========================================
// 🧾 ประวัติการรับเงิน + ค้นหา + แก้ไข/ลบรายการ
// ==========================================
function PaymentsTab({ topic, onEditPayment }: { topic: FundTopicDetail; onEditPayment: (payment: FundPaymentView) => void }) {
    const guildId = useGuildId();
    const refresh = useFundRefresh();
    const confirm = useConfirm();
    const [search, setSearch] = useState('');

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

    const filteredPayments = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return topic.payments;
        return topic.payments.filter(
            (p) =>
                p.memberName.toLowerCase().includes(q) ||
                (p.note && p.note.toLowerCase().includes(q)) ||
                (p.recordedBy && p.recordedBy.toLowerCase().includes(q)),
        );
    }, [topic.payments, search]);

    const filteredTotal = useMemo(() => roundMoney(filteredPayments.reduce((acc, p) => acc + p.amount, 0)), [filteredPayments]);

    if (topic.payments.length === 0) return <EmptyState>ยังไม่มีรายการรับเงิน</EmptyState>;

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                    แสดง <span className="font-semibold text-foreground">{filteredPayments.length}</span> รายการ · ยอดรวม{' '}
                    <span className="font-semibold text-emerald-400">{formatBaht(filteredTotal)}</span>
                </p>
                <div className="relative w-56">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="ค้นหาชื่อคนจ่าย หรือหมายเหตุ..."
                        className="h-8 pl-8 text-xs"
                    />
                    {search && (
                        <button
                            type="button"
                            onClick={() => setSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                            <X className="size-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {filteredPayments.length === 0 ? (
                <EmptyState>ไม่พบรายการรับเงินที่ตรงกับการค้นหา</EmptyState>
            ) : (
                <ul className="divide-y rounded-lg border">
                    {filteredPayments.map((p) => {
                        const days = p.periodStart && p.periodEnd ? calculateDays(p.periodStart, p.periodEnd) : 0;
                        return (
                            <li key={p.id} className="flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted/20">
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
                                <div className="flex shrink-0 items-center gap-1">
                                    <Button
                                        size="icon-xs"
                                        variant="ghost"
                                        aria-label="แก้ไขรายการ"
                                        title="แก้ไขรายการรับเงิน"
                                        disabled={topic.closed}
                                        onClick={() => onEditPayment(p)}
                                    >
                                        <Pencil />
                                    </Button>
                                    <Button
                                        size="icon-xs"
                                        variant="ghost"
                                        aria-label="ลบรายการ"
                                        title="ลบรายการรับเงิน"
                                        disabled={topic.closed}
                                        onClick={() => void remove(p.id, `${p.memberName} ${formatBaht(p.amount)} (${formatDateTime(p.paidAt)})`)}
                                    >
                                        <Trash2 className="text-destructive" />
                                    </Button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

// ==========================================
// 📈 แดชบอร์ดกราฟ & สถิติวิเคราะห์ (Topic Analytics)
// ==========================================
const statusChartConfig = {
    paid: { label: 'จ่ายครบแล้ว', color: '#10b981' },
    partial: { label: 'จ่ายบางส่วน', color: '#f59e0b' },
    unpaid: { label: 'ยังไม่จ่าย', color: '#ef4444' },
} satisfies ChartConfig;

const timelineChartConfig = {
    daily: { label: 'รับเข้ารายวัน (บาท)', color: '#38bdf8' },
    cumulative: { label: 'ยอดสะสมรวม (บาท)', color: '#10b981' },
} satisfies ChartConfig;

const memberBarConfig = {
    paid: { label: 'จ่ายแล้ว (บาท)', color: '#10b981' },
    remaining: { label: 'คงค้าง (บาท)', color: '#f59e0b' },
} satisfies ChartConfig;

function TopicAnalyticsTab({ topic }: { topic: FundTopicDetail }) {
    // 1. สัดส่วนสถานะสมาชิก (Donut Chart)
    const statusData = useMemo(() => {
        const counts = { paid: 0, partial: 0, unpaid: 0 };
        for (const m of topic.members) {
            counts[m.status] = (counts[m.status] || 0) + 1;
        }
        return [
            { status: 'paid', label: 'จ่ายครบแล้ว', count: counts.paid, fill: '#10b981' },
            { status: 'partial', label: 'จ่ายบางส่วน', count: counts.partial, fill: '#f59e0b' },
            { status: 'unpaid', label: 'ยังไม่จ่าย', count: counts.unpaid, fill: '#ef4444' },
        ].filter((item) => item.count > 0);
    }, [topic.members]);

    // 2. แนวโน้มการรับเงินรายวัน & ยอดสะสม (Area / Bar Timeline)
    const timelineData = useMemo(() => {
        if (topic.payments.length === 0) return [];
        const byDate = new Map<string, number>();
        // เรียงจากเก่าไปใหม่
        const sorted = [...topic.payments].sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime());
        for (const p of sorted) {
            const d = new Date(p.paidAt);
            if (Number.isNaN(d.getTime())) continue;
            const key = toLocalInput(d).slice(0, 10); // YYYY-MM-DD
            byDate.set(key, roundMoney((byDate.get(key) ?? 0) + p.amount));
        }
        let cumulative = 0;
        return Array.from(byDate.entries()).map(([dateStr, daily]) => {
            cumulative = roundMoney(cumulative + daily);
            const [, month, day] = dateStr.split('-');
            return {
                date: `${day}/${month}`,
                fullDate: dateStr,
                daily,
                cumulative,
            };
        });
    }, [topic.payments]);

    // 3. ข้อมูลกราฟแท่งเปรียบเทียบรายคน (แสดงสูงสุด 12 คนแรก เรียงตามยอดจ่ายแล้ว + คงค้าง)
    const memberChartData = useMemo(() => {
        return [...topic.members]
            .sort((a, b) => b.paid - a.paid || b.remaining - a.remaining)
            .slice(0, 12)
            .map((m) => ({
                name: m.displayName.length > 14 ? `${m.displayName.slice(0, 13)}…` : m.displayName,
                paid: m.paid,
                remaining: m.remaining,
            }));
    }, [topic.members]);

    // 4. ตัวชี้วัดสำคัญ (KPIs)
    const avgPaidPerMember = topic.memberCount > 0 ? roundMoney(topic.collected / topic.memberCount) : 0;
    const avgPerPayment = topic.payments.length > 0 ? roundMoney(topic.collected / topic.payments.length) : 0;
    const completionRate = topic.memberCount > 0 ? Math.round((topic.paidCount / topic.memberCount) * 100) : 0;

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">📊 เฉลี่ยเก็บได้ต่อคน</p>
                    <p className="mt-1 text-base font-semibold tabular-nums text-emerald-400">{formatBaht(avgPaidPerMember)}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">💸 เฉลี่ยต่อรายการโอน</p>
                    <p className="mt-1 text-base font-semibold tabular-nums">{formatBaht(avgPerPayment)}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">✅ อัตราคนจ่ายครบ</p>
                    <p className="mt-1 text-base font-semibold tabular-nums">{completionRate}% ({topic.paidCount}/{topic.memberCount} คน)</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">🧾 จำนวนครั้งที่รับเงิน</p>
                    <p className="mt-1 text-base font-semibold tabular-nums">{topic.payments.length} รายการ</p>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                {/* กราฟโดนัทสัดส่วนสถานะสมาชิก */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                            <PieChartIcon className="size-4 text-primary" />
                            สัดส่วนสถานะการจ่ายของสมาชิก
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {statusData.length === 0 ? (
                            <EmptyState>ยังไม่มีสมาชิกในหัวข้อนี้</EmptyState>
                        ) : (
                            <ChartContainer config={statusChartConfig} className="aspect-auto h-64 w-full">
                                <PieChart>
                                    <ChartTooltip content={<ChartTooltipContent nameKey="status" />} />
                                    <Pie
                                        data={statusData}
                                        dataKey="count"
                                        nameKey="status"
                                        innerRadius={55}
                                        outerRadius={88}
                                        paddingAngle={3}
                                        strokeWidth={2}
                                    >
                                        {statusData.map((entry) => (
                                            <Cell key={entry.status} fill={entry.fill} />
                                        ))}
                                    </Pie>
                                    <ChartLegend content={<ChartLegendContent nameKey="status" />} className="flex-wrap gap-3 text-xs" />
                                </PieChart>
                            </ChartContainer>
                        )}
                    </CardContent>
                </Card>

                {/* กราฟแนวโน้มยอดเงินสะสมตามวันเวลา */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                            <TrendingUp className="size-4 text-emerald-400" />
                            แนวโน้มยอดเงินสะสม & รับเข้ารายวัน
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {timelineData.length === 0 ? (
                            <EmptyState>ยังไม่มีประวัติการรับเงินเพื่อแสดงกราฟแนวโน้ม</EmptyState>
                        ) : (
                            <ChartContainer config={timelineChartConfig} className="aspect-auto h-64 w-full">
                                <AreaChart data={timelineData} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
                                    <CartesianGrid vertical={false} />
                                    <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={20} />
                                    <YAxis tickLine={false} axisLine={false} width={48} />
                                    <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                                    <ChartLegend content={<ChartLegendContent />} />
                                    <Area
                                        type="monotone"
                                        dataKey="cumulative"
                                        stroke="var(--color-cumulative)"
                                        fill="var(--color-cumulative)"
                                        fillOpacity={0.2}
                                        strokeWidth={2}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="daily"
                                        stroke="var(--color-daily)"
                                        fill="var(--color-daily)"
                                        fillOpacity={0.15}
                                        strokeWidth={2}
                                    />
                                </AreaChart>
                            </ChartContainer>
                        )}
                    </CardContent>
                </Card>

                {/* กราฟแท่งเปรียบเทียบยอดจ่ายแล้ว vs คงค้าง รายบุคคล */}
                {memberChartData.length > 0 && (
                    <Card className="lg:col-span-2">
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                                <BarChart3 className="size-4 text-sky-400" />
                                ความคืบหน้ารายบุคคล (จ่ายแล้ว vs คงค้าง)
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ChartContainer config={memberBarConfig} className="aspect-auto h-72 w-full">
                                <BarChart data={memberChartData} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
                                    <CartesianGrid vertical={false} />
                                    <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} className="text-[11px]" />
                                    <YAxis tickLine={false} axisLine={false} width={48} />
                                    <ChartTooltip content={<ChartTooltipContent />} />
                                    <ChartLegend content={<ChartLegendContent />} />
                                    <Bar dataKey="paid" stackId="a" fill="var(--color-paid)" radius={[0, 0, 4, 4]} />
                                    <Bar dataKey="remaining" stackId="a" fill="var(--color-remaining)" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ChartContainer>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}

// ==========================================
// 📊 ส่งรายงานเข้า Discord
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
                <CardTitle className="text-base">📊 ส่งรายงานเข้า Discord</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <Field label="ห้องส่งรายงาน" hint={topic.reportChannelId ? `ส่งเข้า ${channelLabel(textChannels, topic.reportChannelId)}` : 'เลือกห้องก่อนส่งรายงาน'}>
                    <ChannelSelect channels={textChannels} value={topic.reportChannelId} onChange={(id) => saveChannel.mutate(id)} noneLabel="ยังไม่เลือก" disabled={saveChannel.isPending} />
                </Field>
                <div className="flex flex-wrap items-center gap-3">
                    <Label className="flex items-center gap-2 font-normal cursor-pointer">
                        <Checkbox checked={mentionUnpaid} onCheckedChange={(checked) => setMentionUnpaid(checked === true)} />
                        แท็กคนที่ยังจ่ายไม่ครบ
                    </Label>
                    <Button onClick={() => send.mutate()} disabled={send.isPending || !topic.reportChannelId}>
                        {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                        {send.isPending ? 'กำลังส่ง...' : 'ส่งรายงาน'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

// ==========================================
// 🗂️ แผงจัดการหัวข้อที่เลือก
// ==========================================
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
    const [editingPayment, setEditingPayment] = useState<FundPaymentView | null>(null);

    const toggleClosed = useMutation({
        mutationFn: (closed: boolean) => fundApi.update(guildId, topicId, { closed }),
        onSuccess: (topic) => {
            toast.success(topic.closed ? 'ปิดการเก็บเงินแล้ว' : 'เปิดการเก็บเงินอีกครั้ง');
            void refresh();
        },
        onError,
    });

    if (query.isLoading) return <LoadingState />;
    if (query.error) return <ErrorState error={query.error} />;
    const topic = query.data;
    if (!topic) return null;

    const handleExport = async () => {
        setExporting(true);
        try {
            // ส่งออกทันทีจากข้อมูลที่โหลดอยู่ในหน้าเว็บ (รวดเร็ว ไม่ติดปัญหา CORS/Session หมดอายุ)
            downloadFundCsvClient(topic);
            toast.success('ดาวน์โหลดไฟล์ CSV เรียบร้อยแล้ว');
        } catch {
            // Fallback เรียก API กรณีฉุกเฉิน
            try {
                await fundApi.exportCsv(guildId, topicId);
                toast.success('ดาวน์โหลดไฟล์ CSV เรียบร้อยแล้ว');
            } catch (err) {
                onError(err);
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
            onError(err);
        }
    };

    const pct = percent(topic.collected, topic.target);
    const remaining = Math.max(0, roundMoney(topic.target - topic.collected));

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="flex-row items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                        <CardTitle className="flex flex-wrap items-center gap-2">
                            <span className="truncate">{topic.name}</span>
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
                            title="ดาวน์โหลดข้อมูลสรุป รายชื่อสมาชิก และประวัติการรับเงินเป็นไฟล์ CSV (เปิดใน Excel ได้ทันที)"
                        >
                            {exporting ? <Loader2 className="animate-spin" /> : <Download />}
                            {exporting ? 'กำลังส่งออก...' : 'Export CSV'}
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
                    {topic.closed && (
                        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                            <Lock className="size-4 shrink-0" />
                            <span>หัวข้อนี้ปิดการเก็บเงินแล้ว — หากต้องการเพิ่ม/ลบคนหรือบันทึก/แก้ไขรับเงิน กรุณากด “เปิดอีกครั้ง” ด้านบน</span>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        {[
                            { label: '🎯 เป้าหมายรวม', value: formatBaht(topic.target), color: '' },
                            { label: '💵 เก็บได้แล้ว', value: formatBaht(topic.collected), color: 'text-emerald-400' },
                            { label: '⏳ คงค้างรวม', value: formatBaht(remaining), color: remaining > 0 ? 'text-amber-400' : '' },
                            { label: '👥 จ่ายครบ', value: `${topic.paidCount} / ${topic.memberCount} คน`, color: '' },
                        ].map((stat) => (
                            <div key={stat.label} className="rounded-lg border bg-muted/30 px-3 py-2">
                                <p className="text-xs text-muted-foreground">{stat.label}</p>
                                <p className={cn('text-lg font-semibold tabular-nums', stat.color)}>{stat.value}</p>
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center gap-3">
                        <ProgressBar value={pct} />
                        <span className="w-12 text-right text-sm font-medium tabular-nums">{pct}%</span>
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
                                <TabsTrigger value="analytics">📊 แดชบอร์ด & กราฟ</TabsTrigger>
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
                            />
                        </TabsContent>
                        <TabsContent value="payments">
                            <PaymentsTab
                                topic={topic}
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
            <BatchPaymentDialog topic={topic} open={batchOpen} onOpenChange={setBatchOpen} />
        </div>
    );
}

// ==========================================
// 📊 ภาพรวมทุกหัวข้อของเซิร์ฟเวอร์ (Global Overview Banner & Chart)
// ==========================================
const overviewTopicsChartConfig = {
    collected: { label: 'เก็บได้แล้ว (บาท)', color: '#10b981' },
    remaining: { label: 'คงค้าง (บาท)', color: '#f59e0b' },
} satisfies ChartConfig;

function FundsOverviewSummary({ topics }: { topics: FundTopicSummary[] }) {
    const [showChart, setShowChart] = useState(false);

    const totals = useMemo(() => {
        let target = 0;
        let collected = 0;
        let activeCount = 0;
        for (const t of topics) {
            target = roundMoney(target + t.target);
            collected = roundMoney(collected + t.collected);
            if (!t.closed) activeCount++;
        }
        const remaining = Math.max(0, roundMoney(target - collected));
        const pct = percent(collected, target);
        return { target, collected, remaining, activeCount, pct };
    }, [topics]);

    const chartData = useMemo(() => {
        return topics.slice(0, 10).map((t) => ({
            name: t.name.length > 16 ? `${t.name.slice(0, 15)}…` : t.name,
            collected: t.collected,
            remaining: Math.max(0, roundMoney(t.target - t.collected)),
        }));
    }, [topics]);

    if (topics.length <= 1) return null;

    return (
        <Card className="mb-4">
            <CardContent className="pt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="size-4 text-primary" />
                        <span className="text-sm font-semibold">ภาพรวมกองกลางทั้งหมด ({topics.length} หัวข้อ · เปิดอยู่ {totals.activeCount})</span>
                    </div>
                    <Button variant="ghost" size="xs" onClick={() => setShowChart((v) => !v)}>
                        <BarChart3 className="size-3.5" />
                        {showChart ? 'ซ่อนกราฟเปรียบเทียบ' : 'ดูกราฟเปรียบเทียบทุกหัวข้อ'}
                    </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div className="rounded-lg border bg-muted/20 px-3 py-2">
                        <p className="text-xs text-muted-foreground">เป้ารวมทุกหัวข้อ</p>
                        <p className="text-base font-semibold tabular-nums">{formatBaht(totals.target)}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 px-3 py-2">
                        <p className="text-xs text-muted-foreground">เก็บได้รวมทั้งหมด</p>
                        <p className="text-base font-semibold tabular-nums text-emerald-400">{formatBaht(totals.collected)}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 px-3 py-2">
                        <p className="text-xs text-muted-foreground">ยอดคงค้างรวม</p>
                        <p className="text-base font-semibold tabular-nums text-amber-400">{formatBaht(totals.remaining)}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 px-3 py-2">
                        <p className="text-xs text-muted-foreground">ความคืบหน้ารวม</p>
                        <p className="text-base font-semibold tabular-nums">{totals.pct}%</p>
                    </div>
                </div>

                {showChart && (
                    <div className="pt-2">
                        <ChartContainer config={overviewTopicsChartConfig} className="aspect-auto h-60 w-full">
                            <BarChart data={chartData} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
                                <CartesianGrid vertical={false} />
                                <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} className="text-xs" />
                                <YAxis tickLine={false} axisLine={false} width={48} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <ChartLegend content={<ChartLegendContent />} />
                                <Bar dataKey="collected" stackId="a" fill="var(--color-collected)" radius={[0, 0, 4, 4]} />
                                <Bar dataKey="remaining" stackId="a" fill="var(--color-remaining)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function TopicListItem({ topic, active, onSelect }: { topic: FundTopicSummary; active: boolean; onSelect: () => void }) {
    const pct = percent(topic.collected, topic.target);
    return (
        <button
            type="button"
            onClick={onSelect}
            className={cn(
                'w-full space-y-2 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted/50',
                active && 'border-primary bg-primary/5',
                topic.closed && 'opacity-70',
            )}
        >
            <div className="flex items-center justify-between gap-2">
                <p className="truncate font-medium">{topic.name}</p>
                {topic.closed && <Lock className="size-3.5 shrink-0 text-muted-foreground" />}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                {topic.dailyRate && topic.dailyRate > 0 && (
                    <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                        วันละ {formatBaht(topic.dailyRate)}
                    </Badge>
                )}
                <span className="text-[11px] font-medium text-muted-foreground ml-auto tabular-nums">{pct}%</span>
            </div>
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
    const [topicSearch, setTopicSearch] = useState('');

    const select = (topic: number | undefined) => void navigate({ to: '/servers/$guildId/funds', params: { guildId }, search: { topic }, replace: true });
    const topics = list.data ?? [];

    const filteredTopics = useMemo(() => {
        const q = topicSearch.trim().toLowerCase();
        if (!q) return topics;
        return topics.filter((t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
    }, [topics, topicSearch]);

    const current = topics.find((t) => t.id === selectedId) ?? topics[0];

    return (
        <>
            <PageHeader
                help="funds"
                title="เก็บเงินตามเป้า"
                description="สร้างหัวข้อเก็บเงินได้หลายเรื่อง ตั้งยอดคงที่หรือรายวัน เพิ่ม/ลบคน บันทึกและแก้ไขการรับเงิน วิเคราะห์กราฟแดชบอร์ด ส่งออก CSV และส่งรายงานเข้า Discord"
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
                <>
                    <FundsOverviewSummary topics={topics} />
                    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
                        <div className="space-y-2">
                            {topics.length > 3 && (
                                <div className="relative">
                                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        value={topicSearch}
                                        onChange={(e) => setTopicSearch(e.target.value)}
                                        placeholder="ค้นหาหัวข้อ..."
                                        className="h-8 pl-8 text-xs"
                                    />
                                    {topicSearch && (
                                        <button
                                            type="button"
                                            onClick={() => setTopicSearch('')}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        >
                                            <X className="size-3.5" />
                                        </button>
                                    )}
                                </div>
                            )}
                            {filteredTopics.length === 0 ? (
                                <p className="py-4 text-center text-xs text-muted-foreground">ไม่พบหัวข้อที่ค้นหา</p>
                            ) : (
                                filteredTopics.map((topic) => (
                                    <TopicListItem key={topic.id} topic={topic} active={topic.id === current?.id} onSelect={() => select(topic.id)} />
                                ))
                            )}
                        </div>
                        {current && <TopicPanel key={current.id} topicId={current.id} onDeleted={() => select(undefined)} />}
                    </div>
                </>
            )}

            <TopicDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={(topic) => select(topic.id)} />
        </>
    );
}
