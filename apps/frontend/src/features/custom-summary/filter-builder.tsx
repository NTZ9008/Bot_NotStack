import type { CustomSummaryChannelOption, CustomSummaryModule } from '@notstack/shared';
import { useQuery } from '@tanstack/react-query';
import {
    Activity,
    Bot,
    CalendarClock,
    Download,
    Filter,
    GitPullRequest,
    Loader2,
    MessageSquareText,
    Play,
    RotateCcw,
    Search,
    UserRound,
    Volume2,
    X,
} from 'lucide-react';
import { useState } from 'react';
import { searchMembersQuery } from '@/api/guilds';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { ChannelMultiSelect } from './channel-multi-select';

export type DatePresetKey = '24h' | '7d' | '30d' | '90d' | 'custom';

export interface CustomSummaryDraftFilter {
    preset: DatePresetKey;
    fromInput: string;
    toInput: string;
    interval: 'auto' | 'hour' | 'day';
    channelIds: string[];
    modules: CustomSummaryModule[];
    userId: string | null;
    userQuery: string;
    selectedUserLabel: string | null;
    includeBots: boolean;
}

const DATE_PRESETS: Array<{ key: DatePresetKey; label: string; hours?: number }> = [
    { key: '24h', label: '24 ชม.', hours: 24 },
    { key: '7d', label: '7 วัน', hours: 24 * 7 },
    { key: '30d', label: '30 วัน', hours: 24 * 30 },
    { key: '90d', label: '90 วัน', hours: 24 * 90 },
    { key: 'custom', label: 'กำหนดเอง' },
];

const MODULE_OPTIONS: Array<{
    key: CustomSummaryModule;
    title: string;
    hint: string;
    icon: typeof Volume2;
    activeClass: string;
    iconClass: string;
}> = [
    {
        key: 'voice',
        title: 'สถิติห้องเสียง',
        hint: 'voiceJoin, voiceLeave, เวลารวม & เฉลี่ยต่อครั้ง',
        icon: Volume2,
        activeClass: 'border-sky-500/50 bg-sky-500/10 text-sky-100',
        iconClass: 'text-sky-400',
    },
    {
        key: 'messages',
        title: 'สถิติห้องข้อความ',
        hint: 'messageSent, ลบ/แก้ไข, ห้องที่คึกคักที่สุด',
        icon: MessageSquareText,
        activeClass: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-100',
        iconClass: 'text-emerald-400',
    },
    {
        key: 'githubPr',
        title: 'สถิติ GitHub PR',
        hint: 'PR เปิด/อัปเดต, Merge, ปิด PR แยกตาม Repo/ห้อง',
        icon: GitPullRequest,
        activeClass: 'border-purple-500/50 bg-purple-500/10 text-purple-100',
        iconClass: 'text-purple-400',
    },
    {
        key: 'devopsOther',
        title: 'สถิติ DevOps & อื่นๆ',
        hint: 'Grafana Alert, Jira Card, สมาชิกเข้า/ออกเซิร์ฟเวอร์',
        icon: Activity,
        activeClass: 'border-amber-500/50 bg-amber-500/10 text-amber-100',
        iconClass: 'text-amber-400',
    },
];

export interface FilterBuilderProps {
    guildId: string;
    draft: CustomSummaryDraftFilter;
    channels: CustomSummaryChannelOption[];
    channelsLoading?: boolean;
    validationError: string | null;
    isProcessing: boolean;
    hasSummary: boolean;
    onSelectPreset: (preset: DatePresetKey, hours?: number) => void;
    onUpdate: (patch: Partial<CustomSummaryDraftFilter>) => void;
    onReset: () => void;
    onRunSummary: () => void;
    onOpenPdfModal: () => void;
}

