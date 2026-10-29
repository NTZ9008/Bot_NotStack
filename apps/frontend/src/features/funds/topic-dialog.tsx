import { calculateDailyAmount, calculateDays, formatBaht, type FundTopicDetail, type FundTopicSummary } from '@notstack/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2, Sparkles } from 'lucide-react';
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
import {
    TOPIC_TEMPLATES,
    currentMonthRange,
    dailyRateOf,
    dueDateIso,
    onFundError,
    shiftDateInput,
    startOfDayIso,
    toDateInput,
    todayInput,
    useFundRefresh,
    type TopicTemplate,
} from './utils';

const FIXED_AMOUNT_PRESETS = [100, 150, 300, 500, 1000] as const;
const DAILY_RATE_PRESETS = [10, 15, 20, 50] as const;

// ==========================================
// 📝 สร้าง / แก้ไขหัวข้อเก็บเงิน (ยอดคงที่ต่อคน หรือเก็บรายวัน) + ปุ่มลัดเทมเพลต & ยอดเงิน
// ==========================================
export function TopicDialog({
    open,
    onOpenChange,
    topic,
    initialTemplate = null,
    onSaved,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    topic?: FundTopicSummary;
    initialTemplate?: TopicTemplate | null;
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

    const applyTemplate = (tpl: TopicTemplate) => {
        setName(tpl.name);
        setDescription(tpl.description);
        setMode(tpl.mode);
        setAmount(tpl.amount);
        setManualAmount(false);
        setDailyRate(tpl.dailyRate);
        if (tpl.mode === 'daily') {
            const { start, end } = currentMonthRange();
            setStartDate(start);
            setDueDate(end);
        }
    };

    useEffect(() => {
        if (!open) return;
        if (!topic && initialTemplate) {
            setName(initialTemplate.name);
            setDescription(initialTemplate.description);
            setMode(initialTemplate.mode);
            setAmount(initialTemplate.amount);
            setManualAmount(false);
            setDailyRate(initialTemplate.dailyRate);
            if (initialTemplate.mode === 'daily') {
                const { start, end } = currentMonthRange();
                setStartDate(start);
                setDueDate(end);
            } else {
                setStartDate('');
                setDueDate('');
            }
            setReportChannelId('');
            return;
        }
        setName(topic?.name ?? '');
        setDescription(topic?.description ?? '');
        setMode(topic && dailyRateOf(topic) ? 'daily' : 'fixed');
        setAmount(topic ? String(topic.amountPerMember) : '');
        setManualAmount(false);
        setDailyRate(topic?.dailyRate ? String(topic.dailyRate) : '15');
        setStartDate(toDateInput(topic?.startDate ?? null));
        setDueDate(toDateInput(topic?.dueDate ?? null));
        setReportChannelId(topic?.reportChannelId ?? '');
    }, [open, topic, initialTemplate]);

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

    const applyDuePreset = (kind: '7d' | '15d' | 'month_end') => {
        const today = todayInput();
        if (kind === '7d') setDueDate(shiftDateInput(today, 7));
        else if (kind === '15d') setDueDate(shiftDateInput(today, 15));
        else setDueDate(currentMonthRange().end);
        setManualAmount(false);
    };

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
                    {!topic && (
                        <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-muted/20 px-2.5 py-2">
                            <span className="mr-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                                <Sparkles className="size-3 text-primary" /> เทมเพลตด่วน:
                            </span>
                            {TOPIC_TEMPLATES.map((tpl) => (
                                <Button
                                    key={tpl.id}
                                    type="button"
                                    size="xs"
                                    variant="outline"
                                    className="h-6 px-2 text-[11px]"
                                    onClick={() => applyTemplate(tpl)}
                                >
                                    {tpl.emoji} {tpl.title}
                                </Button>
                            ))}
                        </div>
                    )}

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
                    <Field
                        label="รายละเอียด / ช่องทางโอนเงิน (ไม่บังคับ)"
                        htmlFor="fund-desc"
                        hint="หากใส่เบอร์พร้อมเพย์หรือเลขบัญชี 10–15 หลัก จะมีปุ่มคัดลอกเลขบัญชีให้สมาชิกกดได้ทันที"
                    >
                        <Textarea
                            id="fund-desc"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={2}
                            maxLength={500}
                            placeholder="เช่น พร้อมเพย์ 081-234-5678 (ชื่อบัญชี ...) โอนแล้วส่งสลิปในห้องได้เลย"
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
                                    if (!startDate) setStartDate(todayInput());
                                }}
                            >
                                📅 ยอดรายวัน (เช่น 15 บาท)
                            </Button>
                        </div>
                    </Field>

                    {mode === 'daily' ? (
                        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Field label="ยอดเก็บต่อวัน (บาท/วัน)" htmlFor="fund-daily-rate">
                                    <div className="space-y-1.5">
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
                                        <div className="flex flex-wrap gap-1">
                                            {DAILY_RATE_PRESETS.map((preset) => (
                                                <Button
                                                    key={preset}
                                                    type="button"
                                                    size="xs"
                                                    variant={Number(dailyRate) === preset ? 'default' : 'outline'}
                                                    className="h-5 px-1.5 text-[10px]"
                                                    onClick={() => {
                                                        setDailyRate(String(preset));
                                                        setManualAmount(false);
                                                    }}
                                                >
                                                    {preset} ฿
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
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
                                    <div className="space-y-1.5">
                                        <Input
                                            id="fund-due"
                                            type="date"
                                            value={dueDate}
                                            onChange={(e) => {
                                                setDueDate(e.target.value);
                                                setManualAmount(false);
                                            }}
                                        />
                                        <div className="flex flex-wrap gap-1">
                                            <Button
                                                type="button"
                                                size="xs"
                                                variant="outline"
                                                className="h-5 px-1.5 text-[10px]"
                                                onClick={() => applyDuePreset('7d')}
                                            >
                                                +7 วัน
                                            </Button>
                                            <Button
                                                type="button"
                                                size="xs"
                                                variant="outline"
                                                className="h-5 px-1.5 text-[10px]"
                                                onClick={() => applyDuePreset('15d')}
                                            >
                                                +15 วัน
                                            </Button>
                                            <Button
                                                type="button"
                                                size="xs"
                                                variant="outline"
                                                className="h-5 px-1.5 text-[10px]"
                                                onClick={() => applyDuePreset('month_end')}
                                            >
                                                สิ้นเดือนนี้
                                            </Button>
                                        </div>
                                    </div>
                                </Field>
                                <Field
                                    label="ยอดเป้าหมายต่อคน (บาท)"
                                    htmlFor="fund-amount"
                                    hint={computedDailyTotal > 0 ? `คำนวณจาก ${days} วัน × ${formatBaht(Number(dailyRate))}` : 'ปล่อยเป็น 0 หรือใส่เป้าหมาย'}
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
                                <div className="space-y-1.5">
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
                                    <div className="flex flex-wrap gap-1">
                                        {FIXED_AMOUNT_PRESETS.map((preset) => (
                                            <Button
                                                key={preset}
                                                type="button"
                                                size="xs"
                                                variant={Number(amount) === preset ? 'default' : 'outline'}
                                                className="h-5 px-1.5 text-[10px]"
                                                onClick={() => setAmount(String(preset))}
                                            >
                                                {preset.toLocaleString('th-TH')} ฿
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            </Field>
                            <Field label="ครบกำหนด (ไม่บังคับ)" htmlFor="fund-due">
                                <div className="space-y-1.5">
                                    <Input id="fund-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                                    <div className="flex flex-wrap gap-1">
                                        <Button
                                            type="button"
                                            size="xs"
                                            variant="outline"
                                            className="h-5 px-1.5 text-[10px]"
                                            onClick={() => applyDuePreset('7d')}
                                        >
                                            +7 วัน
                                        </Button>
                                        <Button
                                            type="button"
                                            size="xs"
                                            variant="outline"
                                            className="h-5 px-1.5 text-[10px]"
                                            onClick={() => applyDuePreset('15d')}
                                        >
                                            +15 วัน
                                        </Button>
                                        <Button
                                            type="button"
                                            size="xs"
                                            variant="outline"
                                            className="h-5 px-1.5 text-[10px]"
                                            onClick={() => applyDuePreset('month_end')}
                                        >
                                            สิ้นเดือนนี้
                                        </Button>
                                    </div>
                                </div>
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
