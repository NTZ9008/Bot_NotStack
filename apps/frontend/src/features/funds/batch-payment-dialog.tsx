import { formatBaht, roundMoney, type FundTopicDetail } from '@notstack/shared';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { fundApi } from '@/api/fund';
import { Field } from '@/components/field';
import { SearchInput } from '@/components/search-input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useGuildId } from '@/hooks/use-guild';
import { toLocalInput } from '@/lib/format';
import { PeriodFields } from './period-fields';
import { dailyRateOf, defaultPeriod, endOfDayIso, onFundError, periodAmount, periodNote, startOfDayIso, useFundRefresh } from './utils';

const allIdsOf = (topic: FundTopicDetail) => topic.members.map((m) => m.id);
const unpaidIdsOf = (topic: FundTopicDetail) => topic.members.filter((m) => m.status !== 'paid').map((m) => m.id);

// ==========================================
// 📅 บันทึกการรับเงินเป็นกลุ่ม / หลายคนตามห้วงเวลา
// ==========================================
export function BatchPaymentDialog({ topic, open, onOpenChange }: { topic: FundTopicDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
    const guildId = useGuildId();
    const refresh = useFundRefresh();
    const dailyRate = dailyRateOf(topic);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [periodStart, setPeriodStart] = useState('');
    const [periodEnd, setPeriodEnd] = useState('');
    const [amount, setAmount] = useState('');
    const [paidAt, setPaidAt] = useState('');
    const [note, setNote] = useState('');

    useEffect(() => {
        if (!open) return;
        const unpaid = unpaidIdsOf(topic);
        setSelectedIds(unpaid.length > 0 ? unpaid : allIdsOf(topic));
        setSearchQuery('');
        setPaidAt(toLocalInput(new Date()));
        const { start, end } = defaultPeriod(topic);
        setPeriodStart(start);
        setPeriodEnd(end);
        if (dailyRate) {
            const { days, amount: total } = periodAmount(topic, start, end);
            setAmount(String(total));
            setNote(periodNote(start, end, days));
        } else {
            setAmount(String(topic.amountPerMember || ''));
            setNote('');
        }
    }, [open, topic, dailyRate]);

    const handlePeriodChange = (start: string, end: string) => {
        setPeriodStart(start);
        setPeriodEnd(end);
        const { days, amount: auto } = periodAmount(topic, start, end);
        if (auto > 0) {
            setAmount(String(auto));
            setNote(periodNote(start, end, days));
        }
    };

    const invalidPeriod = Boolean(periodStart && periodEnd && periodStart > periodEnd);
    const totalCollected = roundMoney(selectedIds.length * Number(amount || 0));

    const filteredMembers = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return topic.members;
        return topic.members.filter((m) => m.displayName.toLowerCase().includes(q) || m.userId.includes(q));
    }, [topic.members, searchQuery]);

    const toggleMember = (id: number) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

    const save = useMutation({
        mutationFn: () =>
            fundApi.batchPayment(guildId, topic.id, {
                memberIds: selectedIds,
                amount: Number(amount),
                note: note.trim(),
                paidAt: paidAt ? new Date(paidAt).toISOString() : null,
                periodStart: periodStart ? startOfDayIso(periodStart) : null,
                periodEnd: periodEnd ? endOfDayIso(periodEnd) : null,
            }),
        onSuccess: (res) => {
            toast.success(res.message ?? 'บันทึกการรับเงินเรียบร้อยแล้ว');
            void refresh();
            onOpenChange(false);
        },
        onError: onFundError,
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
                        <PeriodFields
                            idPrefix="batch"
                            start={periodStart}
                            end={periodEnd}
                            onChange={handlePeriodChange}
                            dailyRate={dailyRate}
                            amountSuffix=" ต่อคน"
                        />
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
                            <Input id="batch-paid-at" type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
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
                            <Label className="font-medium">
                                เลือกคนที่จ่าย ({selectedIds.length}/{topic.members.length} คน)
                            </Label>
                            <div className="flex gap-1">
                                <Button type="button" size="xs" variant="ghost" onClick={() => setSelectedIds(allIdsOf(topic))}>
                                    ทั้งหมด
                                </Button>
                                <Button type="button" size="xs" variant="ghost" onClick={() => setSelectedIds(unpaidIdsOf(topic))}>
                                    เฉพาะค้าง
                                </Button>
                                <Button type="button" size="xs" variant="ghost" onClick={() => setSelectedIds([])}>
                                    ล้าง
                                </Button>
                            </div>
                        </div>
                        {topic.members.length > 5 && <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="ค้นหาชื่อสมาชิกในรายการ..." />}
                        <div className="max-h-48 overflow-y-auto rounded-lg border divide-y bg-background p-1">
                            {filteredMembers.length === 0 ? (
                                <p className="py-4 text-center text-xs text-muted-foreground">ไม่พบสมาชิกที่ค้นหา</p>
                            ) : (
                                filteredMembers.map((m) => {
                                    const checkboxId = `batch-member-${m.id}`;
                                    return (
                                        <div key={m.id} className="flex items-center justify-between gap-2 p-1.5 hover:bg-muted/50 rounded text-xs">
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                <Checkbox id={checkboxId} checked={selectedIds.includes(m.id)} onCheckedChange={() => toggleMember(m.id)} />
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
