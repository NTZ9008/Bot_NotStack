import { tr, byLang, trText } from '../../../../../lib/i18n';
import { Spinner } from '@/components/ui/spinner';
import { CONFIG_GROUPS, type ConfigRow } from '@notstack/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { toast } from 'sonner';
import { configQuery, updateConfig } from '@/api/bot';
import { guildChannelsQuery } from '@/api/guilds';
import { ChannelSelect } from '@/components/channel-select';
import { PageHeader } from '@/components/page-header';
import { ConfigBodySkeleton } from '@/components/skeleton/guild-pages';
import { ErrorState } from '@/components/states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useGuildId } from '@/hooks/use-guild';
import { errorMessage } from '@/lib/api';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/config')({
    loader: ({ context, params }) =>
        Promise.all([
            context.queryClient.ensureQueryData(configQuery(params.guildId)),
            context.queryClient.ensureQueryData(guildChannelsQuery(params.guildId)).catch(() => undefined),
        ]),
    component: ConfigPage,
});

const GROUP_DESCRIPTIONS = byLang((): Record<string, string> => ({
    ห้อง: tr('config.channelsTheBotUsesForEach'),
    ความสามารถในแชท: tr('config.turnOnOffWhatTheBot'),
}));

// แก้ค่าแล้วบันทึกทันที (ไม่มีปุ่ม Save) — ห้องเลือกจาก dropdown, สวิตช์เปิด/ปิด
function ConfigField({ row }: { row: ConfigRow }) {
    const guildId = useGuildId();
    const queryClient = useQueryClient();
    const { data: channels = [] } = useQuery(guildChannelsQuery(guildId));
    const mutation = useMutation({
        mutationFn: (value: string) => updateConfig(guildId, { key: row.key, value }),
        onSuccess: () => {
            toast.success(tr('common.saved'), { description: row.label });
            void queryClient.invalidateQueries({ queryKey: configQuery(guildId).queryKey });
        },
        onError: (err) => toast.error(tr('common.saveFailed'), { description: errorMessage(err) }),
    });
    const value = mutation.isPending ? (mutation.variables ?? row.value) : row.value;

    if (row.type === 'boolean') {
        return (
            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                <div className="space-y-0.5">
                    <Label htmlFor={row.key}>{row.label}</Label>
                    <p id={`${row.key}-hint`} className="text-xs text-muted-foreground">
                        {row.description}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {mutation.isPending && <Spinner className="size-4 text-muted-foreground" />}
                    <span className="text-xs text-muted-foreground">{value === 'true' ? tr('common.on') : tr('common.off')}</span>
                    <Switch
                        aria-describedby={`${row.key}-hint`}
                        id={row.key}
                        checked={value === 'true'}
                        disabled={mutation.isPending}
                        onCheckedChange={(checked) => mutation.mutate(String(checked))}
                    />
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
                    noneLabel={tr('common.dontSend')}
                    disabled={mutation.isPending}
                    onChange={(channelId) => mutation.mutate(channelId)}
                />
                {mutation.isPending && <Spinner className="size-4 shrink-0 text-muted-foreground" />}
            </div>
        </div>
    );
}

function ConfigPage() {
    const guildId = useGuildId();
    const { data, isLoading, error } = useQuery(configQuery(guildId));
    return (
        <>
            <PageHeader help="config" title={tr('common.botSettings')} description={tr('config.channelsTheBotUsesAndIts')} />
            {isLoading ? (
                <ConfigBodySkeleton />
            ) : error ? (
                <ErrorState error={error} />
            ) : (
                CONFIG_GROUPS.map((group) => (
                    <Card key={group}>
                        <CardHeader>
                            <CardTitle>{trText(group)}</CardTitle>
                            <CardDescription>{GROUP_DESCRIPTIONS()[group]}</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4">
                            {data
                                ?.filter((row) => row.group === group)
                                .map((row) => (
                                    <ConfigField key={row.key} row={row} />
                                ))}
                        </CardContent>
                    </Card>
                ))
            )}
        </>
    );
}
