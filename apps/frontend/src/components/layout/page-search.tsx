import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { guildQuery } from '@/api/guilds';
import { useAuth } from '@/hooks/use-auth';
import { visibleNavGroups } from './nav-items';
import { PAGE_GUIDES } from '@/lib/page-guides';

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

// ค้นหาหน้า — พิมพ์ชื่อเมนู (ไทย/อังกฤษ) แล้วกด Enter เพื่อกระโดดไปหน้านั้น (Ctrl/⌘ + K)
export function PageSearch() {
    const [open, setOpen] = useState(false);
    const navigate = useNavigate();
    const { isAdmin } = useAuth();
    const { guildId } = useParams({ strict: false });
    const { data: guild } = useQuery({ ...guildQuery(guildId ?? ''), enabled: Boolean(guildId) });

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setOpen((value) => !value);
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, []);

    return (
        <>
            <Button
                aria-label="ค้นหาหน้าหรือสิ่งที่ต้องการทำ"
                variant="outline"
                className="h-8 justify-start gap-2 px-2.5 text-muted-foreground md:w-60"
                onClick={() => setOpen(true)}
            >
                <Search className="size-4" />
                <span className="hidden flex-1 text-left md:inline">ค้นหาเมนู...</span>
                <kbd className="pointer-events-none hidden rounded border border-border bg-muted px-1.5 font-mono text-[10px] md:inline">
                    {isMac ? '⌘ K' : 'Ctrl K'}
                </kbd>
            </Button>
            <CommandDialog
                showCloseButton
                className="top-1/2 -translate-y-1/2 [&_[data-slot=command-input-wrapper]]:pr-10"
                open={open}
                onOpenChange={setOpen}
                title="ค้นหาหน้า"
                description="พิมพ์ชื่อหน้าเพื่อไปยังหน้านั้น"
            >
                <CommandInput placeholder="พิมพ์ชื่อหน้า เช่น ห้องเสียง, ข่าว, users..." />
                <CommandList>
                    <CommandEmpty>ไม่พบหน้าที่ตรงกับคำค้นนี้</CommandEmpty>
                    {visibleNavGroups(isAdmin, guildId ? (guild ?? null) : null).map((group) => (
                        <CommandGroup key={group.label} heading={group.label}>
                            {group.items.map((item) => (
                                <CommandItem
                                    key={item.to}
                                    value={`${item.label} ${item.keywords} ${PAGE_GUIDES[item.guide].summary}`}
                                    onSelect={() => {
                                        setOpen(false);
                                        void navigate({ to: item.to, params: item.guild ? { guildId } : {} });
                                    }}
                                >
                                    <item.icon />
                                    <span className="min-w-0">
                                        <span className="block">{item.label}</span>
                                        <span className="block text-xs text-muted-foreground">{PAGE_GUIDES[item.guide].summary}</span>
                                    </span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    ))}
                </CommandList>
            </CommandDialog>
        </>
    );
}
