import { FUND_REPORT_THEMES, FUND_REPORT_THEME_PALETTES, type FundReportThemeId } from '@notstack/shared';
import { Check, Compass, Gamepad2, Landmark, LayoutTemplate, Palette, Snowflake } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { byLang, tr } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export interface ReportThemeOption {
    id: FundReportThemeId;
    name: string;
    description: string;
    isDefault: boolean;
    isSeasonal?: boolean;
}

export const REPORT_THEME_OPTIONS = byLang((): readonly ReportThemeOption[] => [
    {
        id: 'default',
        name: tr('funds.themeDefaultName'),
        description: tr('funds.themeDefaultDesc'),
        isDefault: true,
    },
    {
        id: 'minimal-finance',
        name: tr('funds.themeMinimalFinanceName'),
        description: tr('funds.themeMinimalFinanceDesc'),
        isDefault: false,
    },
    {
        id: 'arcade-quest',
        name: tr('funds.themeArcadeQuestName'),
        description: tr('funds.themeArcadeQuestDesc'),
        isDefault: false,
    },
    {
        id: 'cozy-journey',
        name: tr('funds.themeCozyJourneyName'),
        description: tr('funds.themeCozyJourneyDesc'),
        isDefault: false,
    },
    {
        id: 'christmas-wonderland',
        name: tr('funds.themeChristmasWonderlandName'),
        description: tr('funds.themeChristmasWonderlandDesc'),
        isDefault: false,
        isSeasonal: true,
    },
]);

export function getReportThemeName(theme: FundReportThemeId): string {
    return REPORT_THEME_OPTIONS().find((opt) => opt.id === theme)?.name ?? theme;
}

function ThemeMiniatureArtwork({ themeId }: { themeId: FundReportThemeId }) {
    const p = FUND_REPORT_THEME_PALETTES[themeId];
    if (themeId === 'minimal-finance') {
        return (
            <div className="relative h-20 w-full overflow-hidden rounded-lg border border-black/10" style={{ backgroundColor: p.background }}>
                <div className="h-5 w-full px-2.5 pt-1.5" style={{ backgroundColor: p.secondary, borderBottom: `2px solid ${p.accent}` }}>
                    <div className="h-1.5 w-16 rounded-full bg-white/85" />
                </div>
                <div className="mx-2 mt-1.5 rounded-md border border-black/5 bg-white p-1.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                        <div className="h-2.5 w-12 rounded-sm" style={{ backgroundColor: p.primary }} />
                        <div className="h-2 w-6 rounded-full" style={{ backgroundColor: p.accent }} />
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
                        <div className="h-full w-3/4 rounded-full" style={{ backgroundColor: p.primary }} />
                    </div>
                    <div className="mt-1.5 grid grid-cols-3 gap-1">
                        <div className="h-1.5 rounded-sm bg-stone-200" />
                        <div className="h-1.5 rounded-sm bg-stone-200" />
                        <div className="h-1.5 rounded-sm bg-stone-200" />
                    </div>
                </div>
            </div>
        );
    }
    if (themeId === 'arcade-quest') {
        return (
            <div
                className="relative h-20 w-full overflow-hidden rounded-lg border"
                style={{ backgroundColor: p.background, borderColor: `${p.secondary}88` }}
            >
                <div className="flex items-center justify-between px-2.5 pt-2">
                    <div className="h-1.5 w-14 rounded-full" style={{ backgroundColor: p.primary }} />
                    <div className="h-2.5 w-7 rounded-sm border" style={{ borderColor: p.accent, backgroundColor: `${p.accent}25` }} />
                </div>
                <div className="mx-2 mt-1.5 flex items-center gap-1.5">
                    <div className="flex-1 rounded-md border p-1.5" style={{ backgroundColor: p.surface, borderColor: `${p.secondary}66` }}>
                        <div className="h-2.5 w-11 rounded-sm" style={{ backgroundColor: p.primary }} />
                        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-black/40">
                            <div
                                className="h-full w-4/5 rounded-full"
                                style={{ background: `linear-gradient(90deg, ${p.secondary}, ${p.primary}, ${p.accent})` }}
                            />
                        </div>
                    </div>
                    <div
                        className="flex size-10 shrink-0 items-center justify-center rounded-md border"
                        style={{ backgroundColor: p.surface, borderColor: `${p.primary}77` }}
                    >
                        <Gamepad2 className="size-4" style={{ color: p.accent }} />
                    </div>
                </div>
            </div>
        );
    }
    if (themeId === 'cozy-journey') {
        return (
            <div className="relative h-20 w-full overflow-hidden rounded-lg border border-amber-900/15" style={{ backgroundColor: p.background }}>
                <div className="mx-2 mt-2 flex items-center justify-between rounded-md border border-amber-900/10 bg-[#FFFCF5] px-2 py-1">
                    <div className="h-2 w-14 rounded-full" style={{ backgroundColor: p.text }} />
                    <div className="h-2.5 w-8 rotate-[-4deg] rounded-sm border border-dashed" style={{ borderColor: p.accent, backgroundColor: `${p.accent}33` }} />
                </div>
                <div className="mx-2 mt-1.5 flex items-center gap-2 rounded-md border border-amber-900/10 bg-[#FFFCF5] p-1.5">
                    <div className="flex-1">
                        <div className="h-2 w-12 rounded-full" style={{ backgroundColor: p.primary }} />
                        <div className="relative mt-2 h-1.5 w-full rounded-full" style={{ backgroundColor: `${p.secondary}88` }}>
                            <div className="h-full w-2/3 rounded-full" style={{ backgroundColor: p.primary }} />
                            <div className="absolute -top-0.5 left-2/3 size-2.5 rounded-full border border-white" style={{ backgroundColor: p.accent }} />
                        </div>
                    </div>
                    <div
                        className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed"
                        style={{ backgroundColor: `${p.secondary}44`, borderColor: p.primary }}
                    >
                        <Compass className="size-4" style={{ color: p.text }} />
                    </div>
                </div>
            </div>
        );
    }
    if (themeId === 'christmas-wonderland') {
        return (
            <div
                className="relative h-20 w-full overflow-hidden rounded-lg border p-1.5"
                style={{ backgroundColor: p.background, borderColor: `${p.primary}99` }}
            >
                <div
                    className="flex h-full flex-col justify-between rounded-md border p-1.5"
                    style={{ borderColor: `${p.primary}66`, backgroundColor: p.surface }}
                >
                    <div className="flex items-center justify-between gap-1">
                        <div className="h-2 w-14 rounded-full" style={{ backgroundColor: p.text }} />
                        <span
                            className="flex size-5 items-center justify-center rounded-full border"
                            style={{ backgroundColor: p.secondary, borderColor: p.primary }}
                        >
                            <Snowflake className="size-3" style={{ color: p.text }} />
                        </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-black/30">
                        <div
                            className="h-full w-4/5 rounded-full"
                            style={{ background: `linear-gradient(90deg, #2FA682, ${p.primary})` }}
                        />
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                        <div className="h-1.5 rounded-sm" style={{ backgroundColor: p.secondary }} />
                        <div className="h-1.5 rounded-sm bg-emerald-400/75" />
                        <div className="h-1.5 rounded-sm" style={{ backgroundColor: p.primary }} />
                    </div>
                </div>
            </div>
        );
    }
    // Classic Default
    return (
        <div className="relative h-20 w-full overflow-hidden rounded-lg border border-slate-700/80" style={{ backgroundColor: p.background }}>
            <div className="flex items-center justify-between px-2.5 pt-2">
                <div className="h-2 w-16 rounded-full" style={{ backgroundColor: p.text }} />
                <div className="h-2.5 w-9 rounded-sm border" style={{ borderColor: p.primary }} />
            </div>
            <div className="px-2.5 pt-2">
                <div className="h-3 w-14 rounded-sm" style={{ backgroundColor: p.primary }} />
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full w-3/4 rounded-full" style={{ backgroundColor: p.primary }} />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                    <div className="h-1.5 rounded-sm" style={{ backgroundColor: p.accent }} />
                    <div className="h-1.5 rounded-sm" style={{ backgroundColor: p.secondary }} />
                    <div className="h-1.5 rounded-sm bg-slate-600" />
                </div>
            </div>
        </div>
    );
}

