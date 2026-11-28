import { DEFAULT_FUND_REPORT_THEME, isFundReportTheme, type FundReportThemeId, type FundTopicDetail } from '@notstack/shared';
import { Spinner } from '@/components/ui/spinner';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Eye, EyeOff, MessageSquareShare, Send } from '@/components/icons';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { fundApi } from '@/api/fund';
import { guildChannelsQuery } from '@/api/guilds';
import { ChannelSelect, channelLabel } from '@/components/channel-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useGuildId } from '@/hooks/use-guild';
import { ReportCardPreview } from './report-card-preview';
import { ReportThemeSelector } from './report-theme-selector';
import { onFundError, useFundRefresh } from './utils';
import { tr } from '../../lib/i18n';

function readStoredTheme(topicId: number): FundReportThemeId {
    try {
        const stored = localStorage.getItem(`notstack:fund-report-theme:${topicId}`);
        return isFundReportTheme(stored) ? stored : DEFAULT_FUND_REPORT_THEME;
    } catch {
        return DEFAULT_FUND_REPORT_THEME;
    }
}

function saveStoredTheme(topicId: number, theme: FundReportThemeId): void {
    try {
        localStorage.setItem(`notstack:fund-report-theme:${topicId}`, theme);
    } catch {
        // โหมดส่วนตัวหรือปิด storage
    }
}

// ==========================================
// ส่งรายงานเข้า Discord (เลือกธีมการ์ด + แถบกะทัดรัด + ดูตัวอย่างรูปการ์ด PNG ก่อนส่ง)
// ==========================================
export function ReportCard({ topic }: { topic: FundTopicDetail }) {
    const guildId = useGuildId();
    const refresh = useFundRefresh();
    const { data: allChannels = [] } = useQuery(guildChannelsQuery(guildId));
    const textChannels = allChannels.filter((ch) => ch.sendable);
    const [mentionUnpaid, setMentionUnpaid] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [selectedTheme, setSelectedTheme] = useState<FundReportThemeId>(() => readStoredTheme(topic.id));

    const unpaidMembers = useMemo(() => topic.members.filter((m) => m.status !== 'paid'), [topic.members]);
    const previewUrl = useMemo(
        () => fundApi.reportImageUrl(guildId, topic.id, topic.updatedAt, selectedTheme),
        [guildId, topic.id, topic.updatedAt, selectedTheme],
    );

    const handleThemeChange = (theme: FundReportThemeId) => {
        setSelectedTheme(theme);
        saveStoredTheme(topic.id, theme);
        if (!showPreview) setShowPreview(true);
    };

    const saveChannel = useMutation({
        mutationFn: (reportChannelId: string) => fundApi.update(guildId, topic.id, { reportChannelId }),
        onSuccess: () => {
            toast.success(tr('funds.reportChannelSaved'));
            void refresh();
        },
        onError: onFundError,
    });
    const send = useMutation({
        mutationFn: () => fundApi.sendReport(guildId, topic.id, { mentionUnpaid, theme: selectedTheme }),
        onSuccess: (res) => toast.success(res.message ?? tr('funds.reportCardSentToDiscord')),
        onError: onFundError,
    });

    return (
        <Card className="border-border/80">
            <CardContent className="space-y-4 py-3.5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2.5">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            <MessageSquareShare className="size-4 shrink-0 text-primary" />
                            <span>{tr('funds.sendReportCardToDiscord')}</span>
                        </div>
                        <div className="w-full min-w-0 sm:w-64">
                            <ChannelSelect
                                aria-label={tr('funds.pickReportChannel')}
                                channels={textChannels}
                                value={topic.reportChannelId}
                                onChange={(id) => saveChannel.mutate(id)}
                                noneLabel={tr('funds.pickReportChannel')}
                                disabled={saveChannel.isPending}
                            />
                        </div>
                        {topic.reportChannelId && (
                            <span className="hidden text-xs text-muted-foreground xl:inline">
                                {tr('funds.sendsTo', { 0: channelLabel(textChannels, topic.reportChannelId) })}
                            </span>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                        <Label className="flex cursor-pointer items-center gap-2 rounded-lg border bg-muted/20 px-2.5 py-1.5 text-xs font-normal hover:bg-muted/40">
                            <Checkbox checked={mentionUnpaid} onCheckedChange={(checked) => setMentionUnpaid(checked === true)} />
                            <span>{tr('funds.tagUnpaidMembers')}</span>
                            <Badge variant="outline" className="h-4 px-1 text-[10px] tabular-nums">
                                {tr('funds.peopleCount', { 0: unpaidMembers.length })}
                            </Badge>
                        </Label>

                        <div className="flex flex-1 items-center justify-end gap-2 sm:flex-initial">
                            <Button type="button" variant="ghost" size="sm" onClick={() => setShowPreview((v) => !v)}>
                                {showPreview ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                                {showPreview ? tr('funds.hideImagePreview') : tr('funds.showImagePreview')}
                            </Button>

                            <Button size="sm" onClick={() => send.mutate()} disabled={send.isPending || !topic.reportChannelId}>
                                {send.isPending ? <Spinner /> : <Send />}
                                {send.isPending ? tr('funds.sending') : tr('funds.sendReport')}
                            </Button>
                        </div>
                    </div>
                </div>

                <ReportThemeSelector value={selectedTheme} onChange={handleThemeChange} disabled={send.isPending} />

                {showPreview && (
                    <ReportCardPreview
                        topic={topic}
                        theme={selectedTheme}
                        previewUrl={previewUrl}
                        channelText={topic.reportChannelId ? tr('funds.channelIs', { 0: channelLabel(textChannels, topic.reportChannelId) }) : ''}
                        mentionUnpaid={mentionUnpaid}
                        unpaidMembers={unpaidMembers}
                    />
                )}
            </CardContent>
        </Card>
    );
}
