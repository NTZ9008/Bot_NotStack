import { CUSTOM_SUMMARY_MODULES, filterActiveSummaryModules, type CustomSummaryModule, type CustomSummaryRequestInput, type PluginId } from '@notstack/shared';
import { useT, tr } from '@/lib/i18n';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Clock, Layers3, Sparkles } from '@/components/icons';
import { useCallback, useMemo, useState } from 'react';
import { customSummaryChannelsQuery, fetchCustomSummary } from '@/api/custom-summary';
import { PageHeader } from '@/components/page-header';
import { ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FilterBuilder, type CustomSummaryDraftFilter, type DatePresetKey } from '@/features/custom-summary/filter-builder';
import { PdfExportModal } from '@/features/custom-summary/pdf-export-modal';
import { SummaryCharts } from '@/features/custom-summary/summary-charts';
import { SummaryKpis } from '@/features/custom-summary/summary-kpis';
import { SummaryTables } from '@/features/custom-summary/summary-tables';
import { bangkokPresetInputs, formatBangkokDateTime, fromBangkokInput } from '@/features/custom-summary/timezone';
import { useAuth } from '@/hooks/use-auth';
import { useGuild, useGuildId } from '@/hooks/use-guild';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/custom-summary')({
    loader: ({ context, params }) => context.queryClient.ensureQueryData(customSummaryChannelsQuery(params.guildId)).catch(() => undefined),
    component: CustomLogSummaryPage,
});

function createDefaultDraft(installedPlugins?: readonly PluginId[]): { draft: CustomSummaryDraftFilter; payload: CustomSummaryRequestInput } {
    const { fromInput, toInput, fromIso, toIso } = bangkokPresetInputs(24 * 7);
    const defaultModules = filterActiveSummaryModules(CUSTOM_SUMMARY_MODULES, installedPlugins);
    const draft: CustomSummaryDraftFilter = {
        preset: '7d',
        fromInput,
        toInput,
        interval: 'auto',
        channelIds: [],
        modules: defaultModules,
        userId: null,
        userQuery: '',
        selectedUserLabel: null,
        includeBots: false,
    };
    const payload: CustomSummaryRequestInput = {
        from: fromIso,
        to: toIso,
        interval: 'auto',
        channelIds: [],
        modules: defaultModules,
        includeBots: false,
        includeDetailedLogs: true,
        detailedLogLimit: 200,
    };
    return { draft, payload };
}

function CustomSummaryLoadingSkeleton() {
    return (
        <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[0, 1, 2, 3].map((idx) => (
                    <div key={idx} className="rounded-xl border border-border bg-card p-5">
                        <Skeleton className="h-4 w-32 bg-muted" />
                        <Skeleton className="mt-3 h-9 w-28 bg-muted" />
                        <Skeleton className="mt-3 h-3 w-44 bg-muted" />
                    </div>
                ))}
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
                <Skeleton className="h-5 w-52 bg-muted" />
                <Skeleton className="mt-4 h-[260px] w-full bg-muted/70" />
            </div>
        </div>
    );
}

