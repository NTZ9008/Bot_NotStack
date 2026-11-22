import { tr } from '../lib/i18n';
import { useEffect, useState } from 'react';
import { HEX_COLOR_RE } from '@notstack/shared';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

type Hsv = { h: number; s: number; v: number };

// สีที่ใช้บ่อยใน embed ของ Discord (สด / เข้ม / เทา)
const PRESETS = [
    '#5865F2', '#3498DB', '#1ABC9C', '#57F287', '#FEE75C', '#E67E22', '#ED4245', '#EB459E',
    '#454FBF', '#206694', '#11806A', '#1F8B4C', '#C27C0E', '#A84300', '#992D22', '#AD1457',
    '#FFFFFF', '#DBDEE1', '#99AAB5', '#71368A', '#4E5058', '#2B2D31', '#1E1F22', '#000000',
];

const clamp = (n: number) => Math.min(1, Math.max(0, n));

export function hexToHsv(hex: string): Hsv {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: h * 60, s: max ? d / max : 0, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
    const f = (n: number) => {
        const k = (n + h / 60) % 6;
        return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    };
    return '#' + [f(5), f(3), f(1)].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
}

// ช่องพิมพ์ #RRGGBB — แก้ได้อิสระระหว่างพิมพ์ ส่งค่าออกเมื่อครบรูปแบบ
function HexInput({ value, onChange, id, className }: { value: string; onChange: (value: string) => void; id?: string; className?: string }) {
    const [text, setText] = useState(value.toUpperCase());
    useEffect(() => setText(value.toUpperCase()), [value]);
    return (
        <Input
            id={id}
            aria-label={id ? undefined : tr('รหัสสี')}
            className={cn('font-mono uppercase', className)}
            maxLength={7}
            spellCheck={false}
            value={text}
            onChange={(e) => {
                setText(e.target.value);
                if (HEX_COLOR_RE.test(e.target.value.trim())) onChange(e.target.value.trim().toLowerCase());
            }}
            onBlur={() => setText(value.toUpperCase())}
        />
    );
}

// พื้นที่เลือกความอิ่มสี (ซ้าย→ขวา) และความสว่าง (ล่าง→บน) — ลากเมาส์/นิ้ว หรือใช้ลูกศร (Shift = ก้าวใหญ่)
function SaturationArea({ hsv, onChange }: { hsv: Hsv; onChange: (hsv: Hsv) => void }) {
    const pick = (e: React.PointerEvent<HTMLDivElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        onChange({ ...hsv, s: clamp((e.clientX - r.left) / r.width), v: 1 - clamp((e.clientY - r.top) / r.height) });
    };
    return (
        <div
            role="slider"
            tabIndex={0}
            aria-label={tr('ความอิ่มสีและความสว่าง')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(hsv.s * 100)}
            aria-valuetext={`${Math.round(hsv.s * 100)}%, ${Math.round(hsv.v * 100)}%`}
            className="relative h-36 cursor-crosshair touch-none rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))` }}
            onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                pick(e);
            }}
            onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && pick(e)}
            onKeyDown={(e) => {
                const step = e.shiftKey ? 0.1 : 0.01;
                const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] } as Record<string, number[]>)[e.key];
                if (!d) return;
                e.preventDefault();
                onChange({ ...hsv, s: clamp(hsv.s + d[0]), v: clamp(hsv.v + d[1]) });
            }}
        >
            <span
                className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm ring-1 ring-black/30"
                style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hsvToHex(hsv) }}
            />
        </div>
    );
}

// ปุ่มจานสี + ป๊อปอัปเลือกสีแบบธีมเดียวกับทั้งระบบ (แทน <input type="color"> ของเบราว์เซอร์)
export function ColorPicker({
    value,
    onChange,
    disabled,
    className,
    'aria-label': ariaLabel,
}: {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    className?: string;
    'aria-label'?: string;
}) {
    const safe = (HEX_COLOR_RE.test(value) ? value : '#000000').toLowerCase();
    const [hsv, setHsv] = useState(() => hexToHsv(safe));
    // เก็บ hue เดิมไว้ถ้าค่าที่ส่งกลับมาตรงกับที่เลือก (สีเทา/ดำไม่มี hue จะได้ไม่เด้งกลับไปแดง)
    useEffect(() => {
        if (hsvToHex(hsv) !== safe) setHsv(hexToHsv(safe));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [safe]);
    const set = (next: Hsv) => {
        setHsv(next);
        onChange(hsvToHex(next));
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    disabled={disabled}
                    aria-label={ariaLabel ?? tr('เลือกสี')}
                    className={cn(
                        'h-9 w-11 shrink-0 rounded-lg border border-input p-1 transition-colors outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
                        className,
                    )}
                >
                    <span className="block size-full rounded-sm ring-1 ring-foreground/10 ring-inset" style={{ background: safe }} />
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 gap-3 p-3">
                <SaturationArea hsv={hsv} onChange={set} />
                <Slider
                    aria-label={tr('เฉดสี')}
                    min={0}
                    max={359}
                    value={[Math.round(hsv.h)]}
                    onValueChange={([h]) => set({ ...hsv, h })}
                    className="[&_[data-slot=slider-range]]:hidden [&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-thumb]]:border-2 [&_[data-slot=slider-thumb]]:border-white [&_[data-slot=slider-thumb]]:shadow-sm [&_[data-slot=slider-track]]:h-3! [&_[data-slot=slider-track]]:bg-[linear-gradient(to_right,red,yellow,lime,cyan,blue,magenta,red)]"
                />
                <div className="grid grid-cols-8 gap-1.5">
                    {PRESETS.map((c) => (
                        <button
                            key={c}
                            type="button"
                            title={c}
                            aria-label={c}
                            aria-pressed={c.toLowerCase() === safe}
                            onClick={() => set(hexToHsv(c))}
                            className="aspect-square rounded-sm ring-1 ring-foreground/15 ring-inset outline-none transition-transform hover:scale-110 focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:ring-2 aria-pressed:ring-ring aria-pressed:ring-offset-1 aria-pressed:ring-offset-popover"
                            style={{ background: c }}
                        />
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <span className="size-8 shrink-0 rounded-md ring-1 ring-foreground/10 ring-inset" style={{ background: safe }} />
                    <HexInput value={safe} onChange={onChange} className="h-8" />
                </div>
            </PopoverContent>
        </Popover>
    );
}

// ช่องเลือกสี: ปุ่มจานสี + ช่องพิมพ์ #RRGGBB (สองช่องตรงกันเสมอ)
export function ColorField({ value, onChange, className, id }: { value: string; onChange: (value: string) => void; className?: string; id?: string }) {
    return (
        <div className={cn('flex items-center gap-2', className)}>
            <ColorPicker value={value} onChange={onChange} />
            <HexInput id={id} value={value} onChange={onChange} />
        </div>
    );
}
