import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { guildQuery } from '@/api/guilds';
import { useAuth } from '@/hooks/use-auth';
import { visibleNavGroups } from './nav-items';

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
            <Button variant="outline" className="h-8 w-full max-w-64 justify-start gap-2 px-2.5 text-muted-foreground" onClick={() => setOpen(true)}>
                <Search className="size-4" />
                <span className="flex-1 text-left">ค้นหาหน้า...</span>
                <kbd className="pointer-events-none rounded border border-border bg-muted px-1.5 font-mono text-[10px]">{isMac ? '⌘ K' : 'Ctrl K'}</kbd>
            </Button>
            <CommandDialog open={open} onOpenChange={setOpen} title="ค้นหาหน้า" description="พิมพ์ชื่อหน้าเพื่อไปยังหน้านั้น">
                <CommandInput placeholder="พิมพ์ชื่อหน้า เช่น ห้องเสียง, ข่าว, users..." />
                <CommandList>
                    <CommandEmpty>ไม่พบหน้าที่ตรงกับคำค้นนี้</CommandEmpty>
                    {visibleNavGroups(isAdmin, guildId ? (guild ?? null) : null).map((group) => (
                        <CommandGroup key={group.label} heading={group.label}>
                            {group.items.map((item) => (
                                <CommandItem
                                    key={item.to}
                                    value={`${item.label} ${item.keywords}`}
                                    onSelect={() => {
                                        setOpen(false);
                                        void navigate({ to: item.to, params: item.guild ? { guildId } : {} });
                                    }}
                                >
                                    <item.icon />
                                    {item.label}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    ))}
                </CommandList>
            </CommandDialog>
        </>
    );
}
