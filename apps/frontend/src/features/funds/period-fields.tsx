import { formatBaht } from '@notstack/shared';
import { AlertCircle } from 'lucide-react';
import { Field } from '@/components/field';
import { Input } from '@/components/ui/input';
import { periodAmount } from './utils';

// ช่องเลือก "ตั้งแต่วันที่ – ถึงวันที่" + สรุปจำนวนวัน (และยอดตามอัตรารายวันถ้ามี)
export function PeriodFields({
    idPrefix,
    start,
    end,
    onChange,
    dailyRate,
    amountSuffix = '',
}: {
    idPrefix: string;
    start: string;
    end: string;
    onChange: (start: string, end: string) => void;
    dailyRate: number | null;
    amountSuffix?: string;
}) {
    const invalid = Boolean(start && end && start > end);
    const { days } = periodAmount({ dailyRate }, start, end);
    return (
        <>
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
                    <p className="text-xs text-muted-foreground">
                        📅 รวม <span className="font-semibold text-foreground">{days} วัน</span>
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
                    </p>
                )
            )}
        </>
    );
}
