import type { FundMemberView, FundReportThemeId, FundTopicDetail } from '@notstack/shared';
import { Bell, Download, Image as ImageIcon } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useState } from 'react';
import { toast } from 'sonner';
import { fundApi } from '@/api/fund';
import { useGuildId } from '@/hooks/use-guild';
import { tr } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { getReportThemeName } from './report-theme-selector';
import { onFundError } from './utils';

// ==========================================
// ตัวส่งออก PNG การ์ดรายงานตามธีมที่เลือก
// ==========================================
export function ReportImageExporter({
    topic,
    theme,
}: {
    topic: Pick<FundTopicDetail, 'id' | 'name'>;
    theme: FundReportThemeId;
}) {
    const guildId = useGuildId();
    const [downloading, setDownloading] = useState(false);

    const handleDownload = async () => {
        setDownloading(true);
        try {
            await fundApi.downloadReportPng(guildId, topic.id, topic.name, theme);
            toast.success(tr('funds.pngDownloaded'));
        } catch (err) {
            onFundError(err);
        } finally {
            setDownloading(false);
        }
    };

    return (
        <Button type="button" variant="secondary" size="xs" onClick={() => void handleDownload()} disabled={downloading}>
            {downloading ? <Spinner /> : <Download className="size-3.5" />}
            {tr('funds.downloadPng')}
        </Button>
    );
}

// ==========================================
// ตัวอย่างการ์ดรายงานในกรอบ Discord (สลับธีมแล้วเปลี่ยนรูปทันทีโดยไม่กระตุก)
// ==========================================
export function ReportCardPreview({
    topic,
    theme,
    previewUrl,
    channelText,
    mentionUnpaid,
    unpaidMembers,
}: {
    topic: FundTopicDetail;
    theme: FundReportThemeId;
    previewUrl: string;
    channelText: string;
    mentionUnpaid: boolean;
    unpaidMembers: FundMemberView[];
}) {
    const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
    const [failedUrl, setFailedUrl] = useState<string | null>(null);
    const themeName = getReportThemeName(theme);
    const isLoading = loadedUrl !== previewUrl && failedUrl !== previewUrl;
    const hasError = failedUrl === previewUrl;

    return (
        <div className="dark rounded-xl border bg-[#313338] p-2.5 text-xs text-[#dbdee1] shadow-inner sm:p-3.5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#949ba4]">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1.5">
                        <ImageIcon className="size-3.5 shrink-0" /> {tr('funds.reportCardPreviewPng')}
                    </span>
                    <Badge variant="outline" className="h-5 border-white/15 bg-white/5 px-2 text-[10px] text-[#dbdee1]">
                        {themeName}
                    </Badge>
                </div>
                <div className="flex items-center gap-2">
                    {channelText && <span>{channelText}</span>}
                    <ReportImageExporter topic={topic} theme={theme} />
                </div>
            </div>

            {mentionUnpaid && unpaidMembers.length > 0 && (
                <p className="mb-2.5 flex flex-wrap items-center gap-1 rounded bg-[#5865f2]/15 px-2.5 py-1.5 text-[#c9cdfb]">
                    <Bell className="size-3.5 shrink-0 text-[#dee0fc]" />
                    <span>{tr('funds.notFullyPaid')}</span>
                    {unpaidMembers.slice(0, 8).map((m) => (
                        <span key={m.id} className="font-medium text-[#dee0fc]">
                            @{m.displayName}
                        </span>
                    ))}
                    {unpaidMembers.length > 8 && <span>{tr('funds.andMorePeople', { 0: unpaidMembers.length - 8 })}</span>}
                </p>
            )}

            <div className="dark relative min-h-40 overflow-hidden rounded-lg border border-white/10 bg-[#18191c]">
                {hasError ? (
                    <div className="flex min-h-40 items-center justify-center px-4 py-8 text-center text-xs text-[#f87171]">
                        {tr('funds.downloadReportPngError')}
                    </div>
                ) : (
                    <img
                        src={previewUrl}
                        alt={tr('funds.fundReportAlt', { 0: topic.name })}
                        onLoad={() => setLoadedUrl(previewUrl)}
                        onError={() => setFailedUrl(previewUrl)}
                        className={cn('h-auto w-full max-w-3xl object-contain transition-opacity duration-200', isLoading ? 'opacity-65' : 'opacity-100')}
                    />
                )}

                {isLoading && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25 backdrop-blur-[1px]">
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#1e1f22]/90 px-3 py-1.5 text-xs font-medium text-[#f2f3f5] shadow-md">
                            <Spinner />
                            {tr('funds.themeUpdating', { 0: themeName })}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
