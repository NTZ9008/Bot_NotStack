import { calculateDailyAmount, calculateDays, type FundTopicDetail, type FundTopicSummary } from '@notstack/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { fundApi } from '@/api/fund';
import { guildChannelsQuery } from '@/api/guilds';
import { ChannelSelect } from '@/components/channel-select';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useGuildId } from '@/hooks/use-guild';
import { dailyRateOf, dueDateIso, onFundError, startOfDayIso, toDateInput, useFundRefresh } from './utils';

// ==========================================
// 📝 สร้าง / แก้ไขหัวข้อเก็บเงิน (ยอดคงที่ต่อคน หรือเก็บรายวัน)
// ==========================================
export function TopicDialog({
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
        setMode(topic && dailyRateOf(topic) ? 'daily' : 'fixed');
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
                ? manualAmount
                    ? Number(amount || 0)
                    : computedDailyTotal > 0
                      ? computedDailyTotal
                      : Number(amount || 0)
                : Number(amount || 0);

            const input = {
                name: name.trim(),
                description: description.trim(),
                amountPerMember: targetPerMember,
                dailyRate: rate,
                startDate: isDaily && startDate ? startOfDayIso(startDate) : null,
                dueDate: dueDateIso(dueDate),
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
        onError: onFundError,
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
                        <Input
                            id="fund-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="เช่น ค่ากองกลางกลุ่ม / เก็บเงินรายวัน"
                            maxLength={100}
                            autoFocus
                        />
                    </Field>
                    <Field label="รายละเอียด (ไม่บังคับ)" htmlFor="fund-desc">
                        <Textarea
                            id="fund-desc"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={2}
                            maxLength={500}
                            placeholder="เลขบัญชี / พร้อมเพย์ / วิธีโอน / หมายเหตุ"
                        />
                    </Field>

                    <Field label="รูปแบบการเก็บเงิน">
                        <div className="grid grid-cols-2 gap-2">
                            <Button type="button" size="sm" variant={mode === 'fixed' ? 'default' : 'outline'} onClick={() => setMode('fixed')}>
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
                                <Input
                                    id="fund-amount"
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    inputMode="decimal"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="0"
                                />
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
