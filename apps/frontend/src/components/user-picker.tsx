import { tr } from '../lib/i18n';
import type { MemberSearchResult } from '@notstack/shared';
import { useQuery } from '@tanstack/react-query';
import { Loader2, X } from '@/components/icons';
import { useState } from 'react';
import { searchMembersQuery } from '@/api/guilds';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
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
    placeholder = tr('common.typeANameOrUsernameTo'),
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
        results.unshift({
            userId: query,
            username: tr('common.useUserId', { 0: query }),
            tag: query,
            avatar: fallbackAvatar(query),
            nickname: null,
            raw: true,
        });
    }

    const select = (user: PickedUser) => {
        onSelect(user);
        setOpen(false);
        setText('');
    };

    const waiting = text.trim() !== query || isFetching;

    return (
        <div className={cn('space-y-2', className)}>
            <Popover open={open}>
                <Command shouldFilter={false} className="overflow-visible rounded-lg bg-transparent p-0">
                    <PopoverAnchor asChild>
                        <div>
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
                        </div>
                    </PopoverAnchor>
                    {/* portal: the list must escape parents with overflow-hidden (e.g. Card) */}
                    <PopoverContent
                        align="start"
                        className="w-(--radix-popover-trigger-width) gap-0 p-1"
                        onOpenAutoFocus={(e) => e.preventDefault()}
                        onCloseAutoFocus={(e) => e.preventDefault()}
                    >
                        <CommandList className="max-h-72">
                            {waiting && results.length === 0 ? (
                                <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                                    <Loader2 className="size-4 animate-spin" /> {tr('common.searching')}
                                </div>
                            ) : (
                                <>
                                    <CommandEmpty>{isError ? tr('common.searchFailedPleaseTryAgain') : tr('common.noMembersMatchThisSearch')}</CommandEmpty>
                                    <CommandGroup>
                                        {results.map((member) => (
                                            <CommandItem
                                                key={member.userId}
                                                value={member.userId}
                                                onSelect={() => select(member)}
                                                onMouseDown={(e) => e.preventDefault()}
                                            >
                                                <img src={member.avatar || fallbackAvatar(member.userId)} alt="" className="size-7 rounded-full" />
                                                <div className="min-w-0">
                                                    <p className="truncate font-medium">
                                                        {member.username}
                                                        {member.nickname && <span className="text-muted-foreground"> ({member.nickname})</span>}
                                                    </p>
                                                    <p className="truncate text-xs text-muted-foreground">
                                                        {member.raw ? tr('common.notInTheMemberList') : `@${member.tag}`}
                                                    </p>
                                                </div>
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </>
                            )}
                        </CommandList>
                    </PopoverContent>
                </Command>
            </Popover>

            {keepSelection && value && (
                <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
                    <img src={value.avatar || fallbackAvatar(value.userId)} alt="" className="size-8 rounded-full" />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{value.username}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">{value.userId}</p>
                    </div>
                    {onClear && (
                        <Button type="button" variant="ghost" size="icon-sm" onClick={onClear} aria-label={tr('common.clearSelection2')}>
                            <X />
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
