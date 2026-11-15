import type {
    CustomSummaryDetailMode,
    CustomSummaryPdfRequestInput,
    CustomSummaryPdfTheme,
    CustomSummaryResponse,
} from '@notstack/shared';
import { CheckCircle2, Download, FileText, Loader2, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { exportCustomSummaryPdf } from '@/api/custom-summary';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
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
    const defaultTitle = `รายงานสรุปกิจกรรมเซิร์ฟเวอร์ ${summary.guild.name}`;
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
            setError('กรุณากรอกชื่อหัวข้อรายงาน');
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
            setLastExportInfo(`สร้างไฟล์ PDF สำเร็จ (${kb.toLocaleString('en-US')} KB) — ดาวน์โหลดแล้ว`);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setExporting(false);
        }
    };

    const isLight = theme === 'light';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-3 overflow-hidden border-[#1e2638] bg-[#111625] p-5 text-slate-100 sm:max-w-2xl">
                <DialogHeader className="shrink-0">
                    <DialogTitle className="flex items-center gap-2 text-lg text-slate-100">
                        <FileText className="size-5 text-indigo-400" />
                        ตั้งค่าการส่งออกรายงาน PDF
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-400">
                        สร้างไฟล์ PDF ขนาด A4 รองรับภาษาไทย 100% สระและวรรณยุกต์จัดวางอัตโนมัติ
                    </DialogDescription>
                </DialogHeader>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                    {/* 1. ชื่อหัวข้อรายงาน */}
                    <div className="space-y-1.5">
                        <Label htmlFor="pdf-report-title" className="text-xs font-medium text-slate-300">
                            ชื่อหัวข้อรายงาน
                        </Label>
                        <Input
                            id="pdf-report-title"
                            value={title}
                            maxLength={160}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="เช่น รายงานสรุปกิจกรรมเซิร์ฟเวอร์ NotStackOverflow ประจำเดือน..."
                            className="h-9 border-[#1e2638] bg-[#0b0e17] text-sm text-slate-100"
                        />
                    </div>

                    {/* 2. เลือกโทนสี PDF */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-300">โทนสีเอกสาร PDF</Label>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <button
                                type="button"
                                onClick={() => setTheme('dark')}
                                className={cn(
                                    'flex items-start gap-3 rounded-xl border p-3 text-left transition-all',
                                    theme === 'dark'
                                        ? 'border-indigo-500 bg-indigo-600/15'
                                        : 'border-[#1e2638] bg-[#0b0e17] hover:border-slate-700',
                                )}
                            >
                                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-[#0b0e17] text-indigo-400">
                                    <Moon className="size-4" />
                                </span>
                                <div>
                                    <div className="text-xs font-semibold text-slate-100">Dark Theme</div>
                                    <p className="mt-0.5 text-[11px] text-slate-400">พื้นหลังกรมท่า #0b0e17 เหมาะสำหรับเปิดดูบนหน้าจอและนำเสนอ</p>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setTheme('light')}
                                className={cn(
                                    'flex items-start gap-3 rounded-xl border p-3 text-left transition-all',
                                    theme === 'light'
                                        ? 'border-indigo-500 bg-indigo-600/15'
                                        : 'border-[#1e2638] bg-[#0b0e17] hover:border-slate-700',
                                )}
                            >
                                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-amber-600">
                                    <Sun className="size-4" />
                                </span>
                                <div>
                                    <div className="text-xs font-semibold text-slate-100">Print-Friendly Light Theme</div>
                                    <p className="mt-0.5 text-[11px] text-slate-400">พื้นขาว #ffffff ประหยัดหมึก เหมาะสำหรับพิมพ์ส่งเอกสารทางการ</p>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* 3. ซ่อน/แสดง Log รายบรรทัด */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-300">รูปแบบรายละเอียดรายงาน</Label>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <button
                                type="button"
                                onClick={() => setDetailMode('executive')}
                                className={cn(
                                    'rounded-xl border p-3 text-left transition-all',
                                    detailMode === 'executive'
                                        ? 'border-indigo-500 bg-indigo-600/15'
                                        : 'border-[#1e2638] bg-[#0b0e17] hover:border-slate-700',
                                )}
                            >
                                <div className="text-xs font-semibold text-slate-100">Executive Summary</div>
                                <p className="mt-0.5 text-[11px] text-slate-400">สรุป KPI, กราฟเปรียบเทียบ และตารางแยกตามห้อง/ผู้ใช้งาน</p>
                            </button>

                            <button
                                type="button"
                                onClick={() => setDetailMode('detailed')}
                                className={cn(
                                    'rounded-xl border p-3 text-left transition-all',
                                    detailMode === 'detailed'
                                        ? 'border-indigo-500 bg-indigo-600/15'
                                        : 'border-[#1e2638] bg-[#0b0e17] hover:border-slate-700',
                                )}
                            >
                                <div className="text-xs font-semibold text-slate-100">Full Detailed Report</div>
                                <p className="mt-0.5 text-[11px] text-slate-400">
                                    รวมทุกส่วนข้างต้น + ตารางรายการ Log รายบรรทัดท้ายรายงาน ({summary.detailedLogs.length} รายการ)
                                </p>
                            </button>
                        </div>
                    </div>

                    {/* ตัวเลือกความเป็นส่วนตัวในไฟล์ PDF */}
                    <label className="flex cursor-pointer items-center justify-between rounded-xl border border-[#1e2638] bg-[#0b0e17] px-3.5 py-2.5 text-xs">
                        <div>
                            <div className="font-medium text-slate-200">ซ่อน Discord User ID และ Server ID ในเอกสาร PDF</div>
                            <p className="mt-0.5 text-[11px] text-slate-400">เปิดใช้งานเมื่อต้องการส่งต่อรายงานออกนอกองค์กร (ค่าเริ่มต้น: แสดง ID)</p>
                        </div>
                        <input
                            type="checkbox"
                            checked={maskIds}
                            onChange={(e) => setMaskIds(e.target.checked)}
                            className="size-4 accent-indigo-600"
                        />
                    </label>

                    {/* 4. ตัวอย่างหัว-ท้ายหน้ากระดาษ A4 */}
                    <div
                        className={cn(
                            'rounded-xl border p-3.5 text-xs transition-colors',
                            isLight ? 'border-slate-300 bg-white text-slate-900' : 'border-[#1e2638] bg-[#0b0e17] text-slate-100',
                        )}
                    >
                        <div className="flex items-center justify-between border-b pb-2 text-[11px] opacity-80">
                            <span className="font-semibold text-indigo-500">Bot_NotStack V4.2.0 • {summary.guild.name}</span>
                            <span>ขนาด A4 • แบ่งหน้าอัตโนมัติ</span>
                        </div>
                        <div className="mt-2 font-semibold">{title.trim() || defaultTitle}</div>
                        <div className="mt-1 grid gap-1 text-[11px] opacity-75 sm:grid-cols-2">
                            <span>
                                ช่วงข้อมูล: {formatBangkokDateTime(summary.range.from)} - {formatBangkokDateTime(summary.range.to)}
                            </span>
                            <span>Admin ผู้ดึงรายงาน: {adminName}</span>
                            <span>
                                ห้องที่กรอง:{' '}
                                {summary.filters.selectedChannels.length === 0
                                    ? `ทั้งหมด (${summary.availableChannels.length} ห้อง)`
                                    : `${summary.filters.selectedChannels.length} ห้อง`}
                            </span>
                            <span>โหมด: {detailMode === 'detailed' ? 'Full Detailed Report' : 'Executive Summary'}</span>
                        </div>
                        <div className="mt-2.5 flex items-center justify-between border-t pt-2 text-[10px] opacity-65">
                            <span>Generated by Bot_NotStack Dashboard</span>
                            <span>หน้า 1 จาก Y</span>
                        </div>
                    </div>

                    {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
                    {lastExportInfo && (
                        <p className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                            <CheckCircle2 className="size-4 shrink-0" />
                            <span>{lastExportInfo}</span>
                        </p>
                    )}
                </div>

                <DialogFooter className="shrink-0 gap-2 pt-1">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        className="text-slate-300 hover:bg-slate-800 hover:text-white"
                    >
                        ปิดหน้าต่าง
                    </Button>
                    <Button
                        type="button"
                        onClick={handleDownload}
                        disabled={exporting || !queryPayload}
                        className="bg-indigo-600 text-white hover:bg-indigo-500"
                    >
                        {exporting ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Download className="mr-1.5 size-4" />}
                        {exporting ? 'กำลังสร้างไฟล์ PDF...' : 'ดาวน์โหลด PDF'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
