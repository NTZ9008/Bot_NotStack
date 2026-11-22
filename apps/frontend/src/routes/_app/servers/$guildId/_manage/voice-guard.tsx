import { tr } from '../../../../../lib/i18n';
import type { VoiceGuardChannel, VoiceGuardMode } from '@notstack/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Plus, Trash2, X } from '@/components/icons';
import { useState } from 'react';
import { toast } from 'sonner';
import { voiceChannelsQuery } from '@/api/guilds';
import { voiceGuardApi, voiceGuardQuery } from '@/api/bot';
import { useConfirm } from '@/components/confirm-dialog';
import { Field } from '@/components/field';
import { PageHeader } from '@/components/page-header';
import { VoiceGuardCardsSkeleton } from '@/components/skeleton/guild-pages';
import { EmptyState, ErrorState } from '@/components/states';
import { UserPicker } from '@/components/user-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useGuildId } from '@/hooks/use-guild';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/voice-guard')({
    validateSearch: (search: Record<string, unknown>): { mode?: 'whitelist' | 'blacklist' } => ({
        mode: search.mode === 'blacklist' ? 'blacklist' : 'whitelist',
    }),
    // เริ่มโหลดข้อมูลพร้อมกับโค้ดของหน้า (และตอนเอาเมาส์ชี้ลิงก์) — ไม่รอให้หน้า render ก่อน
    loaderDeps: ({ search }) => ({ mode: search.mode ?? 'whitelist' }),
    loader: ({ context: { queryClient }, params, deps, preload }) => {
        const loading = Promise.all([
            queryClient.prefetchQuery(voiceGuardQuery(params.guildId, deps.mode)),
            queryClient.prefetchQuery(voiceChannelsQuery(params.guildId)),
        ]);
        return preload ? loading : undefined;
    },
    component: VoiceGuardPage,
});