/** แผงควบคุมตัวกรองและ Query Builder ด้านบนของหน้า Custom Log Summary */
export function FilterBuilder({
    guildId,
    draft,
    channels,
    channelsLoading,
    validationError,
    isProcessing,
    hasSummary,
    onSelectPreset,
    onUpdate,
    onReset,
    onRunSummary,
    onOpenPdfModal,
}: FilterBuilderProps) {
    const [memberPopoverOpen, setMemberPopoverOpen] = useState(false);
    const [memberSearch, setMemberSearch] = useState('');

    const { data: foundMembers = [], isFetching: searchingMembers } = useQuery({
        ...searchMembersQuery(guildId, memberSearch.trim()),
        enabled: memberPopoverOpen && memberSearch.trim().length > 0,
    });

    const toggleModule = (mod: CustomSummaryModule) => {
        const exists = draft.modules.includes(mod);
        if (exists) {
            if (draft.modules.length <= 1) return;
            onUpdate({ modules: draft.modules.filter((m) => m !== mod) });
        } else {
            onUpdate({ modules: [...draft.modules, mod] });
        }
    };

    const userInputValue = draft.userId ? `${draft.selectedUserLabel || draft.userId}` : draft.userQuery;

    return (
        <section className="rounded-xl border border-[#1e2638] bg-[#111625] p-5 shadow-lg shadow-black/25">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#1e2638] pb-3.5">
                <div className="flex items-center gap-2.5">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-600/20 text-indigo-400">
                        <Filter className="size-4" />
                    </span>
                    <div>
                        <h2 className="text-sm font-semibold text-slate-100">ตัวกรองและตั้งค่ารายงาน</h2>
                        <p className="text-xs text-slate-400">
                            เลือกช่วงเวลา ห้อง กิจกรรม และผู้ใช้ที่ต้องการสรุป — กด &ldquo;ประมวลผลสรุป&rdquo; เพื่ออัปเดตผลลัพธ์
                        </p>
                    </div>
                </div>

                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={onReset}
                    className="text-slate-400 hover:bg-slate-800/70 hover:text-slate-100"
                >
                    <RotateCcw className="mr-1.5 size-3.5" />
                    ล้างตัวกรอง
                </Button>
            </div>

            <div className="space-y-5">
                {/* แถวที่ 1: ช่วงเวลา (Asia/Bangkok) */}
                <div className="grid gap-4 lg:grid-cols-12">
                    <div className="space-y-2 lg:col-span-5">
                        <Label className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                            <CalendarClock className="size-3.5 text-indigo-400" />
                            ช่วงเวลาดึงข้อมูล
                        </Label>
                        <div className="flex flex-wrap gap-1.5">
                            {DATE_PRESETS.map((preset) => {
                                const active = draft.preset === preset.key;
                                return (
                                    <Button
                                        key={preset.key}
                                        type="button"
                                        size="sm"
                                        variant={active ? 'default' : 'outline'}
                                        onClick={() => onSelectPreset(preset.key, preset.hours)}
                                        className={cn(
                                            'h-8 px-3 text-xs',
                                            active
                                                ? 'border-indigo-500 bg-indigo-600 text-white hover:bg-indigo-500'
                                                : 'border-[#1e2638] bg-[#0b0e17] text-slate-300 hover:bg-slate-800/80 hover:text-white',
                                        )}
                                    >
                                        {preset.label}
                                    </Button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3 lg:col-span-7">
                        <div className="space-y-1.5">
                            <Label className="text-[11px] text-slate-400">วัน-เวลาเริ่มต้น</Label>
                            <Input
                                type="datetime-local"
                                value={draft.fromInput}
                                onChange={(e) => onUpdate({ preset: 'custom', fromInput: e.target.value })}
                                className="h-9 border-[#1e2638] bg-[#0b0e17] text-xs text-slate-100 [color-scheme:dark]"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[11px] text-slate-400">วัน-เวลาสิ้นสุด</Label>
                            <Input
                                type="datetime-local"
                                value={draft.toInput}
                                onChange={(e) => onUpdate({ preset: 'custom', toInput: e.target.value })}
                                className="h-9 border-[#1e2638] bg-[#0b0e17] text-xs text-slate-100 [color-scheme:dark]"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[11px] text-slate-400">ความละเอียดกราฟ</Label>
                            <Select value={draft.interval} onValueChange={(v) => onUpdate({ interval: v as 'auto' | 'hour' | 'day' })}>
                                <SelectTrigger className="h-9 w-full border-[#1e2638] bg-[#0b0e17] text-xs text-slate-100">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="border-[#1e2638] bg-[#111625] text-slate-100">
                                    <SelectItem value="auto">อัตโนมัติ</SelectItem>
                                    <SelectItem value="hour">รายชั่วโมง</SelectItem>
                                    <SelectItem value="day">รายวัน</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                {/* แถวที่ 2: เลือกห้อง + กรองผู้ใช้ / บอท */}
                <div className="grid gap-4 lg:grid-cols-12">
                    <div className="space-y-1.5 lg:col-span-6">
                        <Label className="text-xs font-medium text-slate-300">เลือกห้อง</Label>
                        <ChannelMultiSelect
                            channels={channels}
                            selectedIds={draft.channelIds}
                            onChange={(channelIds) => onUpdate({ channelIds })}
                            loading={channelsLoading}
                        />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-12 lg:col-span-6">
                        <div className="space-y-1.5 sm:col-span-8">
                            <Label className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                                <UserRound className="size-3.5 text-indigo-400" />
                                กรองตามผู้ใช้ / User ID
                            </Label>
                            <div className="flex gap-1.5">
                                <div className="relative flex-1">
                                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-slate-400" />
                                    <Input
                                        value={userInputValue}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (/^\d{17,20}$/.test(val.trim())) {
                                                onUpdate({ userId: val.trim(), userQuery: '', selectedUserLabel: null });
                                            } else {
                                                onUpdate({ userId: null, userQuery: val, selectedUserLabel: null });
                                            }
                                        }}
                                        placeholder="พิมพ์ชื่อผู้ใช้ หรือ Discord User ID..."
                                        className="h-9 border-[#1e2638] bg-[#0b0e17] pr-7 pl-8 text-xs text-slate-100 placeholder:text-slate-500"
                                    />
                                    {(draft.userId || draft.userQuery) && (
                                        <button
                                            type="button"
                                            aria-label="ล้างตัวกรองผู้ใช้"
                                            onClick={() => onUpdate({ userId: null, userQuery: '', selectedUserLabel: null })}
                                            className="absolute top-1/2 right-2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                                        >
                                            <X className="size-3.5" />
                                        </button>
                                    )}
                                </div>

                                <Popover open={memberPopoverOpen} onOpenChange={setMemberPopoverOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-9 shrink-0 border-[#1e2638] bg-[#0b0e17] px-2.5 text-xs text-slate-300 hover:bg-slate-800"
                                        >
                                            ค้นหาสมาชิก
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent align="end" className="w-72 border-[#1e2638] bg-[#111625] p-2.5 text-slate-100">
                                        <Input
                                            value={memberSearch}
                                            onChange={(e) => setMemberSearch(e.target.value)}
                                            placeholder="พิมพ์ชื่อ Discord หรือ username..."
                                            className="mb-2 h-8 border-[#1e2638] bg-[#0b0e17] text-xs"
                                        />
                                        <div className="max-h-48 space-y-1 overflow-y-auto">
                                            {!memberSearch.trim() ? (
                                                <p className="py-4 text-center text-xs text-slate-400">พิมพ์ชื่อเพื่อค้นหาสมาชิกในเซิร์ฟเวอร์</p>
                                            ) : searchingMembers ? (
                                                <p className="py-4 text-center text-xs text-slate-400">กำลังค้นหา...</p>
                                            ) : foundMembers.length === 0 ? (
                                                <p className="py-4 text-center text-xs text-slate-400">ไม่พบสมาชิกที่ตรงกับคำค้นหา</p>
                                            ) : (
                                                foundMembers.map((member) => {
                                                    const displayName = member.nickname || member.username;
                                                    return (
                                                        <button
                                                            key={member.userId}
                                                            type="button"
                                                            onClick={() => {
                                                                onUpdate({
                                                                    userId: member.userId,
                                                                    userQuery: '',
                                                                    selectedUserLabel: `${displayName} (${member.userId})`,
                                                                });
                                                                setMemberPopoverOpen(false);
                                                            }}
                                                            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-indigo-600/20"
                                                        >
                                                            <span className="truncate font-medium text-slate-100">{displayName}</span>
                                                            <span className="ml-2 shrink-0 text-[10px] text-slate-400">{member.userId}</span>
                                                        </button>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>

                        <div className="space-y-1.5 sm:col-span-4">
                            <Label className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                                <Bot className="size-3.5 text-slate-400" />
                                บัญชีบอท
                            </Label>
                            <label className="flex h-9 cursor-pointer items-center justify-between rounded-lg border border-[#1e2638] bg-[#0b0e17] px-3 text-xs text-slate-200">
                                <span>รวมบอท</span>
                                <Switch
                                    checked={draft.includeBots}
                                    onCheckedChange={(checked) => onUpdate({ includeBots: Boolean(checked) })}
                                />
                            </label>
                        </div>
                    </div>
                </div>

                {/* แถวที่ 3: เลือกประเภทกิจกรรม */}
                <div className="space-y-2">
                    <Label className="text-xs font-medium text-slate-300">ประเภทกิจกรรมที่ต้องการสรุป</Label>
                    <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                        {MODULE_OPTIONS.map((mod) => {
                            const Icon = mod.icon;
                            const checked = draft.modules.includes(mod.key);
                            return (
                                <button
                                    key={mod.key}
                                    type="button"
                                    onClick={() => toggleModule(mod.key)}
                                    className={cn(
                                        'flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all',
                                        checked
                                            ? mod.activeClass
                                            : 'border-[#1e2638] bg-[#0b0e17]/70 text-slate-400 hover:border-slate-700 hover:text-slate-200',
                                    )}
                                >
                                    <Checkbox
                                        checked={checked}
                                        className="mt-0.5 pointer-events-none border-slate-600 data-[state=checked]:border-indigo-400 data-[state=checked]:bg-indigo-600"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 text-xs font-semibold">
                                            <Icon className={cn('size-3.5 shrink-0', checked ? mod.iconClass : 'text-slate-500')} />
                                            <span>{mod.title}</span>
                                        </div>
                                        <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{mod.hint}</p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* แถว Action + Validation */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#1e2638] pt-4">
                    <div className="text-xs">
                        {validationError ? (
                            <span className="font-medium text-red-400">{validationError}</span>
                        ) : (
                            <span className="text-slate-400">
                                เวลาทั้งหมดคำนวณตามโซนเวลาไทย <span className="font-medium text-slate-200">Asia/Bangkok (+07:00)</span>
                            </span>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <Button
                            type="button"
                            onClick={onRunSummary}
                            disabled={isProcessing || Boolean(validationError)}
                            className="h-9 bg-indigo-600 px-4 font-medium text-white shadow-sm shadow-indigo-950/50 hover:bg-indigo-500"
                        >
                            {isProcessing ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Play className="mr-1.5 size-4" />}
                            {isProcessing ? 'กำลังประมวลผล...' : 'ประมวลผลสรุป'}
                        </Button>

                        <Button
                            type="button"
                            variant="outline"
                            onClick={onOpenPdfModal}
                            disabled={!hasSummary || isProcessing}
                            className="h-9 border-indigo-500/40 bg-indigo-500/10 px-4 font-medium text-indigo-300 hover:bg-indigo-500/20 hover:text-indigo-200"
                        >
                            <Download className="mr-1.5 size-4" />
                            Export เป็น PDF
                        </Button>
                    </div>
                </div>
            </div>
        </section>
    );
}
