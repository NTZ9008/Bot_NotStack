import { tr } from '../../lib/i18n';
import { roundMoney, type FundTopicDetail } from '@notstack/shared';
import { formatBaht } from './money';
import { DateTimeInput } from '@/components/date-time-input';
import { useMutation } from '@tanstack/react-query';
import { Calendar, CheckCircle2, Loader2 } from '@/components/icons';
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
export function BatchPaymentDialog({
    topic,
    initialMemberIds = null,
    open,
    onOpenChange,
}: {
    topic: FundTopicDetail;
    initialMemberIds?: number[] | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
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
        if (initialMemberIds && initialMemberIds.length > 0) {
            setSelectedIds(initialMemberIds);
        } else {
            const unpaid = unpaidIdsOf(topic);
            setSelectedIds(unpaid.length > 0 ? unpaid : allIdsOf(topic));
        }
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
    }, [open, topic, dailyRate, initialMemberIds]);

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
    const numAmount = Number(amount || 0);
    const totalCollected = roundMoney(selectedIds.length * numAmount);

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
            toast.success(res.message ?? tr('funds.paymentRecorded'));
            void refresh();
            onOpenChange(false);
        },
        onError: onFundError,
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{tr('funds.recordPaymentsForAPeriodMultiple')}</DialogTitle>
                    <DialogDescription>
                        {topic.name} {tr('funds.recordDailyOrPerPeriodAmounts')}
                    </DialogDescription>
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
                    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                            <Calendar className="size-3.5 text-primary" /> {tr('funds.setThePaymentPeriod')}
                        </p>
                        <PeriodFields
                            idPrefix="batch"
                            start={periodStart}
                            end={periodEnd}
                            onChange={handlePeriodChange}
                            dailyRate={dailyRate}
                            topicStartDate={topic.startDate}
                            amountSuffix={tr('funds.perPerson')}
                        />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label={tr('funds.amountPerPersonThb2')} htmlFor="batch-amount">
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
                        <Field label={tr('funds.paymentDateTime')} htmlFor="batch-paid-at">
                            <DateTimeInput mode="datetime" id="batch-paid-at" value={paidAt} onValueChange={(v) => setPaidAt(v)} />
                        </Field>
                    </div>

                    <Field label={tr('funds.noteOptional')} htmlFor="batch-note">
                        <Input
                            id="batch-note"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            maxLength={200}
                            placeholder={tr('funds.eGPeriod0110To')}
                        />
                    </Field>

                    <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                            <Label className="font-medium">
                                {tr('funds.pickWhoPaid')}
                                {selectedIds.length}/{topic.members.length} {tr('funds.people')}
                            </Label>
                            <div className="flex flex-wrap gap-1">
                                <Button type="button" size="xs" variant="ghost" onClick={() => setSelectedIds(allIdsOf(topic))}>
                                    {tr('funds.all')}
                                    {topic.members.length})
                                </Button>
                                <Button type="button" size="xs" variant="ghost" onClick={() => setSelectedIds(unpaidIdsOf(topic))}>
                                    {tr('funds.outstandingOnly')}
                                    {unpaidIdsOf(topic).length})
                                </Button>
                                <Button type="button" size="xs" variant="ghost" onClick={() => setSelectedIds([])}>
                                    {tr('common.clear')}
                                </Button>
                            </div>
                        </div>
                        {topic.members.length > 5 && (
                            <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder={tr('funds.searchMembersInTheList')} />
                        )}
                        <div className="max-h-48 divide-y overflow-y-auto rounded-lg border bg-background p-1">
                            {filteredMembers.length === 0 ? (
                                <p className="py-4 text-center text-xs text-muted-foreground">{tr('funds.noMembersFound')}</p>
                            ) : (
                                filteredMembers.map((m) => {
                                    const checkboxId = `batch-member-${m.id}`;
                                    return (
                                        <div key={m.id} className="flex items-center justify-between gap-2 rounded p-1.5 text-xs hover:bg-muted/50">
                                            <div className="flex min-w-0 flex-1 items-center gap-2">
                                                <Checkbox id={checkboxId} checked={selectedIds.includes(m.id)} onCheckedChange={() => toggleMember(m.id)} />
                                                <img src={m.avatar} alt="" className="size-5 shrink-0 rounded-full object-cover" />
                                                <Label htmlFor={checkboxId} className="flex-1 cursor-pointer truncate font-medium">
                                                    {m.displayName}
                                                </Label>
                                            </div>
                                            <span className="shrink-0 text-muted-foreground tabular-nums">
                                                {m.remaining > 0 ? (
                                                    tr('funds.owes2', { 0: formatBaht(m.remaining) })
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                                                        <CheckCircle2 className="size-3" /> {tr('funds.fullyPaid2')}
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </form>
                <DialogFooter className="flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-muted-foreground">
                        <span>
                            {tr('funds.totalReceived')}
                            {selectedIds.length} {tr('funds.people2')}{' '}
                        </span>
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">{formatBaht(totalCollected)}</span>
                    </div>
                    <div className="flex w-full justify-end gap-2 sm:w-auto">
                        <Button variant="outline" className="flex-1 sm:flex-initial" onClick={() => onOpenChange(false)}>
                            {tr('common.cancel')}
                        </Button>
                        <Button
                            type="submit"
                            form="fund-batch-form"
                            className="flex-1 sm:flex-initial"
                            disabled={save.isPending || selectedIds.length === 0 || !(numAmount > 0) || invalidPeriod}
                        >
                            {save.isPending && <Loader2 className="animate-spin" />}
                            {tr('common.save')} {selectedIds.length} {tr('common.people')}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
