import { formatBaht, roundMoney, type FundTopicDetail } from '@notstack/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Eye, EyeOff, Loader2, MessageSquareShare, Send } from 'lucide-react';
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
import { dailyRateOf, onFundError, percent, useFundRefresh } from './utils';

// ==========================================
// 📊 ส่งรายงานเข้า Discord (แถบกะทัดรัด + ดูตัวอย่างข้อความก่อนส่ง)
// ==========================================
export function ReportCard({ topic }: { topic: FundTopicDetail }) {
    const guildId = useGuildId();
    const refresh = useFundRefresh();
    const { data: allChannels = [] } = useQuery(guildChannelsQuery(guildId));
    const textChannels = allChannels.filter((ch) => ch.sendable);
    const [mentionUnpaid, setMentionUnpaid] = useState(false);
    const [showPreview, setShowPreview] = useState(false);

    const unpaidMembers = useMemo(() => topic.members.filter((m) => m.status !== 'paid'), [topic.members]);
    const paidMembers = useMemo(() => topic.members.filter((m) => m.status === 'paid'), [topic.members]);
    const pct = percent(topic.collected, topic.target);
    const remaining = Math.max(0, roundMoney(topic.target - topic.collected));
    const dailyRate = dailyRateOf(topic);

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
        onSuccess: (res) => toast.success(res.message ?? 'ส่งรายงานเข้า Discord แล้ว'),
        onError: onFundError,
    });

    const filledBlocks = Math.round((pct / 100) * 10);
    const textBar = `${'█'.repeat(filledBlocks)}${'░'.repeat(Math.max(0, 10 - filledBlocks))} ${pct}%`;

    return (
        <Card className="border-border/80">
            <CardContent className="space-y-3 py-3.5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-2.5">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            <MessageSquareShare className="size-4 text-primary" />
                            <span>ส่งรายงานเข้า Discord</span>
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
                            <span className="hidden text-xs text-muted-foreground xl:inline">ส่งเข้า {channelLabel(textChannels, topic.reportChannelId)}</span>
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
                            {showPreview ? 'ซ่อนตัวอย่าง' : 'ดูตัวอย่าง'}
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
                            <span>ตัวอย่างข้อความที่จะถูกส่งเข้าห้อง Discord</span>
                            {topic.reportChannelId && <span>ห้อง: {channelLabel(textChannels, topic.reportChannelId)}</span>}
                        </div>

                        {mentionUnpaid && unpaidMembers.length > 0 && (
                            <p className="mb-2 rounded bg-[#5865f2]/15 px-2 py-1 text-[#c9cdfb]">
                                🔔 แจ้งเตือนยอดค้างชำระ:{' '}
                                {unpaidMembers.slice(0, 8).map((m) => (
                                    <span key={m.id} className="mr-1 font-medium text-[#dee0fc]">
                                        @{m.displayName}
                                    </span>
                                ))}
                                {unpaidMembers.length > 8 && <span>และอีก {unpaidMembers.length - 8} คน</span>}
                            </p>
                        )}

                        <div className="space-y-2 rounded border-l-4 border-l-[#10b981] bg-[#2b2d31] p-3">
                            <p className="text-sm font-bold text-white">💰 {topic.name}</p>
                            {topic.description && <p className="whitespace-pre-line text-[#b5bac1]">{topic.description}</p>}
                            <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-3">
                                <div>
                                    <p className="text-[11px] font-semibold text-[#949ba4]">🎯 เป้าหมายรวม</p>
                                    <p className="font-semibold text-white">{formatBaht(topic.target)}</p>
                                </div>
                                <div>
                                    <p className="text-[11px] font-semibold text-[#949ba4]">💵 เก็บได้แล้ว</p>
                                    <p className="font-semibold text-emerald-400">{formatBaht(topic.collected)}</p>
                                </div>
                                <div>
                                    <p className="text-[11px] font-semibold text-[#949ba4]">⏳ คงค้าง</p>
                                    <p className="font-semibold text-amber-400">{formatBaht(remaining)}</p>
                                </div>
                            </div>
                            <p className="font-mono text-[11px] text-white">
                                {textBar} · จ่ายครบ {paidMembers.length}/{topic.memberCount} คน
                                {dailyRate ? ` · วันละ ${formatBaht(dailyRate)}` : ''}
                            </p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
