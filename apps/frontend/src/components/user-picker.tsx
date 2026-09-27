import type { MemberSearchResult } from '@notstack/shared';
import { useQuery } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { useState } from 'react';
import { searchMembersQuery } from '@/api/guilds';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useGuildId } from '@/hooks/use-guild';
import { fallbackAvatar } from '@/lib/format';
import { cn } from '@/lib/utils';

const SNOWFLAKE = /^\d{5,25}$/;

export interface PickedUser extends MemberSearchResult {
    // พิมพ์ User ID เองแล้วเลือก (คนที่ไม่ได้อยู่ในรายชื่อสมาชิกแล้ว)
    raw?: boolean;
}

/**
 * 👤 เลือกสมาชิกด้วยชื่อ — พิมพ์ชื่อหรือ username แล้วเลือกจากรายการ (ยังพิมพ์ User ID ตรงๆ ได้)
 * keepSelection = false → เลือกแล้วล้างช่องทันที (เช่นปุ่มเพิ่มคนเข้า whitelist)
 */
export function UserPicker({
    value,
    onSelect,
    onClear,
    placeholder = 'พิมพ์ชื่อหรือ username เพื่อค้นหา...',
    exclude = [],
    keepSelection = true,
    className,
}: {
    value?: PickedUser | null;
    onSelect: (user: PickedUser) => void;
    onClear?: () => void;
    placeholder?: string;
    exclude?: string[];
    keepSelection?: boolean;
    className?: string;
}) {
    const [text, setText] = useState('');
    const [open, setOpen] = useState(false);
    const query = useDebouncedValue(text.trim(), 280);
    const guildId = useGuildId();
    const { data = [], isFetching, isError } = useQuery(searchMembersQuery(guildId, query));

    const results: PickedUser[] = data.filter((member) => !exclude.includes(member.userId));
    // พิมพ์เป็นตัวเลขล้วน → เลือกใช้เป็น User ID ตรงๆ ได้เลย (เผื่อคนไม่ได้อยู่ในเซิร์ฟเวอร์แล้ว)
    if (SNOWFLAKE.test(query) && !results.some((member) => member.userId === query) && !exclude.includes(query)) {
        results.unshift({ userId: query, username: `ใช้ User ID: ${query}`, tag: query, avatar: fallbackAvatar(query), nickname: null, raw: true });
    }

    const select = (user: PickedUser) => {
        onSelect(user);
        setOpen(false);
        setText('');
    };

    const waiting = text.trim() !== query || isFetching;

    return (
        <div className={cn('space-y-2', className)}>
            <Command shouldFilter={false} className="relative overflow-visible rounded-lg bg-transparent p-0">
                <CommandInput
                    value={text}
                    onValueChange={(next) => {
                        setText(next);
                        setOpen(Boolean(next.trim()));
                    }}
                    onFocus={() => text.trim() && setOpen(true)}
                    onBlur={() => setTimeout(() => setOpen(false), 150)}
                    onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
                    placeholder={placeholder}
                />
                {open && (
                    <CommandList className="absolute top-full right-0 left-0 z-50 mt-1 max-h-72 rounded-lg border bg-popover p-1 shadow-lg">
                        {waiting && results.length === 0 ? (
                            <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                                <Loader2 className="size-4 animate-spin" /> กำลังค้นหา...
                            </div>
                        ) : (
                            <>
                                <CommandEmpty>{isError ? 'ค้นหาไม่สำเร็จ กรุณาลองใหม่' : 'ไม่พบสมาชิกที่ตรงกับคำค้นนี้'}</CommandEmpty>
                                <CommandGroup>
                                    {results.map((member) => (
                                        <CommandItem key={member.userId} value={member.userId} onSelect={() => select(member)} onMouseDown={(e) => e.preventDefault()}>
                                            <img src={member.avatar || fallbackAvatar(member.userId)} alt="" className="size-7 rounded-full" />
                                            <div className="min-w-0">
                                                <p className="truncate font-medium">
                                                    {member.username}
                                                    {member.nickname && <span className="text-muted-foreground"> ({member.nickname})</span>}
                                                </p>
                                                <p className="truncate text-xs text-muted-foreground">{member.raw ? 'ไม่ได้อยู่ในรายชื่อสมาชิก' : `@${member.tag}`}</p>
                                            </div>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </>
                        )}
                    </CommandList>
                )}
            </Command>

            {keepSelection && value && (
                <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
                    <img src={value.avatar || fallbackAvatar(value.userId)} alt="" className="size-8 rounded-full" />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{value.username}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">{value.userId}</p>
                    </div>
                    {onClear && (
                        <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="ล้างที่เลือกไว้">
                            <X />
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
