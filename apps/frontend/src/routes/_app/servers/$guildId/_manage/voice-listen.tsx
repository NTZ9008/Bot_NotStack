import { tr, byLang } from '../../../../../lib/i18n';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Headphones, LogOut, Play, Square, Volume2 } from '@/components/icons';
import { useState } from 'react';
import { toast } from 'sonner';
import { voiceChannelsQuery } from '@/api/guilds';
import { voiceListenApi, voiceListenQuery } from '@/api/voice-listen';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { useVoiceStream, type VoiceStreamStatus } from '@/features/voice-listen/use-voice-stream';
import { useGuildId } from '@/hooks/use-guild';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/voice-listen')({
    loader: ({ context: { queryClient }, params, preload }) => {
        const loading = Promise.all([
            queryClient.prefetchQuery(voiceListenQuery(params.guildId)),
            queryClient.prefetchQuery(voiceChannelsQuery(params.guildId)),
        ]);
        return preload ? loading : undefined;
    },
    component: VoiceListenPage,
});

const STREAM_LABEL = byLang((): Record<VoiceStreamStatus, string> => ({
    stopped: tr('voiceListen.notListening'),
    connecting: tr('common.connecting'),
    live: tr('voiceListen.listeningLive'),
    reconnecting: tr('voiceListen.disconnectedReconnecting'),
}));

function VoiceListenPage() {
    const guildId = useGuildId();
    const queryClient = useQueryClient();
    const status = useQuery(voiceListenQuery(guildId));
    const channels = useQuery(voiceChannelsQuery(guildId));
    const [channelId, setChannelId] = useState('');
    const stream = useVoiceStream(guildId);

    const refresh = () => queryClient.invalidateQueries({ queryKey: voiceListenQuery(guildId).queryKey });
    const onError = (err: unknown) => toast.error(tr('common.error'), { description: errorMessage(err) });
    const join = useMutation({
        mutationFn: (id: string) => voiceListenApi.join(guildId, id),
        onSuccess: (next) => {
            queryClient.setQueryData(voiceListenQuery(guildId).queryKey, next);
            toast.success(tr('voiceListen.botJoined', { 0: next.channel?.name ?? '' }));
        },
        onError,
    });
    const leave = useMutation({
        mutationFn: () => voiceListenApi.leave(guildId),
        onSuccess: () => {
            stream.stop();
            toast.success(tr('voiceListen.botLeftTheVoiceChannel'));
            void refresh();
        },
        onError,
    });

    if (status.isError) return <ErrorState error={status.error} />;
    const data = status.data;
    const inRoom = data?.state === 'ready' && !!data.channel;
    const selected = channelId || data?.channel?.id || '';

    return (
        <>
            <PageHeader help="voiceListen" title={tr('common.voiceListen')} description={tr('voiceListen.haveTheBotJoinAVoice')} />
            <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>{tr('common.voiceChannels')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <Select value={selected} onValueChange={setChannelId}>
                                <SelectTrigger className="w-full sm:flex-1" aria-label={tr('voiceListen.pickAVoiceChannel')}>
                                    <SelectValue placeholder={tr('voiceListen.pickAVoiceChannel')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {(channels.data ?? []).map((channel) => (
                                        <SelectItem key={channel.id} value={channel.id}>
                                            🔊 {channel.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button disabled={!selected || join.isPending || (inRoom && selected === data?.channel?.id)} onClick={() => join.mutate(selected)}>
                                <Headphones />
                                {join.isPending ? tr('voiceListen.joining') : inRoom ? tr('voiceListen.moveToThisChannel') : tr('voiceListen.haveTheBotJoin')}
                            </Button>
                        </div>
                        <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                            <span className="truncate">
                                {data?.state === 'connecting'
                                    ? tr('voiceListen.connectingToVoice')
                                    : inRoom
                                      ? tr('voiceListen.botIsIn', { 0: data?.channel?.name })
                                      : tr('voiceListen.theBotIsntInAVoice')}
                            </span>
                            {data?.state !== 'idle' && (
                                <Button variant="outline" size="sm" disabled={leave.isPending} onClick={() => leave.mutate()}>
                                    <LogOut />

                                    {tr('voiceListen.makeTheBotLeave')}
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex-row items-center justify-between gap-2">
                        <CardTitle>{tr('voiceListen.listen')}</CardTitle>
                        <Badge variant={stream.status === 'live' ? 'success' : 'secondary'}>{STREAM_LABEL()[stream.status]}</Badge>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {stream.status === 'stopped' ? (
                            <Button className="w-full" disabled={!inRoom} onClick={stream.start}>
                                <Play />

                                {tr('voiceListen.startListening')}
                            </Button>
                        ) : (
                            <Button className="w-full" variant="outline" onClick={stream.stop}>
                                <Square />

                                {tr('voiceListen.stopListening')}
                            </Button>
                        )}
                        <div className="flex items-center gap-3">
                            <Volume2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                            <Slider
                                aria-label={tr('voiceListen.volume')}
                                min={0}
                                max={2}
                                step={0.05}
                                value={[stream.volume]}
                                onValueChange={([value]) => stream.setVolume(value ?? 1)}
                            />
                            <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">{Math.round(stream.volume * 100)}%</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {tr('voiceListen.listeningOnTheWebNow')} {data?.listeners ?? 0} {tr('common.people')}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card className="mt-4">
                <CardHeader>
                    <CardTitle>{tr('voiceListen.inTheChannel')}</CardTitle>
                </CardHeader>
                <CardContent>
                    {!inRoom || !data?.members.length ? (
                        <EmptyState>{inRoom ? tr('voiceListen.noOneIsInTheChannel') : tr('voiceListen.haveTheBotJoinFirstTo')}</EmptyState>
                    ) : (
                        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {data.members.map((member) => (
                                <li key={member.userId} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                                    <img
                                        src={member.avatar}
                                        alt=""
                                        className={cn('size-8 rounded-full ring-2 ring-transparent transition-shadow', member.speaking && 'ring-success')}
                                    />
                                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{member.name}</span>
                                    {member.bot && <Badge variant="secondary">BOT</Badge>}
                                    {member.speaking && <span className="text-xs text-success">{tr('voiceListen.speaking')}</span>}
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </>
    );
}
