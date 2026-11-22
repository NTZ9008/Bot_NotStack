import { tr, byLang } from '../../lib/i18n';
import type { CustomSummaryChannelGroup, CustomSummaryChannelOption } from '@notstack/shared';
import { Check, ChevronDown, GitPullRequest, Hash, Search, Volume2, X } from '@/components/icons';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const GROUP_META = byLang((): Record<CustomSummaryChannelGroup, { label: string; badgeClass: string }> => ({
    text: {
        label: tr('ห้องแชทข้อความ'),
        badgeClass: 'bg-highlight/15 text-highlight border-highlight/30',
    },
    voice: {
        label: tr('ห้องเสียง'),
        badgeClass: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
    },
    devops: {
        label: tr('ห้องแจ้งเตือน DevOps'),
        badgeClass: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
    },
}));

function GroupIcon({ group }: { group: CustomSummaryChannelGroup }) {
    if (group === 'voice') return <Volume2 className="size-3.5 shrink-0 text-sky-700 dark:text-sky-400" />;
    if (group === 'devops') return <GitPullRequest className="size-3.5 shrink-0 text-purple-700 dark:text-purple-400" />;
    return <Hash className="size-3.5 shrink-0 text-highlight" />;
}

export interface ChannelMultiSelectProps {
    channels: CustomSummaryChannelOption[];
    selectedIds: string[];
    onChange: (nextIds: string[]) => void;
    loading?: boolean;
}

