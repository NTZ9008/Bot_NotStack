import { CONFIG_GROUPS, type ConfigRow } from '@notstack/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { configQuery, updateConfig } from '@/api/bot';
import { guildChannelsQuery } from '@/api/guilds';
import { ChannelSelect } from '@/components/channel-select';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useGuildId } from '@/hooks/use-guild';
import { errorMessage } from '@/lib/api';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/config')({
    loader: ({ context, params }) => context.queryClient.ensureQueryData(configQuery(params.guildId)),
    component: ConfigPage,
});

const GROUP_DESCRIPTIONS: Record<string, string> = {
    ห้อง: 'ห้องที่บอทใช้ส่งข้อความของระบบต่างๆ — เลือก "ไม่ส่ง" เพื่อปิดระบบนั้น',
    ความสามารถในแชท: 'เปิด/ปิดสิ่งที่บอททำอัตโนมัติในแชทของเซิร์ฟเวอร์นี้ (เซิร์ฟเวอร์ใหม่ปิดไว้ก่อน ยกเว้นเฝ้าระวังห้องเสียง)',
};

// แก้ค่าแล้วบันทึกทันที (ไม่มีปุ่ม Save) — ห้องเลือกจาก dropdown, สวิตช์เปิด/ปิด
function ConfigField({ row }: { row: ConfigRow }) {
    const guildId = useGuildId();
    const queryClient = useQueryClient();
    const { data: channels = [] } = useQuery(guildChannelsQuery(guildId));
    const mutation = useMutation({
        mutationFn: (value: string) => updateConfig(guildId, { key: row.key, value }),
        onSuccess: () => {
            toast.success('บันทึกแล้ว', { description: row.label });
            void queryClient.invalidateQueries({ queryKey: configQuery(guildId).queryKey });
        },
        onError: (err) => toast.error('บันทึกไม่สำเร็จ', { description: errorMessage(err) }),
    });
    const value = mutation.isPending ? (mutation.variables ?? row.value) : row.value;

    if (row.type === 'boolean') {
        return (
            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                <div className="space-y-0.5">
                    <Label htmlFor={row.key}>{row.label}</Label>
                    <p className="text-xs text-muted-foreground">{row.description}</p>
                </div>
                <div className="flex items-center gap-2">
                    {mutation.isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                    <Switch id={row.key} checked={value === 'true'} disabled={mutation.isPending} onCheckedChange={(checked) => mutation.mutate(String(checked))} />
                </div>
            </div>
        );
    }

    return (
        <div className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center sm:gap-4">
            <div className="space-y-0.5">
                <Label htmlFor={row.key}>{row.label}</Label>
                <p className="text-xs text-muted-foreground">{row.description}</p>
            </div>
            <div className="flex items-center gap-2">
                <ChannelSelect
                    id={row.key}
                    channels={channels.filter((channel) => channel.sendable)}
                    value={value}
                    noneLabel="— ไม่ส่ง —"
                    disabled={mutation.isPending}
                    onChange={(channelId) => mutation.mutate(channelId)}
                />
                {mutation.isPending && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
            </div>
        </div>
    );
}

function ConfigPage() {
    const guildId = useGuildId();
    const { data, isLoading, error } = useQuery(configQuery(guildId));
    return (
        <>
            <PageHeader title="Configuration" description="ห้องที่บอทใช้ และความสามารถของบอทในเซิร์ฟเวอร์นี้ — บันทึกทันทีที่เปลี่ยน" />
            {isLoading ? (
                <LoadingState />
            ) : error ? (
                <ErrorState error={error} />
            ) : (
                CONFIG_GROUPS.map((group) => (
                    <Card key={group}>
                        <CardHeader>
                            <CardTitle>{group}</CardTitle>
                            <CardDescription>{GROUP_DESCRIPTIONS[group]}</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4">
                            {data?.filter((row) => row.group === group).map((row) => <ConfigField key={row.key} row={row} />)}
                        </CardContent>
                    </Card>
                ))
            )}
        </>
    );
}
