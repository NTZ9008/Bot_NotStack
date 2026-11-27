import { tr, byLang } from '../../lib/i18n';
import { Spinner } from '@/components/ui/spinner';
import { filterActiveSummaryModules, type CustomSummaryChannelOption, type CustomSummaryModule, type PluginId } from '@notstack/shared';
import { DateTimeInput } from '@/components/date-time-input';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
    ArrowUpRight,
    Bot,
    CalendarClock,
    Download,
    Filter,
    GitPullRequest,
    Lock,
    MessageSquareText,
    Play,
    RotateCcw,
    Search,
    ShieldAlert,
    UserRound,
    Users,
    Volume2,
    X,
} from '@/components/icons';
import { useState } from 'react';
import { searchMembersQuery } from '@/api/guilds';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { pluginCopy } from '@/lib/plugin-ui';
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

const DATE_PRESETS = byLang((): Array<{ key: DatePresetKey; label: string; hours?: number }> => [
    { key: '24h', label: tr('common.n24Hrs'), hours: 24 },
    { key: '7d', label: tr('common.n7Days'), hours: 24 * 7 },
    { key: '30d', label: tr('common.n30Days'), hours: 24 * 30 },
    { key: '90d', label: tr('common.n90Days'), hours: 24 * 90 },
    { key: 'custom', label: tr('common.custom') },
]);

interface ModuleCardDef {
    key: CustomSummaryModule;
    title: string;
    hint: string;
    icon: typeof Volume2;
    activeClass: string;
    iconClass: string;
    locked?: boolean;
    lockedHint?: string;
}

const CORE_MODULE_OPTIONS = byLang(
    (): ModuleCardDef[] => [
        {
            key: 'voice',
            title: tr('customSummary.voiceStatistics'),
            hint: tr('customSummary.voicejoinVoiceleaveTotalAverageTimePer'),
            icon: Volume2,
            activeClass: 'border-info/50 bg-info/10 text-info',
            iconClass: 'text-info',
        },
        {
            key: 'messages',
            title: tr('customSummary.messageStatistics'),
            hint: tr('customSummary.messagesentDeletesEditsBusiestChannels'),
            icon: MessageSquareText,
            activeClass: 'border-success/50 bg-success/10 text-success',
            iconClass: 'text-success',
        },
        {
            key: 'server',
            title: tr('customSummary.serverStatistics'),
            hint: tr('customSummary.serverStatisticsHint'),
            icon: Users,
            activeClass: 'border-indigo-500/50 bg-indigo-500/10 text-indigo-900 dark:text-indigo-100',
            iconClass: 'text-indigo-700 dark:text-indigo-400',
        },
    ],
);

function ActivityModuleCard({
    mod,
    guildId,
    checked,
    onToggle,
}: {
    mod: ModuleCardDef;
    guildId: string;
    checked: boolean;
    onToggle: (key: CustomSummaryModule) => void;
}) {
    const Icon = mod.icon;

    if (mod.locked) {
        return (
            <Link
                to="/servers/$guildId/plugins"
                params={{ guildId }}
                className="group flex w-full items-start gap-2.5 rounded-xl border border-dashed border-border bg-muted/30 p-3 text-left text-muted-foreground transition-colors hover:border-highlight/50 hover:bg-muted/50"
            >
                <Lock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground/80">
                            <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                            <span>{mod.title}</span>
                        </div>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-highlight/40 bg-highlight/10 px-2 py-0.5 text-[11px] font-medium text-highlight group-hover:bg-highlight/20">
                            {tr('customSummary.goToInstallPlugin')}
                            <ArrowUpRight className="size-3" />
                        </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{mod.lockedHint}</p>
                </div>
            </Link>
        );
    }

    return (
        <button
            type="button"
            aria-pressed={checked}
            onClick={() => onToggle(mod.key)}
            className={cn(
                'flex w-full items-start gap-2.5 rounded-xl border p-3 text-left transition-all',
                checked ? mod.activeClass : 'border-border bg-background/70 text-muted-foreground hover:border-border hover:text-foreground',
            )}
        >
            <Checkbox
                aria-hidden
                tabIndex={-1}
                checked={checked}
                className="mt-0.5 pointer-events-none border-input data-[state=checked]:border-highlight data-[state=checked]:bg-highlight"
            />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <Icon className={cn('size-3.5 shrink-0', checked ? mod.iconClass : 'text-muted-foreground')} />
                    <span>{mod.title}</span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{mod.hint}</p>
            </div>
        </button>
    );
}