/** ตัวกรองเลือกหลายห้อง แยกหมวด Text / Voice / DevOps พร้อมค้นหาและเลือกทั้งกลุ่ม */
export function ChannelMultiSelect({ channels, selectedIds, onChange, loading }: ChannelMultiSelectProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');

    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const allIds = useMemo(() => channels.map((c) => c.id), [channels]);
    const isAllMode = selectedIds.length === 0;

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return channels;
        return channels.filter(
            (ch) =>
                ch.name.toLowerCase().includes(q) || ch.category.toLowerCase().includes(q) || ch.id.includes(q) || ch.devopsTags.some((tag) => tag.includes(q)),
        );
    }, [channels, query]);

    const grouped = useMemo(() => {
        const order: CustomSummaryChannelGroup[] = ['text', 'voice', 'devops'];
        return order
            .map((group) => ({
                group,
                items: filtered.filter((ch) => ch.group === group),
            }))
            .filter((entry) => entry.items.length > 0);
    }, [filtered]);

    const toggleOne = (id: string) => {
        if (selectedSet.has(id)) {
            onChange(selectedIds.filter((item) => item !== id));
        } else {
            onChange([...selectedIds, id]);
        }
    };

    const toggleGroup = (items: CustomSummaryChannelOption[]) => {
        const groupIds = items.map((c) => c.id);
        const allSelected = groupIds.every((id) => selectedSet.has(id));
        if (allSelected) {
            const removeSet = new Set(groupIds);
            onChange(selectedIds.filter((id) => !removeSet.has(id)));
        } else {
            onChange([...new Set([...selectedIds, ...groupIds])]);
        }
    };

    const selectedChannels = useMemo(() => channels.filter((ch) => selectedSet.has(ch.id)), [channels, selectedSet]);

    const triggerSummary = loading
        ? tr('กำลังโหลดรายชื่อห้อง...')
        : isAllMode
          ? tr('ทั้งหมดในเซิร์ฟเวอร์ ({0} ห้อง)', { 0: channels.length })
          : selectedIds.length === channels.length
            ? tr('เลือกครบทุกห้อง ({0} ห้อง)', { 0: channels.length })
            : tr('เลือกแล้ว {0} ห้อง', { 0: selectedIds.length });

    return (
        <div className="space-y-2">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        className="h-9 w-full justify-between border-border bg-background px-3 text-left font-normal text-foreground hover:border-highlight/50 hover:bg-muted"
                    >
                        <span className="flex min-w-0 items-center gap-2 truncate">
                            <Hash className="size-4 shrink-0 text-highlight" />
                            <span className="truncate">{triggerSummary}</span>
                        </span>
                        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                    </Button>
                </PopoverTrigger>

                <PopoverContent align="start" className="w-[min(92vw,420px)] border-border bg-card p-0 text-foreground shadow-2xl">
                    <div className="space-y-2.5 border-b border-border p-3">
                        <div className="relative">
                            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={tr('ค้นหาชื่อห้อง, หมวดหมู่ หรือ tags (pr, grafana)...')}
                                className="h-8 border-border bg-background pl-8 text-xs text-foreground placeholder:text-muted-foreground"
                            />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-1.5">
                                <Button
                                    type="button"
                                    size="xs"
                                    variant="secondary"
                                    className="bg-highlight/20 text-highlight hover:bg-highlight/30"
                                    onClick={() => onChange(allIds)}
                                >
                                    <Check className="mr-1 size-3" />
                                    {tr('เลือกทั้งหมด (')}
                                    {channels.length})
                                </Button>
                                <Button
                                    type="button"
                                    size="xs"
                                    variant="ghost"
                                    className="text-muted-foreground hover:bg-muted hover:text-foreground"
                                    onClick={() => onChange([])}
                                >
                                    {tr('ดูรวมทั้งเซิร์ฟเวอร์')}
                                </Button>
                            </div>
                            {selectedIds.length > 0 && (
                                <span className="text-[11px] text-highlight">
                                    {tr('เลือกเจาะจง')} {selectedIds.length} {tr('ห้อง')}
                                </span>
                            )}
                        </div>
                    </div>

                    <ScrollArea className="h-72 p-2">
                        {grouped.length === 0 ? (
                            <div className="py-10 text-center text-xs text-muted-foreground">{tr('ไม่พบห้องที่ตรงกับคำค้นหา')}</div>
                        ) : (
                            <div className="space-y-3">
                                {grouped.map(({ group, items }) => {
                                    const allGroupSelected = items.every((c) => selectedSet.has(c.id));
                                    return (
                                        <div key={group} className="space-y-1">
                                            <div className="flex items-center justify-between rounded-md bg-background/70 px-2 py-1">
                                                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                                                    <GroupIcon group={group} />
                                                    {GROUP_META()[group].label} ({items.length})
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleGroup(items)}
                                                    className="text-[11px] font-medium text-highlight hover:text-highlight"
                                                >
                                                    {allGroupSelected ? tr('เอาออกทั้งกลุ่ม') : tr('เลือกทั้งกลุ่ม')}
                                                </button>
                                            </div>
                                            <div className="space-y-0.5 pl-1">
                                                {items.map((ch) => {
                                                    const checked = selectedSet.has(ch.id);
                                                    return (
                                                        <label
                                                            key={ch.id}
                                                            className={cn(
                                                                'flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors',
                                                                checked ? 'bg-highlight/15 text-foreground' : 'text-muted-foreground hover:bg-muted/60',
                                                            )}
                                                        >
                                                            <span className="flex min-w-0 items-center gap-2">
                                                                <Checkbox
                                                                    checked={checked}
                                                                    onCheckedChange={() => toggleOne(ch.id)}
                                                                    className="border-input data-[state=checked]:border-highlight data-[state=checked]:bg-highlight"
                                                                />
                                                                <span className="truncate font-medium">#{ch.name}</span>
                                                            </span>
                                                            <span className="flex shrink-0 items-center gap-1">
                                                                {ch.devopsTags.map((tag) => (
                                                                    <span
                                                                        key={tag}
                                                                        className="rounded border border-purple-500/30 bg-purple-500/15 px-1.5 py-0.2 text-[10px] uppercase text-purple-700 dark:text-purple-300"
                                                                    >
                                                                        {tag}
                                                                    </span>
                                                                ))}
                                                                {ch.historicalOnly && (
                                                                    <span className="rounded border border-border bg-muted/80 px-1.5 text-[10px] text-muted-foreground">
                                                                        {tr('ประวัติเก่า')}
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </ScrollArea>
                </PopoverContent>
            </Popover>

            {selectedChannels.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {selectedChannels.slice(0, 8).map((ch) => (
                        <Badge key={ch.id} variant="outline" className={cn('gap-1 pr-1 text-[11px]', GROUP_META()[ch.group].badgeClass)}>
                            <span>#{ch.name}</span>
                            <button
                                type="button"
                                aria-label={tr('ลบ {0}', { 0: ch.name })}
                                onClick={() => toggleOne(ch.id)}
                                className="rounded-full p-0.5 hover:bg-foreground/10"
                            >
                                <X className="size-3" />
                            </button>
                        </Badge>
                    ))}
                    {selectedChannels.length > 8 && (
                        <Badge variant="outline" className="border-border bg-background text-[11px] text-muted-foreground">
                            +{selectedChannels.length - 8} {tr('ห้องเพิ่มเติม')}
                        </Badge>
                    )}
                </div>
            )}
        </div>
    );
}
