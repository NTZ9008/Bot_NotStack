import { formatBaht } from '@notstack/shared';
import { AlertCircle, Calendar } from 'lucide-react';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { periodAmount, periodPresetRange, type PeriodPreset } from './utils';

const PRESETS: readonly { key: PeriodPreset; label: string }[] = [
    { key: 'today', label: 'วันนี้ (1 วัน)' },
    { key: '7d', label: '7 วันล่าสุด' },
    { key: '15d', label: '15 วันล่าสุด' },
    { key: 'month', label: 'เดือนนี้ทั้งเดือน' },
];

// ช่องเลือก "ตั้งแต่วันที่ – ถึงวันที่" + ปุ่มลัดเลือกช่วงวัน + สรุปจำนวนวัน (และยอดตามอัตรารายวันถ้ามี)
export function PeriodFields({
    idPrefix,
    start,
    end,
    onChange,
    dailyRate,
    topicStartDate,
    amountSuffix = '',
}: {
    idPrefix: string;
    start: string;
    end: string;
    onChange: (start: string, end: string) => void;
    dailyRate: number | null;
    topicStartDate?: string | null;
    amountSuffix?: string;
}) {
    const invalid = Boolean(start && end && start > end);
    const { days } = periodAmount({ dailyRate }, start, end);

    const applyPreset = (preset: PeriodPreset) => {
        const range = periodPresetRange(preset, topicStartDate);
        onChange(range.start, range.end);
    };

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-[11px] text-muted-foreground">เลือกด่วน:</span>
                {PRESETS.map((p) => (
                    <Button key={p.key} type="button" size="xs" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => applyPreset(p.key)}>
                        {p.label}
                    </Button>
                ))}
                {topicStartDate && (
                    <Button type="button" size="xs" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => applyPreset('since_start')}>
                        ตั้งแต่เริ่มเก็บถึงวันนี้
                    </Button>
                )}
            </div>

            <div className="grid grid-cols-2 gap-2">
                <Field label="ตั้งแต่วันที่" htmlFor={`${idPrefix}-period-start`}>
                    <Input id={`${idPrefix}-period-start`} type="date" value={start} onChange={(e) => onChange(e.target.value, end)} />
                </Field>
                <Field label="ถึงวันที่" htmlFor={`${idPrefix}-period-end`}>
                    <Input id={`${idPrefix}-period-end`} type="date" value={end} onChange={(e) => onChange(start, e.target.value)} />
                </Field>
            </div>
            {invalid ? (
                <p className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="size-3.5 shrink-0" />
                    วันที่เริ่มต้นต้องไม่หลังวันที่สิ้นสุด
                </p>
            ) : (
                days > 0 && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="size-3.5 text-primary" />
                        <span>
                            รวม <span className="font-semibold text-foreground">{days} วัน</span>
                            {dailyRate && (
                                <span>
                                    {' '}
                                    (วันละ {formatBaht(dailyRate)} ={' '}
                                    <span className="font-semibold text-emerald-400">
                                        {formatBaht(days * dailyRate)}
                                        {amountSuffix}
                                    </span>
                                    )
                                </span>
                            )}
                        </span>
                    </p>
                )
            )}
        </div>
    );
}
