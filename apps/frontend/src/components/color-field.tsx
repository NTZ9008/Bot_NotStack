import { useEffect, useState } from 'react';
import { HEX_COLOR_RE } from '@notstack/shared';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// ช่องเลือกสี: จานสี + ช่องพิมพ์ #RRGGBB (สองช่องตรงกันเสมอ)
export function ColorField({ value, onChange, className, id }: { value: string; onChange: (value: string) => void; className?: string; id?: string }) {
    const [text, setText] = useState(value.toUpperCase());
    useEffect(() => setText(value.toUpperCase()), [value]);

    return (
        <div className={cn('flex items-center gap-2', className)}>
            <input
                type="color"
                aria-label="เลือกสี"
                className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                value={HEX_COLOR_RE.test(value) ? value : '#000000'}
                onChange={(e) => onChange(e.target.value.toLowerCase())}
            />
            <Input
                id={id}
                className="font-mono uppercase"
                maxLength={7}
                spellCheck={false}
                value={text}
                onChange={(e) => {
                    setText(e.target.value);
                    if (HEX_COLOR_RE.test(e.target.value.trim())) onChange(e.target.value.trim().toLowerCase());
                }}
                onBlur={() => setText(value.toUpperCase())}
            />
        </div>
    );
}
