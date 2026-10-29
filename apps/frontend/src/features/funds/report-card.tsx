import type { FundTopicDetail } from '@notstack/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Bell, Eye, EyeOff, Image as ImageIcon, Loader2, MessageSquareShare, Send } from 'lucide-react';
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
import { onFundError, useFundRefresh } from './utils';

// ==========================================
// ส่งรายงานเข้า Discord (แถบกะทัดรัด + ดูตัวอย่างรูปการ์ด PNG ก่อนส่ง)
// ==========================================
export function ReportCard({ topic }: { topic: FundTopicDetail }) {
    const guildId = useGuildId();
    const refresh = useFundRefresh();
    const { data: allChannels = [] } = useQuery(guildChannelsQuery(guildId));
    const textChannels = allChannels.filter((ch) => ch.sendable);
    const [mentionUnpaid, setMentionUnpaid] = useState(false);
    const [showPreview, setShowPreview] = useState(false);

    const unpaidMembers = useMemo(() => topic.members.filter((m) => m.status !== 'paid'), [topic.members]);
    const previewUrl = useMemo(
        () => fundApi.reportImageUrl(guildId, topic.id, topic.updatedAt),
        [guildId, topic.id, topic.updatedAt],
    );

    const saveChannel = useMutation({
        mutationFn: (reportChannelId: string) => fundApi.update(guildId, topic.id, { reportChannelId }),
        onSuccess: () => {
            toast.success('บันทึกห้องรายงานแล้ว');
            void refresh();
        },
        onError: onFundError,
    });
    const send = useMutation({
        mutationFn: () => fundApi.sendReport(guildId, topic.id, { mentionUnpaid }),
        onSuccess: (res) => toast.success(res.message ?? 'ส่งรูปการ์ดรายงานเข้า Discord แล้ว'),
        onError: onFundError,
    });

    return (
        <Card className="border-border/80">
            <CardContent className="space-y-3 py-3.5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-2.5">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            <MessageSquareShare className="size-4 text-primary" />
                            <span>ส่งรูปการ์ดรายงานเข้า Discord</span>
                        </div>
                        <div className="w-56 sm:w-64">
                            <ChannelSelect
                                channels={textChannels}
                                value={topic.reportChannelId}
                                onChange={(id) => saveChannel.mutate(id)}
                                noneLabel="-- เลือกห้องส่งรายงาน --"
                                disabled={saveChannel.isPending}
                            />
                        </div>
                        {topic.reportChannelId && (
                            <span className="hidden text-xs text-muted-foreground xl:inline">
                                ส่งเข้า {channelLabel(textChannels, topic.reportChannelId)}
                            </span>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <Label className="flex cursor-pointer items-center gap-2 rounded-lg border bg-muted/20 px-2.5 py-1.5 text-xs font-normal hover:bg-muted/40">
                            <Checkbox checked={mentionUnpaid} onCheckedChange={(checked) => setMentionUnpaid(checked === true)} />
                            <span>แท็กคนค้างชำระ</span>
                            <Badge variant="outline" className="h-4 px-1 text-[10px] tabular-nums">
                                {unpaidMembers.length} คน
                            </Badge>
                        </Label>

                        <Button type="button" variant="ghost" size="sm" onClick={() => setShowPreview((v) => !v)}>
                            {showPreview ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                            {showPreview ? 'ซ่อนตัวอย่างรูป' : 'ดูตัวอย่างรูปภาพ'}
                        </Button>

                        <Button size="sm" onClick={() => send.mutate()} disabled={send.isPending || !topic.reportChannelId}>
                            {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                            {send.isPending ? 'กำลังส่ง...' : 'ส่งรายงาน'}
                        </Button>
                    </div>
                </div>

                {showPreview && (
                    <div className="rounded-xl border bg-[#313338] p-3.5 text-xs text-[#dbdee1] shadow-inner">
                        <div className="mb-2 flex items-center justify-between text-[11px] text-[#949ba4]">
                            <span className="flex items-center gap-1.5">
                                <ImageIcon className="size-3.5" /> ตัวอย่างรูปการ์ดรายงานที่จะถูกส่งเข้าห้อง Discord (PNG)
                            </span>
                            {topic.reportChannelId && <span>ห้อง: {channelLabel(textChannels, topic.reportChannelId)}</span>}
                        </div>

                        {mentionUnpaid && unpaidMembers.length > 0 && (
                            <p className="mb-2.5 flex flex-wrap items-center gap-1 rounded bg-[#5865f2]/15 px-2.5 py-1.5 text-[#c9cdfb]">
                                <Bell className="size-3.5 shrink-0 text-[#dee0fc]" />
                                <span>ยังจ่ายไม่ครบ:</span>
                                {unpaidMembers.slice(0, 8).map((m) => (
                                    <span key={m.id} className="font-medium text-[#dee0fc]">
                                        @{m.displayName}
                                    </span>
                                ))}
                                {unpaidMembers.length > 8 && <span>และอีก {unpaidMembers.length - 8} คน</span>}
                            </p>
                        )}

                        <div className="overflow-hidden rounded-lg border border-white/10 bg-[#18191c]">
                            <img
                                src={previewUrl}
                                alt={`รายงานการเก็บเงิน: ${topic.name}`}
                                className="h-auto w-full max-w-3xl object-contain"
                                loading="lazy"
                            />
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
