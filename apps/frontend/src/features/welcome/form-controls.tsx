import { useEffect, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * slider + ช่องตัวเลข ที่ผูกกับค่าเดียวกัน
 * ช่องตัวเลขรอพิมพ์เสร็จ (Enter / ออกจากช่อง) ไม่งั้นระหว่างพิมพ์จะโดนบีบค่าจนพิมพ์ไม่ได้
 */
export function RangeField({
    label,
    value,
    onChange,
    min,
    max,
    step = 1,
    unit = 'px',
    extra,
}: {
    label: string;
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    extra?: ReactNode;
}) {
    const [text, setText] = useState(String(value));
    useEffect(() => setText(String(value)), [value]);

    const commit = () => {
        const n = Number(text);
        if (text === '' || !Number.isFinite(n)) return setText(String(value));
        const clamped = Math.min(max, Math.max(min, Math.round(n / step) * step));
        setText(String(clamped));
        if (clamped !== value) onChange(clamped);
    };

    return (
        <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-normal">{label}</Label>
                {extra}
            </div>
            <div className="flex items-center gap-3">
                <Slider value={[value]} min={min} max={max} step={step} onValueChange={([v]) => v !== undefined && onChange(v)} className="flex-1" />
                <div className="flex items-center gap-1">
                    <Input
                        type="number"
                        className="h-7 w-20 text-right tabular-nums"
                        min={min}
                        max={max}
                        step={step}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onBlur={commit}
                        onKeyDown={(e) => e.key === 'Enter' && commit()}
                    />
                    <span className="w-6 text-xs text-muted-foreground">{unit}</span>
                </div>
            </div>
        </div>
    );
}

// ปุ่มเลือกแบบกลุ่ม (segmented)
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Record<T, string>; onChange: (value: T) => void }) {
    return (
        <ToggleGroup type="single" variant="outline" size="sm" value={value} onValueChange={(next) => next && onChange(next as T)} className="flex-wrap">
            {(Object.keys(options) as T[]).map((key) => (
                <ToggleGroupItem key={key} value={key}>
                    {options[key]}
                </ToggleGroupItem>
            ))}
        </ToggleGroup>
    );
}

export function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
    return (
        <Label className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2 font-normal">
            {label}
            <Switch checked={checked} onCheckedChange={onChange} />
        </Label>
    );
}

export function CenterButton({ onClick }: { onClick: () => void }) {
    return (
        <Button type="button" size="xs" variant="ghost" className="h-5 px-1.5 text-xs text-indigo-300" onClick={onClick}>
            กึ่งกลาง
        </Button>
    );
}

// ปุ่มแทรกตัวแปร {user} {server} ... ลงในช่องข้อความ ตรงตำแหน่งเคอร์เซอร์
export function PlaceholderChips({ meta, onInsert }: { meta: { placeholders: readonly { key: string; label: string }[] }; onInsert: (token: string) => void }) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {meta.placeholders.map((p) => (
                <Tooltip key={p.key}>
                    <TooltipTrigger asChild>
                        <Badge asChild variant="outline" className="cursor-pointer font-mono hover:bg-muted">
                            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onInsert(`{${p.key}}`)}>
                                {`{${p.key}}`}
                            </button>
                        </Badge>
                    </TooltipTrigger>
                    <TooltipContent>{p.label}</TooltipContent>
                </Tooltip>
            ))}
        </div>
    );
}

// แทรกข้อความลงใน textarea/input ตรงตำแหน่งที่เลือก แล้ววางเคอร์เซอร์ต่อท้าย
export function insertAtCursor(el: HTMLTextAreaElement | HTMLInputElement | null, current: string, token: string): { value: string; cursor: number } {
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    return { value: current.slice(0, start) + token + current.slice(end), cursor: start + token.length };
}
