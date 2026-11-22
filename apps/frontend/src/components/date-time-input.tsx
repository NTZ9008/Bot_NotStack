import { useState } from 'react';
import { useLang, useT, type Lang, tr } from '@/lib/i18n';
import { cn } from 'cn';
import { Calendar as CalendarIcon, Clock } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { buildDateTimeValue as buildValue, pad, parseDateTimeValue as parseValue, type DateTimeMode } from '@/lib/date-time-value';

// ==========================================
// 📅 ช่องเลือกวัน/เวลาตามธีม (แทน <input type="date|datetime-local|time"> ที่เบราว์เซอร์วาดเอง)
// ค่าเป็น string รูปแบบเดียวกับ input เดิม: date = YYYY-MM-DD, datetime = YYYY-MM-DDTHH:mm, time = HH:mm
// ==========================================
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i));

function formatLabel(mode: DateTimeMode, date: Date | undefined, time: string | undefined, lang: Lang): string {
    const day = date?.toLocaleDateString(lang === 'en' ? 'en-GB' : 'th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
    const unit = lang === 'en' ? '' : tr(' น.');
    if (mode === 'date') return day ?? '';
    if (mode === 'time') return time ? `${time}${unit}` : '';
    return day ? `${day} ${time ?? '00:00'}${unit}` : '';
}

export function DateTimeInput({
    value,
    onValueChange,
    mode = 'date',
    id,
    placeholder,
    clearable = false,
    disabled,
    className,
    'aria-label': ariaLabel,
}: {
    value: string;
    onValueChange: (value: string) => void;
    mode?: DateTimeMode;
    id?: string;
    placeholder?: string;
    clearable?: boolean;
    disabled?: boolean;
    className?: string;
    'aria-label'?: string;
}) {
    const [open, setOpen] = useState(false);
    const [lang] = useLang();
    const t = useT();
    const { date, time } = parseValue(value, mode);
    const [hh, mm] = (time ?? '00:00').split(':') as [string, string];
    const label = formatLabel(mode, date, time, lang);
    const Icon = mode === 'time' ? Clock : CalendarIcon;

    const setTime = (h: string, m: string) => onValueChange(buildValue(mode, date ?? new Date(), `${h}:${m}`));
    const now = () => {
        const d = new Date();
        onValueChange(buildValue(mode, d, `${pad(d.getHours())}:${pad(d.getMinutes())}`));
        if (mode === 'date') setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    // ชื่อสำหรับ screen reader ต้องมีข้อความที่เห็นบนปุ่มด้วย (หัวข้อ: ค่าที่เลือก)
                    aria-label={ariaLabel ? `${ariaLabel}: ${label || placeholder || t('ยังไม่ได้เลือก')}` : undefined}
                    className={cn('w-full justify-start gap-2 px-2.5 font-normal', !label && 'text-muted-foreground', className)}
                >
                    <Icon className="text-muted-foreground" />
                    <span className="truncate">{label || placeholder || t(mode === 'time' ? 'เลือกเวลา' : 'เลือกวันที่')}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
                {mode !== 'time' && (
                    <Calendar
                        mode="single"
                        selected={date}
                        defaultMonth={date}
                        onSelect={(d) => {
                            if (!d) return;
                            onValueChange(buildValue(mode, d, time));
                            if (mode === 'date') setOpen(false);
                        }}
                    />
                )}
                {mode !== 'date' && (
                    <div className={cn('flex items-center gap-2 p-3', mode === 'datetime' && 'border-t')}>
                        <Clock className="size-4 text-muted-foreground" />
                        <Select value={hh} onValueChange={(h) => setTime(h, mm)}>
                            <SelectTrigger aria-label={t('ชั่วโมง')} className="w-20">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-60">
                                {HOURS.map((h) => (
                                    <SelectItem key={h} value={h}>
                                        {h}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <span className="text-muted-foreground">:</span>
                        <Select value={mm} onValueChange={(m) => setTime(hh, m)}>
                            <SelectTrigger aria-label={t('นาที')} className="w-20">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-60">
                                {MINUTES.map((m) => (
                                    <SelectItem key={m} value={m}>
                                        {m}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {lang === 'th' && <span className="text-sm text-muted-foreground">{tr('น.')}</span>}
                    </div>
                )}
                <div className="flex items-center justify-between gap-2 border-t p-2">
                    <div className="flex gap-1">
                        <Button type="button" variant="ghost" size="sm" onClick={now}>
                            {t(mode === 'date' ? 'วันนี้' : 'ตอนนี้')}
                        </Button>
                        {clearable && value && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    onValueChange('');
                                    setOpen(false);
                                }}
                            >
                                {t('ล้าง')}
                            </Button>
                        )}
                    </div>
                    {mode !== 'date' && (
                        <Button type="button" size="sm" onClick={() => setOpen(false)}>
                            {t('ตกลง')}
                        </Button>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
