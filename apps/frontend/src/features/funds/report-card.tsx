import type { FundTopicDetail } from '@notstack/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, Send } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { fundApi } from '@/api/fund';
import { guildChannelsQuery } from '@/api/guilds';
import { ChannelSelect, channelLabel } from '@/components/channel-select';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useGuildId } from '@/hooks/use-guild';
import { onFundError, useFundRefresh } from './utils';

// ==========================================
// 📊 ส่งรายงานเข้า Discord
// ==========================================
export function ReportCard({ topic }: { topic: FundTopicDetail }) {
    const guildId = useGuildId();
    const refresh = useFundRefresh();
    const { data: allChannels = [] } = useQuery(guildChannelsQuery(guildId));
    const textChannels = allChannels.filter((ch) => ch.sendable);
    const [mentionUnpaid, setMentionUnpaid] = useState(false);

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
        onSuccess: (res) => toast.success(res.message ?? 'ส่งรายงานแล้ว'),
        onError: onFundError,
    });

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">📊 ส่งรายงานเข้า Discord</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <Field
                    label="ห้องส่งรายงาน"
                    hint={topic.reportChannelId ? `ส่งเข้า ${channelLabel(textChannels, topic.reportChannelId)}` : 'เลือกห้องก่อนส่งรายงาน'}
                >
                    <ChannelSelect
                        channels={textChannels}
                        value={topic.reportChannelId}
                        onChange={(id) => saveChannel.mutate(id)}
                        noneLabel="ยังไม่เลือก"
                        disabled={saveChannel.isPending}
                    />
                </Field>
                <div className="flex flex-wrap items-center gap-3">
                    <Label className="flex items-center gap-2 font-normal cursor-pointer">
                        <Checkbox checked={mentionUnpaid} onCheckedChange={(checked) => setMentionUnpaid(checked === true)} />
                        แท็กคนที่ยังจ่ายไม่ครบ
                    </Label>
                    <Button onClick={() => send.mutate()} disabled={send.isPending || !topic.reportChannelId}>
                        {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                        {send.isPending ? 'กำลังส่ง...' : 'ส่งรายงาน'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
