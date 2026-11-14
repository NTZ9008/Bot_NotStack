import { CUSTOM_SUMMARY_MODULES, type CustomSummaryRequestInput } from '@notstack/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Clock, Layers3, Sparkles } from 'lucide-react';
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
    loader: ({ context, params }) =>
        context.queryClient.ensureQueryData(customSummaryChannelsQuery(params.guildId)).catch(() => undefined),
    component: CustomLogSummaryPage,
});

function createDefaultDraft(): { draft: CustomSummaryDraftFilter; payload: CustomSummaryRequestInput } {
    const { fromInput, toInput, fromIso, toIso } = bangkokPresetInputs(24 * 7);
    const draft: CustomSummaryDraftFilter = {
        preset: '7d',
        fromInput,
        toInput,
        interval: 'auto',
        channelIds: [],
        modules: [...CUSTOM_SUMMARY_MODULES],
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
        modules: [...CUSTOM_SUMMARY_MODULES],
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
                    <div key={idx} className="rounded-xl border border-[#1e2638] bg-[#111625] p-5">
                        <Skeleton className="h-4 w-32 bg-slate-800" />
                        <Skeleton className="mt-3 h-9 w-28 bg-slate-800" />
                        <Skeleton className="mt-3 h-3 w-44 bg-slate-800" />
                    </div>
                ))}
            </div>
            <div className="rounded-xl border border-[#1e2638] bg-[#111625] p-5">
                <Skeleton className="h-5 w-52 bg-slate-800" />
                <Skeleton className="mt-4 h-[260px] w-full bg-slate-800/70" />
            </div>
        </div>
    );
}

function CustomLogSummaryPage() {
    const guildId = useGuildId();
    const guild = useGuild();
    const { user } = useAuth();
    const adminName = user.displayName || user.username || 'ผู้ดูแลระบบ';

    const initial = useMemo(() => createDefaultDraft(), []);
    const [draft, setDraft] = useState<CustomSummaryDraftFilter>(initial.draft);
    const [appliedQuery, setAppliedQuery] = useState<{ payload: CustomSummaryRequestInput; nonce: number }>({
        payload: initial.payload,
        nonce: 0,
    });
    const [pdfOpen, setPdfOpen] = useState(false);

    const { data: channels = [], isLoading: channelsLoading } = useQuery(customSummaryChannelsQuery(guildId));

    const validationError = useMemo(() => {
        const fromDate = fromBangkokInput(draft.fromInput);
        const toDate = fromBangkokInput(draft.toInput);
        if (!fromDate || !toDate) return 'กรุณาระบุวัน-เวลาเริ่มต้นและสิ้นสุดให้ครบถ้วน';
        if (fromDate.getTime() > toDate.getTime()) return 'วันเวลาเริ่มต้นต้องไม่มากกว่าวันเวลาสิ้นสุด';
        if (draft.modules.length === 0) return 'กรุณาเลือกประเภทกิจกรรมอย่างน้อย 1 รายการ';
        return null;
    }, [draft.fromInput, draft.toInput, draft.modules.length]);

    const {
        data: summary,
        isLoading,
        isFetching,
        error,
    } = useQuery({
        queryKey: ['guilds', guildId, 'custom-summary', 'report', appliedQuery.payload, appliedQuery.nonce],
        queryFn: ({ signal }) => fetchCustomSummary(guildId, appliedQuery.payload, signal),
    });

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
        const next = createDefaultDraft();
        setDraft(next.draft);
        setAppliedQuery((prev) => ({ payload: next.payload, nonce: prev.nonce + 1 }));
    }, []);

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
            modules: draft.modules,
            ...(draft.userId ? { userId: draft.userId } : {}),
            ...(!draft.userId && draft.userQuery.trim() ? { userQuery: draft.userQuery.trim() } : {}),
            includeBots: draft.includeBots,
            includeDetailedLogs: true,
            detailedLogLimit: 200,
        };

        setAppliedQuery((prev) => ({ payload, nonce: prev.nonce + 1 }));
    }, [draft, validationError]);

    return (
        <>
            <PageHeader
                help="customSummary"
                title="สร้างรายงานสรุป"
                description={`สรุปสถิติห้องเสียง ข้อความ GitHub PR และ DevOps แบบกำหนดเงื่อนไขได้เองสำหรับ ${guild.name}`}
            />

            <div className="space-y-5 rounded-2xl border border-[#1e2638] bg-[#0b0e17] p-4 sm:p-5">
                <FilterBuilder
                    guildId={guildId}
                    draft={draft}
                    channels={channels}
                    channelsLoading={channelsLoading}
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
                    <ErrorState error={error} title="ประมวลผลสรุปล็อกไม่สำเร็จ" />
                ) : isLoading || !summary ? (
                    <CustomSummaryLoadingSkeleton />
                ) : (
                    <div className="space-y-5">
                        {/* แถบสถานะผลลัพธ์ที่ประมวลผลล่าสุด */}
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#1e2638] bg-[#111625]/90 px-4 py-2.5 text-xs">
                            <div className="flex flex-wrap items-center gap-2 text-slate-300">
                                <Sparkles className="size-4 text-indigo-400" />
                                <span className="font-medium text-slate-100">{summary.guild.name}</span>
                                <span className="text-slate-500">•</span>
                                <span>
                                    {formatBangkokDateTime(summary.range.from)} — {formatBangkokDateTime(summary.range.to)}
                                </span>
                                <Badge variant="outline" className="border-[#1e2638] bg-[#0b0e17] text-[11px] text-indigo-300">
                                    <Layers3 className="mr-1 size-3" />
                                    {summary.filters.selectedChannels.length === 0
                                        ? `ทุกห้อง (${summary.availableChannels.length} ห้อง)`
                                        : `${summary.filters.selectedChannels.length} ห้องที่เลือก`}
                                </Badge>
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                <Clock className="size-3.5" />
                                <span>ประมวลผลล่าสุด: {formatBangkokDateTime(summary.generatedAt)}</span>
                            </div>
                        </div>

                        <SummaryKpis summary={summary} />
                        <SummaryCharts summary={summary} />
                        <SummaryTables summary={summary} />

                        <PdfExportModal
                            open={pdfOpen}
                            onOpenChange={setPdfOpen}
                            guildId={guildId}
                            adminName={adminName}
                            summary={summary}
                            queryPayload={{
                                ...appliedQuery.payload,
                                title: `รายงานสรุปกิจกรรมเซิร์ฟเวอร์ ${summary.guild.name}`,
                                theme: 'dark',
                                detailMode: 'executive',
                            }}
                        />
                    </div>
                )}
            </div>
        </>
    );
}