function CustomLogSummaryPage() {
    const t = useT();
    const guildId = useGuildId();
    const guild = useGuild();
    const { user } = useAuth();
    const adminName = user.displayName || user.username || tr('customSummary.systemAdmin');

    const initial = useMemo(() => createDefaultDraft(guild.installedPlugins), [guild.installedPlugins]);
    const [draft, setDraft] = useState<CustomSummaryDraftFilter>(initial.draft);
    const [appliedQuery, setAppliedQuery] = useState<{ payload: CustomSummaryRequestInput; nonce: number }>({
        payload: initial.payload,
        nonce: 0,
    });
    const [pdfOpen, setPdfOpen] = useState(false);

    const { data: channels = [], isLoading: channelsLoading } = useQuery(customSummaryChannelsQuery(guildId));

    const {
        data: summary,
        isLoading,
        isFetching,
        error,
    } = useQuery({
        queryKey: ['guilds', guildId, 'custom-summary', 'report', appliedQuery.payload, appliedQuery.nonce],
        queryFn: ({ signal }) => fetchCustomSummary(guildId, appliedQuery.payload, signal),
    });

    const installedPlugins = useMemo(() => summary?.installedPlugins ?? guild.installedPlugins ?? [], [summary?.installedPlugins, guild.installedPlugins]);
    const selectedActiveModules = useMemo(() => filterActiveSummaryModules(draft.modules, installedPlugins), [draft.modules, installedPlugins]);
    const anySummaryPluginInstalled = useMemo(
        () => installedPlugins.some((id) => id === 'github-pr' || id === 'grafana-alert' || id === 'jira-card'),
        [installedPlugins],
    );

    const validationError = useMemo(() => {
        const fromDate = fromBangkokInput(draft.fromInput);
        const toDate = fromBangkokInput(draft.toInput);
        if (!fromDate || !toDate) return tr('customSummary.pleaseFillInBothTheStart');
        if (fromDate.getTime() > toDate.getTime()) return tr('customSummary.theStartCantBeAfterThe');
        if (selectedActiveModules.length === 0) return tr('customSummary.pleasePickAtLeast1Activity');
        return null;
    }, [draft.fromInput, draft.toInput, selectedActiveModules.length]);

    const handleSelectPreset = useCallback((preset: DatePresetKey, hours?: number) => {
        if (preset === 'custom' || !hours) {
            setDraft((prev) => ({ ...prev, preset: 'custom' }));
            return;
        }
        const { fromInput, toInput } = bangkokPresetInputs(hours);
        setDraft((prev) => ({ ...prev, preset, fromInput, toInput }));
    }, []);

    const handleUpdateDraft = useCallback((patch: Partial<CustomSummaryDraftFilter>) => {
        setDraft((prev) => ({ ...prev, ...patch }));
    }, []);

    const handleReset = useCallback(() => {
        const next = createDefaultDraft(installedPlugins);
        setDraft(next.draft);
        setAppliedQuery((prev) => ({ payload: next.payload, nonce: prev.nonce + 1 }));
    }, [installedPlugins]);

    const handleRunSummary = useCallback(() => {
        if (validationError) return;
        let fromDate = fromBangkokInput(draft.fromInput);
        let toDate = fromBangkokInput(draft.toInput);

        // หากเลือก preset แบบ rolling (24h/7d/30d/90d) อัปเดตเวลาจนถึงวินาทีล่าสุดตอนกดประมวลผล
        const rollingHoursMap: Partial<Record<DatePresetKey, number>> = {
            '24h': 24,
            '7d': 24 * 7,
            '30d': 24 * 30,
            '90d': 24 * 90,
        };
        const rollingHours = rollingHoursMap[draft.preset];
        if (rollingHours) {
            const refreshed = bangkokPresetInputs(rollingHours);
            fromDate = new Date(refreshed.fromIso);
            toDate = new Date(refreshed.toIso);
            setDraft((prev) => ({ ...prev, fromInput: refreshed.fromInput, toInput: refreshed.toInput }));
        }

        if (!fromDate || !toDate) return;

        const payload: CustomSummaryRequestInput = {
            from: fromDate.toISOString(),
            to: toDate.toISOString(),
            interval: draft.interval,
            channelIds: draft.channelIds,
            modules: selectedActiveModules,
            ...(draft.userId ? { userId: draft.userId } : {}),
            ...(!draft.userId && draft.userQuery.trim() ? { userQuery: draft.userQuery.trim() } : {}),
            includeBots: draft.includeBots,
            includeDetailedLogs: true,
            detailedLogLimit: 200,
        };

        setAppliedQuery((prev) => ({ payload, nonce: prev.nonce + 1 }));
    }, [draft, selectedActiveModules, validationError]);

    return (
        <>
            <PageHeader
                help="customSummary"
                title={tr('common.summaryReport')}
                description={t(anySummaryPluginInstalled ? 'customSummary.customVoiceMessageGithubPrAnd' : 'customSummary.pageDescriptionCore', {
                    name: guild.name,
                })}
            />

            <FilterBuilder
                guildId={guildId}
                draft={draft}
                channels={channels}
                channelsLoading={channelsLoading}
                installedPlugins={installedPlugins}
                validationError={validationError}
                isProcessing={isFetching}
                hasSummary={Boolean(summary)}
                onSelectPreset={handleSelectPreset}
                onUpdate={handleUpdateDraft}
                onReset={handleReset}
                onRunSummary={handleRunSummary}
                onOpenPdfModal={() => setPdfOpen(true)}
            />

            {error ? (
                <ErrorState error={error} title={tr('customSummary.failedToRunTheLogSummary')} />
            ) : isLoading || !summary ? (
                <CustomSummaryLoadingSkeleton />
            ) : (
                <div className="space-y-5">
                    {/* แถบสถานะผลลัพธ์ที่ประมวลผลล่าสุด */}
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/90 px-4 py-2.5 text-xs">
                        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                            <Sparkles className="size-4 text-highlight" />
                            <span className="font-medium text-foreground">{summary.guild.name}</span>
                            <span className="text-muted-foreground">•</span>
                            <span>
                                {formatBangkokDateTime(summary.range.from)} — {formatBangkokDateTime(summary.range.to)}
                            </span>
                            <Badge variant="outline" className="border-border bg-background text-[11px] text-highlight">
                                <Layers3 className="mr-1 size-3" />
                                {summary.filters.selectedChannels.length === 0
                                    ? tr('customSummary.allChannels2', { 0: summary.availableChannels.length })
                                    : tr('customSummary.selectedChannels', { 0: summary.filters.selectedChannels.length })}
                            </Badge>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <Clock className="size-3.5" />
                            <span>
                                {tr('customSummary.lastRun')} {formatBangkokDateTime(summary.generatedAt)}
                            </span>
                        </div>
                    </div>

                    <SummaryKpis summary={summary} installedPlugins={installedPlugins} />
                    <SummaryCharts summary={summary} installedPlugins={installedPlugins} />
                    <SummaryTables summary={summary} installedPlugins={installedPlugins} />

                    <PdfExportModal
                        open={pdfOpen}
                        onOpenChange={setPdfOpen}
                        guildId={guildId}
                        adminName={adminName}
                        summary={summary}
                        queryPayload={{
                            ...appliedQuery.payload,
                            modules: filterActiveSummaryModules(
                                (appliedQuery.payload.modules ?? selectedActiveModules).filter((m): m is CustomSummaryModule => m !== 'devopsOther'),
                                installedPlugins,
                            ),
                            title: tr('customSummary.serverActivitySummaryFor', { 0: summary.guild.name }),
                            theme: 'dark',
                            detailMode: 'executive',
                        }}
                    />
                </div>
            )}
        </>
    );
}
