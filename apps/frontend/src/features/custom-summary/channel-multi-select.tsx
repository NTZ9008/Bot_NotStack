import type { CustomSummaryChannelGroup, CustomSummaryChannelOption } from '@notstack/shared';
import { Check, ChevronDown, GitPullRequest, Hash, Search, Volume2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const GROUP_META: Record<CustomSummaryChannelGroup, { label: string; badgeClass: string }> = {
    text: {
        label: 'ห้องแชทข้อความ',
        badgeClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    },
    voice: {
        label: 'ห้องเสียง',
        badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    },
    devops: {
        label: 'ห้องแจ้งเตือน DevOps',
        badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    },
};

function GroupIcon({ group }: { group: CustomSummaryChannelGroup }) {
    if (group === 'voice') return <Volume2 className="size-3.5 shrink-0 text-sky-400" />;
    if (group === 'devops') return <GitPullRequest className="size-3.5 shrink-0 text-purple-400" />;
    return <Hash className="size-3.5 shrink-0 text-indigo-400" />;
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
                ch.name.toLowerCase().includes(q) ||
                ch.category.toLowerCase().includes(q) ||
                ch.id.includes(q) ||
                ch.devopsTags.some((tag) => tag.includes(q)),
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

    const selectedChannels = useMemo(
        () => channels.filter((ch) => selectedSet.has(ch.id)),
        [channels, selectedSet],
    );

    const triggerSummary = loading
        ? 'กำลังโหลดรายชื่อห้อง...'
        : isAllMode
          ? `ทั้งหมดในเซิร์ฟเวอร์ (${channels.length} ห้อง)`
          : selectedIds.length === channels.length
            ? `เลือกครบทุกห้อง (${channels.length} ห้อง)`
            : `เลือกแล้ว ${selectedIds.length} ห้อง`;

    return (
        <div className="space-y-2">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        className="h-9 w-full justify-between border-[#1e2638] bg-[#0b0e17] px-3 text-left font-normal text-slate-100 hover:border-indigo-500/50 hover:bg-[#141a2b]"
                    >
                        <span className="flex min-w-0 items-center gap-2 truncate">
                            <Hash className="size-4 shrink-0 text-indigo-400" />
                            <span className="truncate">{triggerSummary}</span>
                        </span>
                        <ChevronDown className="size-4 shrink-0 text-slate-400" />
                    </Button>
                </PopoverTrigger>

                <PopoverContent align="start" className="w-[min(92vw,420px)] border-[#1e2638] bg-[#111625] p-0 text-slate-100 shadow-2xl">
                    <div className="space-y-2.5 border-b border-[#1e2638] p-3">
                        <div className="relative">
                            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-slate-400" />
                            <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="ค้นหาชื่อห้อง, หมวดหมู่ หรือ tags (pr, grafana)..."
                                className="h-8 border-[#1e2638] bg-[#0b0e17] pl-8 text-xs text-slate-100 placeholder:text-slate-500"
                            />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-1.5">
                                <Button
                                    type="button"
                                    size="xs"
                                    variant="secondary"
                                    className="bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30"
                                    onClick={() => onChange(allIds)}
                                >
                                    <Check className="mr-1 size-3" />
                                    เลือกทั้งหมด ({channels.length})
                                </Button>
                                <Button
                                    type="button"
                                    size="xs"
                                    variant="ghost"
                                    className="text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                                    onClick={() => onChange([])}
                                >
                                    ดูรวมทั้งเซิร์ฟเวอร์
                                </Button>
                            </div>
                            {selectedIds.length > 0 && (
                                <span className="text-[11px] text-indigo-300">เลือกเจาะจง {selectedIds.length} ห้อง</span>
                            )}
                        </div>
                    </div>

                    <ScrollArea className="h-72 p-2">
                        {grouped.length === 0 ? (
                            <div className="py-10 text-center text-xs text-slate-400">ไม่พบห้องที่ตรงกับคำค้นหา</div>
                        ) : (
                            <div className="space-y-3">
                                {grouped.map(({ group, items }) => {
                                    const allGroupSelected = items.every((c) => selectedSet.has(c.id));
                                    return (
                                        <div key={group} className="space-y-1">
                                            <div className="flex items-center justify-between rounded-md bg-[#0b0e17]/70 px-2 py-1">
                                                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
                                                    <GroupIcon group={group} />
                                                    {GROUP_META[group].label} ({items.length})
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleGroup(items)}
                                                    className="text-[11px] font-medium text-indigo-400 hover:text-indigo-300"
                                                >
                                                    {allGroupSelected ? 'เอาออกทั้งกลุ่ม' : 'เลือกทั้งกลุ่ม'}
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
                                                                checked
                                                                    ? 'bg-indigo-600/15 text-slate-100'
                                                                    : 'text-slate-300 hover:bg-slate-800/60',
                                                            )}
                                                        >
                                                            <span className="flex min-w-0 items-center gap-2">
                                                                <Checkbox
                                                                    checked={checked}
                                                                    onCheckedChange={() => toggleOne(ch.id)}
                                                                    className="border-slate-600 data-[state=checked]:border-indigo-500 data-[state=checked]:bg-indigo-600"
                                                                />
                                                                <span className="truncate font-medium">#{ch.name}</span>
                                                            </span>
                                                            <span className="flex shrink-0 items-center gap-1">
                                                                {ch.devopsTags.map((tag) => (
                                                                    <span
                                                                        key={tag}
                                                                        className="rounded border border-purple-500/30 bg-purple-500/15 px-1.5 py-0.2 text-[10px] uppercase text-purple-300"
                                                                    >
                                                                        {tag}
                                                                    </span>
                                                                ))}
                                                                {ch.historicalOnly && (
                                                                    <span className="rounded border border-slate-700 bg-slate-800/80 px-1.5 text-[10px] text-slate-400">
                                                                        ประวัติเก่า
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
                        <Badge
                            key={ch.id}
                            variant="outline"
                            className={cn('gap-1 pr-1 text-[11px]', GROUP_META[ch.group].badgeClass)}
                        >
                            <span>#{ch.name}</span>
                            <button
                                type="button"
                                aria-label={`ลบ ${ch.name}`}
                                onClick={() => toggleOne(ch.id)}
                                className="rounded-full p-0.5 hover:bg-white/10"
                            >
                                <X className="size-3" />
                            </button>
                        </Badge>
                    ))}
                    {selectedChannels.length > 8 && (
                        <Badge variant="outline" className="border-[#1e2638] bg-[#0b0e17] text-[11px] text-slate-300">
                            +{selectedChannels.length - 8} ห้องเพิ่มเติม
                        </Badge>
                    )}
                </div>
            )}
        </div>
    );
}