function ChannelCard({ mode, channel }: { mode: VoiceGuardMode; channel: VoiceGuardChannel }) {
    const guildId = useGuildId();
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const refresh = () => queryClient.invalidateQueries({ queryKey: voiceGuardQuery(guildId, mode).queryKey });
    const onError = (err: unknown) => {
        toast.error(tr('common.error'), { description: errorMessage(err) });
        void refresh();
    };

    const update = useMutation({
        mutationFn: (patch: { enabled?: boolean; notify?: boolean }) => voiceGuardApi.updateChannel(guildId, mode, { channelId: channel.channelId, ...patch }),
        onError,
        onSuccess: refresh,
    });
    const addUser = useMutation({
        mutationFn: (userId: string) => voiceGuardApi.addUser(guildId, mode, { channelId: channel.channelId, userId }),
        onSuccess: () => {
            toast.success(tr('voiceGuard.memberAdded'));
            void refresh();
        },
        onError,
    });
    const removeUser = useMutation({
        mutationFn: (userId: string) => voiceGuardApi.removeUser(guildId, mode, { channelId: channel.channelId, userId }),
        onSuccess: () => {
            toast.success(tr('voiceGuard.memberRemoved'));
            void refresh();
        },
        onError,
    });

    const remove = async () => {
        const ok = await confirm({
            title: tr('voiceGuard.confirmRemoval'),
            description: tr('voiceGuard.removeChannelFrom', { 0: channel.channelName, 1: mode }),
            confirmText: tr('common.deleted'),
            destructive: true,
        });
        if (!ok) return;
        try {
            await voiceGuardApi.deleteChannel(guildId, mode, channel.channelId);
            toast.success(tr('voiceGuard.channelRemoved'));
            void refresh();
        } catch (err) {
            onError(err);
        }
    };

    return (
        <Card className={cn(mode === 'blacklist' && 'border-destructive/30')}>
            <CardHeader className="flex-row items-center justify-between gap-2">
                <CardTitle className="truncate">🔊 {channel.channelName}</CardTitle>
                <div className="flex items-center gap-2">
                    <Switch checked={channel.enabled} onCheckedChange={(enabled) => update.mutate({ enabled })} aria-label={tr('common.enabled')} />
                    <Button variant="ghost" size="icon-sm" onClick={() => void remove()} aria-label={tr('voiceGuard.removeChannel')}>
                        <Trash2 className="text-destructive" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <Label className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 font-normal">
                    {tr('voiceGuard.dmUsersWhenTheyreKicked')}
                    <Switch checked={channel.notify} onCheckedChange={(notify) => update.mutate({ notify })} />
                </Label>
                <UserPicker
                    keepSelection={false}
                    placeholder={tr('voiceGuard.addMemberTypeANameOr')}
                    exclude={channel.users.map((u) => u.userId)}
                    onSelect={(user) => addUser.mutate(user.userId)}
                />
                {channel.users.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{tr('voiceGuard.noMembersYet')}</p>
                ) : (
                    <ul className="space-y-1.5">
                        {channel.users.map((u) => (
                            <li key={u.userId} className="flex items-center gap-3 rounded-lg border px-3 py-1.5">
                                <img src={u.avatar} alt="" className="size-7 rounded-full" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">{u.username}</p>
                                    <p className="truncate font-mono text-xs text-muted-foreground">{u.userId}</p>
                                </div>
                                <Button variant="ghost" size="icon-xs" aria-label={tr('voiceGuard.removeMember')} onClick={() => removeUser.mutate(u.userId)}>
                                    <X />
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}

function VoiceGuardPage() {
    const guildId = useGuildId();
    const { mode = 'whitelist' } = Route.useSearch();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [channelId, setChannelId] = useState('');
    const channels = useQuery(voiceChannelsQuery(guildId));
    const list = useQuery(voiceGuardQuery(guildId, mode));

    const add = useMutation({
        mutationFn: () => voiceGuardApi.updateChannel(guildId, mode, { channelId, enabled: true }),
        onSuccess: () => {
            toast.success(tr('voiceGuard.channelAdded'));
            setChannelId('');
            void queryClient.invalidateQueries({ queryKey: voiceGuardQuery(guildId, mode).queryKey });
        },
        onError: (err) => toast.error(tr('common.error'), { description: errorMessage(err) }),
    });

    return (
        <>
            <PageHeader
                help="voiceGuard"
                title={tr('common.voiceGuard')}
                description={tr('voiceGuard.manageTheVoiceChannelWhitelistBlacklist')}
                actions={
                    <ToggleGroup
                        type="single"
                        variant="outline"
                        value={mode}
                        onValueChange={(value) =>
                            value && void navigate({ to: '/servers/$guildId/voice-guard', params: { guildId }, search: { mode: value as VoiceGuardMode } })
                        }
                    >
                        <ToggleGroupItem value="whitelist">{tr('voiceGuard.allowOnly')}</ToggleGroupItem>
                        <ToggleGroupItem value="blacklist" className="data-[state=on]:text-destructive">
                            {tr('voiceGuard.block')}
                        </ToggleGroupItem>
                    </ToggleGroup>
                }
            />
            <p className="rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed" role="status">
                {mode === 'whitelist' ? tr('voiceGuard.allowOnlyWhitelistMembersNotOn') : tr('voiceGuard.blockBlacklistOnlyMembersOnThe')}
            </p>
            <Card>
                <CardContent>
                    <Field label={tr('voiceGuard.addAVoiceChannelTo', { 0: mode })}>
                        <div className="flex gap-2 md:max-w-xl">
                            <Select value={channelId} onValueChange={setChannelId}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder={tr('voiceGuard.pickAVoiceChannel')} />
                                </SelectTrigger>
                                <SelectContent className="max-h-80">
                                    {channels.data?.map((ch) => (
                                        <SelectItem key={ch.id} value={ch.id}>
                                            {ch.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                onClick={() => (channelId ? add.mutate() : toast.warning(tr('voiceGuard.pleasePickAVoiceChannel')))}
                                disabled={add.isPending}
                            >
                                <Plus /> {tr('voiceGuard.addChannel')}
                            </Button>
                        </div>
                    </Field>
                </CardContent>
            </Card>

            {list.isLoading ? (
                <VoiceGuardCardsSkeleton />
            ) : list.error ? (
                <ErrorState error={list.error} />
            ) : list.data?.length ? (
                <div className="grid gap-4 md:grid-cols-2">
                    {list.data.map((channel) => (
                        <ChannelCard key={channel.channelId} mode={mode} channel={channel} />
                    ))}
                </div>
            ) : (
                <EmptyState>
                    {tr('voiceGuard.noChannelsIn')} {mode}
                </EmptyState>
            )}
        </>
    );
}