export interface FilterBuilderProps {
    guildId: string;
    draft: CustomSummaryDraftFilter;
    channels: CustomSummaryChannelOption[];
    channelsLoading?: boolean;
    installedPlugins?: PluginId[];
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
    installedPlugins,
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
    const installedSet = installedPlugins ? new Set(installedPlugins) : null;
    const hasPr = installedSet === null || installedSet.has('github-pr');
    const hasGrafana = installedSet === null || installedSet.has('grafana-alert');
    const hasJira = installedSet === null || installedSet.has('jira-card');
    const hasDevops = hasGrafana || hasJira;

    const devopsHint =
        hasGrafana && hasJira
            ? tr('customSummary.devopsHintBoth')
            : hasGrafana
              ? tr('customSummary.devopsHintGrafanaOnly')
              : tr('customSummary.devopsHintJiraOnly');

    const pluginModules: ModuleCardDef[] = [
        {
            key: 'githubPr',
            title: tr('customSummary.githubPrStatistics'),
            hint: tr('customSummary.prsOpenedUpdatedMergedClosedBy'),
            icon: GitPullRequest,
            activeClass: 'border-purple-500/50 bg-purple-500/10 text-purple-900 dark:text-purple-100',
            iconClass: 'text-purple-700 dark:text-purple-400',
            locked: !hasPr,
            lockedHint: tr('plugins.requiresPluginShort', { 0: pluginCopy('github-pr').name }),
        },
        {
            key: 'devops',
            title: tr('customSummary.devopsStatistics'),
            hint: devopsHint,
            icon: ShieldAlert,
            activeClass: 'border-warning/50 bg-warning/10 text-warning',
            iconClass: 'text-warning',
            locked: !hasDevops,
            lockedHint: tr('customSummary.requiresDevopsPlugins', {
                0: pluginCopy('grafana-alert').name,
                1: pluginCopy('jira-card').name,
            }),
        },
    ];

    const { data: foundMembers = [], isFetching: searchingMembers } = useQuery({
        ...searchMembersQuery(guildId, memberSearch.trim()),
        enabled: memberPopoverOpen && memberSearch.trim().length > 0,
    });

    const toggleModule = (mod: CustomSummaryModule) => {
        if (mod === 'githubPr' && !hasPr) return;
        if (mod === 'devops' && !hasDevops) return;
        const exists = draft.modules.includes(mod);
        if (exists) {
            const activeCount = filterActiveSummaryModules(draft.modules, installedPlugins).length;
            if (activeCount <= 1) return;
            onUpdate({ modules: draft.modules.filter((m) => m !== mod) });
        } else {
            onUpdate({ modules: [...draft.modules, mod] });
        }
    };

    const userInputValue = draft.userId ? `${draft.selectedUserLabel || draft.userId}` : draft.userQuery;