const THEME_ICON: Record<FundReportThemeId, typeof LayoutTemplate> = {
    default: LayoutTemplate,
    'minimal-finance': Landmark,
    'arcade-quest': Gamepad2,
    'cozy-journey': Compass,
    'christmas-wonderland': Snowflake,
};

export function ReportThemeSelector({
    value,
    onChange,
    disabled = false,
}: {
    value: FundReportThemeId;
    onChange: (theme: FundReportThemeId) => void;
    disabled?: boolean;
}) {
    const options = REPORT_THEME_OPTIONS();
    const byId = new Map(options.map((opt) => [opt.id, opt]));

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Palette className="size-3.5 text-primary" />
                    <span>{tr('funds.cardTheme')}</span>
                </div>
                <span className="text-[11px] text-muted-foreground">{tr('funds.cardThemeHint')}</span>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {FUND_REPORT_THEMES.map((id) => {
                    const opt = byId.get(id)!;
                    const active = value === id;
                    const palette = FUND_REPORT_THEME_PALETTES[id];
                    const Icon = THEME_ICON[id];

                    return (
                        <button
                            key={id}
                            type="button"
                            disabled={disabled}
                            aria-pressed={active}
                            onClick={() => onChange(id)}
                            className={cn(
                                'group relative flex flex-col gap-2 rounded-xl border bg-card/70 p-2 text-left transition-all hover:border-primary/60 hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none',
                                active && 'border-primary bg-primary/5 ring-2 ring-primary/40 shadow-xs',
                            )}
                        >
                            <div className="relative w-full">
                                <ThemeMiniatureArtwork themeId={id} />
                                {active && (
                                    <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                                        <Check className="size-3" />
                                    </span>
                                )}
                            </div>

                            <div className="space-y-1 px-0.5">
                                <div className="flex items-center justify-between gap-1.5">
                                    <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-foreground">
                                        <Icon className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
                                        <span className="truncate">{opt.name}</span>
                                    </span>
                                    {opt.isDefault && (
                                        <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-[10px]">
                                            {tr('funds.defaultThemeBadge')}
                                        </Badge>
                                    )}
                                    {opt.isSeasonal && (
                                        <Badge
                                            variant="outline"
                                            className="h-4 shrink-0 border-[#C94145]/45 bg-[#C94145]/12 px-1.5 text-[10px] font-semibold text-[#C94145] dark:text-[#FCA5A5]"
                                        >
                                            {tr('funds.seasonalThemeBadge')}
                                        </Badge>
                                    )}
                                </div>
                                <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{opt.description}</p>
                                <div className="flex items-center gap-1 pt-0.5">
                                    {[palette.background, palette.primary, palette.secondary, palette.accent].map((hex) => (
                                        <span
                                            key={hex}
                                            className="size-2.5 rounded-full border border-black/15 dark:border-white/20"
                                            style={{ backgroundColor: hex }}
                                        />
                                    ))}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
