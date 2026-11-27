import { tr } from '../../lib/i18n';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { CustomSummaryDetailMode, CustomSummaryPdfRequestInput, CustomSummaryPdfTheme, CustomSummaryResponse } from '@notstack/shared';
import { CheckCircle2, Download, FileText, Moon, Sun } from '@/components/icons';
import { useEffect, useState } from 'react';
import { exportCustomSummaryPdf } from '@/api/custom-summary';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatBangkokDateTime } from './timezone';

export interface PdfExportModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    guildId: string;
    adminName: string;
    summary: CustomSummaryResponse;
    queryPayload: CustomSummaryPdfRequestInput | null;
}

/** Modal ตั้งค่าและดาวน์โหลดรายงาน PDF ขนาด A4 (รองรับภาษาไทย 100%) */
export function PdfExportModal({ open, onOpenChange, guildId, adminName, summary, queryPayload }: PdfExportModalProps) {
    const defaultTitle = tr('customSummary.serverActivitySummaryFor', { 0: summary.guild.name });
    const [title, setTitle] = useState(defaultTitle);
    const [theme, setTheme] = useState<CustomSummaryPdfTheme>('dark');
    const [detailMode, setDetailMode] = useState<CustomSummaryDetailMode>('executive');
    const [maskIds, setMaskIds] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastExportInfo, setLastExportInfo] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setError(null);
            setLastExportInfo(null);
            setTitle((prev) => prev.trim() || defaultTitle);
        }
    }, [open, defaultTitle]);

    const handleDownload = async () => {
        if (!queryPayload || exporting) return;
        const cleanTitle = title.trim();
        if (!cleanTitle) {
            setError(tr('customSummary.pleaseEnterAReportTitle'));
            return;
        }

        setExporting(true);
        setError(null);
        setLastExportInfo(null);

        try {
            const { blob, filename } = await exportCustomSummaryPdf(guildId, {
                ...queryPayload,
                title: cleanTitle,
                theme,
                detailMode,
                includeDetailedLogs: detailMode === 'detailed',
                maskIds,
            });

            const downloadUrl = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = downloadUrl;
            anchor.download = filename || `notstack-summary-${guildId}.pdf`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(downloadUrl), 4000);

            const kb = Math.max(1, Math.round(blob.size / 1024));
            setLastExportInfo(tr('customSummary.pdfCreatedKbDownloaded', { 0: kb.toLocaleString('en-US') }));
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setExporting(false);
        }
    };

    const isLight = theme === 'light';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-3 overflow-hidden border-border bg-card p-5 text-foreground sm:max-w-2xl">
                <DialogHeader className="shrink-0">
                    <DialogTitle className="flex items-center gap-2 text-lg text-foreground">
                        <FileText className="size-5 text-highlight" />

                        {tr('customSummary.pdfReportExportSettings')}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">{tr('customSummary.createsAnA4PdfWithFull')}</DialogDescription>
                </DialogHeader>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                    {/* 1. ชื่อหัวข้อรายงาน */}
                    <div className="space-y-1.5">
                        <Label htmlFor="pdf-report-title" className="text-xs font-medium text-muted-foreground">
                            {tr('customSummary.reportTitle')}
                        </Label>
                        <Input
                            id="pdf-report-title"
                            value={title}
                            maxLength={160}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder={tr('customSummary.eGMonthlyNotstackoverflowServerActivity')}
                            className="h-9 border-border bg-background text-sm text-foreground"
                        />
                    </div>

                    {/* 2. เลือกโทนสี PDF */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">{tr('customSummary.pdfColorScheme')}</Label>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <button
                                type="button"
                                onClick={() => setTheme('dark')}
                                className={cn(
                                    'flex items-start gap-3 rounded-xl border p-3 text-left transition-all',
                                    theme === 'dark' ? 'border-highlight bg-highlight/15' : 'border-border bg-background hover:border-border',
                                )}
                            >
                                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-highlight">
                                    <Moon className="size-4" />
                                </span>
                                <div>
                                    <div className="text-xs font-semibold text-foreground">Dark Theme</div>
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">{tr('customSummary.navyBackground0b0e17BestForViewing')}</p>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setTheme('light')}
                                className={cn(
                                    'flex items-start gap-3 rounded-xl border p-3 text-left transition-all',
                                    theme === 'light' ? 'border-highlight bg-highlight/15' : 'border-border bg-background hover:border-border',
                                )}
                            >
                                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-amber-700">
                                    <Sun className="size-4" />
                                </span>
                                <div>
                                    <div className="text-xs font-semibold text-foreground">Print-Friendly Light Theme</div>
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">{tr('customSummary.whiteBackgroundFfffffSavesInkBest')}</p>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* 3. ซ่อน/แสดง Log รายบรรทัด */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">{tr('customSummary.reportDetailLevel')}</Label>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <button
                                type="button"
                                onClick={() => setDetailMode('executive')}
                                className={cn(
                                    'rounded-xl border p-3 text-left transition-all',
                                    detailMode === 'executive' ? 'border-highlight bg-highlight/15' : 'border-border bg-background hover:border-border',
                                )}
                            >
                                <div className="text-xs font-semibold text-foreground">Executive Summary</div>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">{tr('customSummary.kpiSummaryComparisonChartsAndTables')}</p>
                            </button>

                            <button
                                type="button"
                                onClick={() => setDetailMode('detailed')}
                                className={cn(
                                    'rounded-xl border p-3 text-left transition-all',
                                    detailMode === 'detailed' ? 'border-highlight bg-highlight/15' : 'border-border bg-background hover:border-border',
                                )}
                            >
                                <div className="text-xs font-semibold text-foreground">Full Detailed Report</div>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                    {tr('customSummary.everythingAboveALineByLine')}
                                    {summary.detailedLogs.length} {tr('customSummary.entries2')}
                                </p>
                            </button>
                        </div>
                    </div>

                    {/* ตัวเลือกความเป็นส่วนตัวในไฟล์ PDF */}
                    <label
                        aria-label={tr('customSummary.hideDiscordUserIdsAndServer')}
                        className="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs"
                    >
                        <div>
                            <div className="font-medium text-foreground">{tr('customSummary.hideDiscordUserIdsAndServer')}</div>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">{tr('customSummary.turnOnWhenSharingTheReport')}</p>
                        </div>
                        <Checkbox checked={maskIds} onCheckedChange={(checked) => setMaskIds(checked === true)} />
                    </label>

                    {/* 4. ตัวอย่างหัว-ท้ายหน้ากระดาษ A4 */}
                    <div
                        className={cn(
                            'rounded-xl border p-3.5 text-xs transition-colors',
                            isLight ? 'border-slate-300 bg-white text-slate-900' : 'border-border bg-background text-foreground',
                        )}
                    >
                        <div className="flex items-center justify-between border-b pb-2 text-[11px] opacity-80">
                            <span className="font-semibold text-highlight">Bot_NotStack V4.2.0 • {summary.guild.name}</span>
                            <span>{tr('customSummary.a4AutomaticPageBreaks')}</span>
                        </div>
                        <div className="mt-2 font-semibold">{title.trim() || defaultTitle}</div>
                        <div className="mt-1 grid gap-1 text-[11px] opacity-75 sm:grid-cols-2">
                            <span>
                                {tr('customSummary.dataRange')} {formatBangkokDateTime(summary.range.from)} - {formatBangkokDateTime(summary.range.to)}
                            </span>
                            <span>
                                {tr('customSummary.exportedByAdmin')} {adminName}
                            </span>
                            <span>
                                {tr('customSummary.filteredChannels')}{' '}
                                {summary.filters.selectedChannels.length === 0
                                    ? tr('customSummary.allChannels', { 0: summary.availableChannels.length })
                                    : tr('customSummary.channels', { 0: summary.filters.selectedChannels.length })}
                            </span>
                            <span>
                                {tr('customSummary.mode')} {detailMode === 'detailed' ? 'Full Detailed Report' : 'Executive Summary'}
                            </span>
                        </div>
                        <div className="mt-2.5 flex items-center justify-between border-t pt-2 text-[10px] opacity-65">
                            <span>Generated by Bot_NotStack Dashboard</span>
                            <span>{tr('customSummary.page1OfY')}</span>
                        </div>
                    </div>

                    {error && (
                        <Alert variant="destructive">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    {lastExportInfo && (
                        <Alert variant="success">
                            <CheckCircle2 />
                            <AlertDescription>{lastExportInfo}</AlertDescription>
                        </Alert>
                    )}
                </div>

                <DialogFooter className="shrink-0 gap-2 pt-1">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        className="text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                        {tr('customSummary.close')}
                    </Button>
                    <Button
                        type="button"
                        onClick={handleDownload}
                        disabled={exporting || !queryPayload}
                        className="bg-primary text-primary-foreground hover:bg-primary/80"
                    >
                        {exporting ? <Spinner className="mr-1.5 size-4" /> : <Download className="mr-1.5 size-4" />}
                        {exporting ? tr('customSummary.creatingPdf') : tr('customSummary.downloadPdf')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