    return (
        <section className="rounded-xl border border-border bg-card p-5 shadow-lg shadow-black/25">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3.5">
                <div className="flex items-center gap-2.5">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-highlight/20 text-highlight">
                        <Filter className="size-4" />
                    </span>
                    <div>
                        <h2 className="text-sm font-semibold text-foreground">{tr('customSummary.filtersReportSettings')}</h2>
                        <p className="text-xs text-muted-foreground">{tr('customSummary.pickTheTimeRangeChannelsActivities')}</p>
                    </div>
                </div>

                <Button type="button" size="sm" variant="ghost" onClick={onReset} className="text-muted-foreground hover:bg-muted/70 hover:text-foreground">
                    <RotateCcw className="mr-1.5 size-3.5" />

                    {tr('customSummary.resetFilters')}
                </Button>
            </div>

            <div className="space-y-5">
                {/* แถวที่ 1: ช่วงเวลา (Asia/Bangkok) */}
                <div className="grid gap-4 lg:grid-cols-12">
                    <div className="space-y-2 lg:col-span-5">
                        <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <CalendarClock className="size-3.5 text-highlight" />

                            {tr('customSummary.timeRange')}
                        </Label>
                        <div className="flex flex-wrap gap-1.5">
                            {DATE_PRESETS().map((preset) => {
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
                                                ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/80'
                                                : 'border-border bg-background text-muted-foreground hover:bg-muted/80 hover:text-foreground',
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
                            <Label className="text-[11px] text-muted-foreground">{tr('customSummary.startDateTime')}</Label>
                            <DateTimeInput
                                mode="datetime"

                                aria-label={tr('customSummary.startDateTime')}
                                value={draft.fromInput}
                                onValueChange={(v) => onUpdate({ preset: 'custom', fromInput: v })}
                                className="h-9 border-border bg-background text-xs text-foreground"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[11px] text-muted-foreground">{tr('customSummary.endDateTime')}</Label>
                            <DateTimeInput
                                mode="datetime"

                                aria-label={tr('customSummary.endDateTime')}
                                value={draft.toInput}
                                onValueChange={(v) => onUpdate({ preset: 'custom', toInput: v })}
                                className="h-9 border-border bg-background text-xs text-foreground"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[11px] text-muted-foreground">{tr('customSummary.chartResolution')}</Label>
                            <Select value={draft.interval} onValueChange={(v) => onUpdate({ interval: v as 'auto' | 'hour' | 'day' })}>
                                <SelectTrigger
                                    aria-label={tr('customSummary.chartResolution')}
                                    className="h-9 w-full border-border bg-background text-xs text-foreground"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="border-border bg-card text-foreground">
                                    <SelectItem value="auto">{tr('common.auto')}</SelectItem>
                                    <SelectItem value="hour">{tr('common.hourly')}</SelectItem>
                                    <SelectItem value="day">{tr('common.daily')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                {/* แถวที่ 2: เลือกห้อง + กรองผู้ใช้ / บอท */}
                <div className="grid gap-4 lg:grid-cols-12">
                    <div className="space-y-1.5 lg:col-span-6">
                        <Label className="text-xs font-medium text-muted-foreground">{tr('customSummary.selectChannels')}</Label>
                        <ChannelMultiSelect
                            channels={channels}
                            selectedIds={draft.channelIds}
                            onChange={(channelIds) => onUpdate({ channelIds })}
                            loading={channelsLoading}
                        />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-12 lg:col-span-6">
                        <div className="space-y-1.5 sm:col-span-8">
                            <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                <UserRound className="size-3.5 text-highlight" />

                                {tr('customSummary.filterByUserUserId')}
                            </Label>
                            <div className="flex gap-1.5">
                                <div className="relative flex-1">
                                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
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
                                        placeholder={tr('customSummary.typeAUsernameOrDiscordUser')}
                                        className="h-9 border-border bg-background pr-7 pl-8 text-xs text-foreground placeholder:text-muted-foreground"
                                    />
                                    {(draft.userId || draft.userQuery) && (
                                        <button
                                            type="button"
                                            aria-label={tr('customSummary.clearUserFilter')}
                                            onClick={() => onUpdate({ userId: null, userQuery: '', selectedUserLabel: null })}
                                            className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
                                            className="h-9 shrink-0 border-border bg-background px-2.5 text-xs text-muted-foreground hover:bg-muted"
                                        >
                                            {tr('common.findMember')}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent align="end" className="w-72 border-border bg-card p-2.5 text-foreground">
                                        <Input
                                            value={memberSearch}
                                            onChange={(e) => setMemberSearch(e.target.value)}
                                            placeholder={tr('customSummary.typeADiscordNameOrUsername')}
                                            className="mb-2 h-8 border-border bg-background text-xs"
                                        />
                                        <div className="max-h-48 space-y-1 overflow-y-auto">
                                            {!memberSearch.trim() ? (
                                                <p className="py-4 text-center text-xs text-muted-foreground">{tr('customSummary.typeANameToSearchServer')}</p>
                                            ) : searchingMembers ? (
                                                <p className="py-4 text-center text-xs text-muted-foreground">{tr('common.searching')}</p>
                                            ) : foundMembers.length === 0 ? (
                                                <p className="py-4 text-center text-xs text-muted-foreground">{tr('customSummary.noMembersMatchYourSearch')}</p>
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
                                                            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-highlight/20"
                                                        >
                                                            <span className="truncate font-medium text-foreground">{displayName}</span>
                                                            <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">{member.userId}</span>
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
                            <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                <Bot className="size-3.5 text-muted-foreground" />

                                {tr('customSummary.botAccounts')}
                            </Label>
                            <label className="flex h-9 cursor-pointer items-center justify-between rounded-lg border border-border bg-background px-3 text-xs text-foreground">
                                <span>{tr('common.includeBots')}</span>
                                <Switch checked={draft.includeBots} onCheckedChange={(checked) => onUpdate({ includeBots: Boolean(checked) })} />
                            </label>
                        </div>
                    </div>
                </div>

                {/* แถวที่ 3: เลือกประเภทกิจกรรม (แยก Core vs Plugin ชัดเจน) */}
                <div className="space-y-3">
                    <Label className="text-xs font-medium text-muted-foreground">{tr('customSummary.activityTypesToSummarize')}</Label>

                    <div className="space-y-1.5">
                        <div className="text-[11px] font-medium text-muted-foreground">{tr('customSummary.coreReportGroup')}</div>
                        <div className="grid gap-2.5 sm:grid-cols-3">
                            {CORE_MODULE_OPTIONS().map((mod) => (
                                <ActivityModuleCard
                                    key={mod.key}
                                    mod={mod}
                                    guildId={guildId}
                                    checked={draft.modules.includes(mod.key)}
                                    onToggle={toggleModule}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <div className="text-[11px] font-medium text-muted-foreground">{tr('customSummary.pluginReportGroup')}</div>
                        <div className="grid gap-2.5 sm:grid-cols-2">
                            {pluginModules.map((mod) => (
                                <ActivityModuleCard
                                    key={mod.key}
                                    mod={mod}
                                    guildId={guildId}
                                    checked={!mod.locked && draft.modules.includes(mod.key)}
                                    onToggle={toggleModule}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* แถว Action + Validation */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                    <div className="text-xs">
                        {validationError ? (
                            <span className="font-medium text-destructive">{validationError}</span>
                        ) : (
                            <span className="text-muted-foreground">
                                {tr('customSummary.allTimesUseThaiTime')} <span className="font-medium text-foreground">Asia/Bangkok (+07:00)</span>
                            </span>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <Button
                            type="button"
                            onClick={onRunSummary}
                            disabled={isProcessing || Boolean(validationError)}
                            className="h-9 bg-primary px-4 font-medium text-primary-foreground hover:bg-primary/80"
                        >
                            {isProcessing ? <Spinner className="mr-1.5 size-4" /> : <Play className="mr-1.5 size-4" />}
                            {isProcessing ? tr('customSummary.processing') : tr('customSummary.runSummary')}
                        </Button>

                        <Button
                            type="button"
                            variant="outline"
                            onClick={onOpenPdfModal}
                            disabled={!hasSummary || isProcessing}
                            className="h-9 border-highlight/40 bg-highlight/10 px-4 font-medium text-highlight hover:bg-highlight/20 hover:text-highlight"
                        >
                            <Download className="mr-1.5 size-4" />

                            {tr('customSummary.exportAsPdf')}
                        </Button>
                    </div>
                </div>
            </div>
        </section>
    );
}
