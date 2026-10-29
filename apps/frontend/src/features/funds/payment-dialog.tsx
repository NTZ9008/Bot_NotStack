import { formatBaht, roundMoney, type FundMemberView, type FundPaymentView, type FundTopicDetail } from '@notstack/shared';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Calendar, CheckCircle2, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { fundApi } from '@/api/fund';
import { Field } from '@/components/field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGuildId } from '@/hooks/use-guild';
import { toLocalInput } from '@/lib/format';
import { PeriodFields } from './period-fields';
import {
    dailyRateOf,
    defaultPeriod,
    endOfDayIso,
    isAutoPeriodNote,
    onFundError,
    periodAmount,
    periodNote,
    startOfDayIso,
    toDateInput,
    useFundRefresh,
} from './utils';

const remainingOf = (member: FundMemberView | null | undefined) => (member && member.remaining > 0 ? String(member.remaining) : '');

// ==========================================
// 💵 บันทึก / แก้ไขการรับเงิน (รายคน / รายรายการ) + ปุ่มกดยอดด่วน + ตัวอย่างยอดหลังจ่าย
// ==========================================
export function PaymentDialog({
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
    const dailyRate = dailyRateOf(topic);
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
            setUsePeriod(Boolean(payment.periodStart && payment.periodEnd));
            setPeriodStart(toDateInput(payment.periodStart));
            setPeriodEnd(toDateInput(payment.periodEnd));
            return;
        }

        const initialMember = member ?? topic.members.find((m) => m.remaining > 0) ?? topic.members[0] ?? null;
        setMemberId(initialMember ? String(initialMember.id) : '');
        setNote('');
        setPaidAt(toLocalInput(new Date()));
        setUsePeriod(Boolean(dailyRate));
        if (!dailyRate) {
            setPeriodStart('');
            setPeriodEnd('');
            setAmount(remainingOf(initialMember));
            return;
        }
        // หัวข้อรายวัน: ตั้งห้วงเวลาเริ่มต้นให้ แล้วใช้ยอดค้างของคนนั้น (หรือยอดตามจำนวนวันถ้าไม่ค้าง)
        const { start, end } = defaultPeriod(topic);
        const { days, amount: calc } = periodAmount(topic, start, end);
        setPeriodStart(start);
        setPeriodEnd(end);
        if (days > 0) {
            setAmount(remainingOf(initialMember) || String(calc));
            setNote(periodNote(start, end, days));
        } else {
            setAmount(remainingOf(initialMember));
        }
    }, [open, member, payment, topic, dailyRate]);

    const handleMemberSelect = (newId: string) => {
        setMemberId(newId);
        if (payment) return;
        const targetMember = topic.members.find((m) => String(m.id) === newId);
        if (targetMember && targetMember.remaining > 0 && !usePeriod) setAmount(String(targetMember.remaining));
    };

    const handlePeriodChange = (start: string, end: string) => {
        setPeriodStart(start);
        setPeriodEnd(end);
        const { days, amount: auto } = periodAmount(topic, start, end);
        if (auto > 0) {
            setAmount(String(auto));
            setNote((prev) => (isAutoPeriodNote(prev) ? periodNote(start, end, days) : prev));
        }
    };

    const invalidPeriod = Boolean(usePeriod && periodStart && periodEnd && periodStart > periodEnd);
    const selected = topic.members.find((m) => String(m.id) === memberId);
    const numAmount = Number(amount) || 0;

    // คำนวณยอดก่อน-หลังจ่ายให้เห็นชัดเจนก่อนกดบันทึก
    const balancePreview = useMemo(() => {
        if (!selected || !(numAmount > 0)) return null;
        const basePaid = payment && payment.memberId === selected.id ? Math.max(0, roundMoney(selected.paid - payment.amount)) : selected.paid;
        const nextPaid = roundMoney(basePaid + numAmount);
        const nextRemaining = Math.max(0, roundMoney(selected.target - nextPaid));
        return { basePaid, nextPaid, nextRemaining, willComplete: nextRemaining === 0 && selected.target > 0 };
    }, [selected, numAmount, payment]);

    // ปุ่มลัดเลือกจำนวนเงิน
    const quickAmounts = useMemo(() => {
        const list: { label: string; value: number }[] = [];
        if (selected && selected.remaining > 0) {
            list.push({ label: `ยอดค้าง (${formatBaht(selected.remaining)})`, value: selected.remaining });
            if (selected.remaining >= 20) {
                const half = roundMoney(selected.remaining / 2);
                if (half > 0 && half !== selected.remaining) {
                    list.push({ label: `ครึ่งหนึ่ง (${formatBaht(half)})`, value: half });
                }
            }
        }
        if (dailyRate) {
            for (const d of [1, 7, 15, 30]) {
                const val = roundMoney(dailyRate * d);
                if (!list.some((item) => item.value === val)) {
                    list.push({ label: `${d} วัน (${formatBaht(val)})`, value: val });
                }
            }
        }
        return list.slice(0, 5);
    }, [selected, dailyRate]);

    const save = useMutation({
        mutationFn: () => {
            const payload = {
                memberId: Number(memberId),
                amount: Number(amount),
                note: note.trim(),
                paidAt: paidAt ? new Date(paidAt).toISOString() : null,
                periodStart: usePeriod && periodStart ? startOfDayIso(periodStart) : null,
                periodEnd: usePeriod && periodEnd ? endOfDayIso(periodEnd) : null,
            };
            return payment ? fundApi.updatePayment(guildId, topic.id, payment.id, payload) : fundApi.addPayment(guildId, topic.id, payload);
        },
        onSuccess: () => {
            toast.success(payment ? 'แก้ไขรายการรับเงินแล้ว' : 'บันทึกการรับเงินแล้ว');
            void refresh();
            onOpenChange(false);
        },
        onError: onFundError,
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

                    <div className="space-y-2 rounded-lg border bg-muted/20 p-2.5">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="toggle-period" className="flex cursor-pointer items-center gap-1.5 text-xs font-medium">
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
                                        const { start, end } = defaultPeriod(topic);
                                        handlePeriodChange(start, end);
                                    }
                                }}
                            />
                        </div>
                        {usePeriod && (
                            <div className="space-y-2 pt-1">
                                <PeriodFields
                                    idPrefix="pay"
                                    start={periodStart}
                                    end={periodEnd}
                                    onChange={handlePeriodChange}
                                    dailyRate={dailyRate}
                                    topicStartDate={topic.startDate}
                                />
                            </div>
                        )}
                    </div>

                    <Field
                        label="จำนวนเงิน (บาท)"
                        htmlFor="fund-pay-amount"
                        hint={
                            selected
                                ? `เป้าหมาย ${formatBaht(selected.target)} · จ่ายแล้ว ${formatBaht(selected.paid)} · ค้าง ${formatBaht(selected.remaining)}`
                                : undefined
                        }
                    >
                        <div className="space-y-2">
                            <Input
                                id="fund-pay-amount"
                                type="number"
                                min={0.01}
                                step="0.01"
                                inputMode="decimal"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                            />
                            {quickAmounts.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1">
                                    {quickAmounts.map((q) => (
                                        <Button
                                            key={q.label}
                                            type="button"
                                            size="xs"
                                            variant={numAmount === q.value ? 'default' : 'outline'}
                                            className="h-6 px-2 text-[11px]"
                                            onClick={() => setAmount(String(q.value))}
                                        >
                                            {q.label}
                                        </Button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </Field>

                    {balancePreview && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-xs">
                            <div className="flex items-center gap-1.5 tabular-nums">
                                <span className="text-muted-foreground">จ่ายสะสม: {formatBaht(balancePreview.basePaid)}</span>
                                <ArrowRight className="size-3 text-muted-foreground" />
                                <span className="font-semibold text-emerald-400">{formatBaht(balancePreview.nextPaid)}</span>
                            </div>
                            {balancePreview.willComplete ? (
                                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/15 text-[11px] text-emerald-400">
                                    <CheckCircle2 className="size-3" /> จ่ายครบตามเป้า!
                                </Badge>
                            ) : (
                                <span className="font-medium text-amber-400 tabular-nums">คงค้างเหลือ {formatBaht(balancePreview.nextRemaining)}</span>
                            )}
                        </div>
                    )}

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
                    <Button type="submit" form="fund-payment-form" disabled={save.isPending || !memberId || !(numAmount > 0) || invalidPeriod}>
                        {save.isPending && <Loader2 className="animate-spin" />}
                        {payment ? 'บันทึกการแก้ไข' : 'บันทึกการรับเงิน'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
