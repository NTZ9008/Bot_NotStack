import { Check, ChevronDown, Copy, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { COMMAND_CATEGORIES, COMMANDS, type Command, type CommandCategory } from './content';

// ==========================================
// 🔎 ค้นหาคำสั่ง — พิมพ์ชื่อ / คำอธิบาย / คำค้น (ไทย-อังกฤษ) แล้วกดดูวิธีใช้ ; กด / เพื่อโฟกัสช่องค้นหา
// ==========================================

const CATEGORY_LABEL = Object.fromEntries(COMMAND_CATEGORIES.map((c) => [c.id, c.label])) as Record<CommandCategory, string>;

function searchText(command: Command) {
    return [command.name, command.summary, command.detail, command.keywords, ...(command.options ?? []).map((o) => `${o.name} ${o.description}`)]
        .join(' ')
        .toLowerCase();
}

function usage(command: Command) {
    const options = (command.options ?? []).map((o) => (o.required ? o.name : `[${o.name}]`));
    return ['/' + command.name, ...options].join(' ');
}

function CopyExample({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    useEffect(() => {
        if (!copied) return;
        const timer = setTimeout(() => setCopied(false), 1500);
        return () => clearTimeout(timer);
    }, [copied]);

    return (
        <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(text).then(() => setCopied(true))}
            className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground"
        >
            {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
            {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
        </button>
    );
}

function CommandDetail({ command }: { command: Command }) {
    return (
        <div className="space-y-4 border-t border-dashed px-4 pt-4 pb-5 text-sm sm:pl-[calc(1.75rem+11rem)]">
            <p className="text-slate-300">{command.detail}</p>

            {command.options && (
                <div>
                    <p className="mb-1.5 text-xs text-muted-foreground">ตัวเลือก</p>
                    <ul className="space-y-1">
                        {command.options.map((option) => (
                            <li key={option.name} className="flex flex-wrap gap-x-2">
                                <code className="font-mono text-indigo-200">{option.name}</code>
                                <span className="text-xs leading-5 text-muted-foreground">{option.required ? 'ต้องใส่' : 'ไม่ใส่ก็ได้'}</span>
                                <span className="basis-full text-slate-400 sm:basis-auto">— {option.description}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {command.example && (
                <div>
                    <p className="mb-1.5 text-xs text-muted-foreground">ตัวอย่าง</p>
                    <div className="flex items-center justify-between gap-2 rounded-md bg-[#2b2d31] py-1.5 pr-1.5 pl-3">
                        <code className="min-w-0 truncate font-mono text-slate-200">{command.example}</code>
                        <CopyExample text={command.example} />
                    </div>
                </div>
            )}

            {command.notes && (
                <ul className="space-y-1 text-xs text-amber-200/80">
                    {command.notes.map((note) => (
                        <li key={note}>※ {note}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export function CommandSearch() {
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState<CommandCategory | 'all'>('all');
    const [open, setOpen] = useState<string | null>('rank');
    const inputRef = useRef<HTMLInputElement>(null);

    // กด / ที่ไหนก็ได้ในหน้า (ที่ไม่ได้พิมพ์อยู่) = ไปช่องค้นหาคำสั่ง
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
            const target = event.target as HTMLElement | null;
            if (target?.closest('input, textarea, [contenteditable="true"]')) return;
            event.preventDefault();
            inputRef.current?.focus();
            inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const results = useMemo(() => {
        const words = query.toLowerCase().replace(/^\//, '').split(/\s+/).filter(Boolean);
        return COMMANDS.filter((command) => category === 'all' || command.category === category).filter((command) => {
            const text = searchText(command);
            return words.every((word) => text.includes(word));
        });
    }, [query, category]);

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <label className="relative flex-1">
                    <span className="sr-only">ค้นหาคำสั่ง</span>
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Escape') setQuery('');
                            if (event.key === 'Enter' && results[0]) setOpen(results[0].name);
                        }}
                        placeholder="ค้นหา เช่น rank, อากาศ, โพล"
                        className="h-11 w-full rounded-lg border bg-background pr-16 pl-9 text-sm outline-none placeholder:text-muted-foreground/70 focus:border-indigo-400/60 focus:ring-3 focus:ring-indigo-500/20"
                    />
                    {query ? (
                        <button
                            type="button"
                            onClick={() => setQuery('')}
                            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                            aria-label="ล้างคำค้นหา"
                        >
                            <X className="size-4" />
                        </button>
                    ) : (
                        <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border px-1.5 font-mono text-xs text-muted-foreground sm:block">
                            /
                        </kbd>
                    )}
                </label>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="หมวดคำสั่ง">
                    {[{ id: 'all' as const, label: 'ทั้งหมด' }, ...COMMAND_CATEGORIES].map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            aria-pressed={category === item.id}
                            onClick={() => setCategory(item.id)}
                            className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground aria-pressed:border-indigo-400/50 aria-pressed:bg-indigo-500/15 aria-pressed:text-indigo-100"
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="overflow-hidden rounded-lg border">
                {results.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                        ไม่เจอคำสั่งที่ตรงกับ “{query}” — ลองคำอื่น หรือพิมพ์ <code className="font-mono">/gethelp</code> ใน Discord
                    </div>
                ) : (
                    <ul className="divide-y">
                        {results.map((command) => {
                            const expanded = open === command.name;
                            return (
                                <li key={command.name} className={expanded ? 'bg-card' : undefined}>
                                    <button
                                        type="button"
                                        aria-expanded={expanded}
                                        onClick={() => setOpen(expanded ? null : command.name)}
                                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-card"
                                    >
                                        <span className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
                                            <code className="block truncate font-mono text-sm text-indigo-200 sm:w-44 sm:shrink-0">{usage(command)}</code>
                                            <span className="block truncate text-sm text-slate-300">{command.summary}</span>
                                        </span>
                                        {command.category === 'home' && (
                                            <span className="hidden shrink-0 text-xs text-amber-300/80 sm:inline">{CATEGORY_LABEL.home}</span>
                                        )}
                                        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
                                    </button>
                                    {expanded && <CommandDetail command={command} />}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
            <p className="text-xs text-muted-foreground">
                {results.length} จาก {COMMANDS.length} คำสั่ง
            </p>
        </div>
    );
}
