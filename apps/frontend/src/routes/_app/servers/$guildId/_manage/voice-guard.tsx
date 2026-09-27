import type { VoiceGuardChannel, VoiceGuardMode } from '@notstack/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { voiceChannelsQuery } from '@/api/guilds';
import { voiceGuardApi, voiceGuardQuery } from '@/api/bot';
import { useConfirm } from '@/components/confirm-dialog';
import { Field } from '@/components/field';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
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

const searchSchema = z.object({
    mode: z.enum(['whitelist', 'blacklist']).catch('whitelist').default('whitelist'),
});

export const Route = createFileRoute('/_app/servers/$guildId/_manage/voice-guard')({
    validateSearch: searchSchema,
    component: VoiceGuardPage,
});

function ChannelCard({ mode, channel }: { mode: VoiceGuardMode; channel: VoiceGuardChannel }) {
    const guildId = useGuildId();
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const refresh = () => queryClient.invalidateQueries({ queryKey: voiceGuardQuery(guildId, mode).queryKey });
    const onError = (err: unknown) => {
        toast.error('ข้อผิดพลาด', { description: errorMessage(err) });
        void refresh();
    };

    const update = useMutation({ mutationFn: (patch: { enabled?: boolean; notify?: boolean }) => voiceGuardApi.updateChannel(guildId, mode, { channelId: channel.channelId, ...patch }), onError, onSuccess: refresh });
    const addUser = useMutation({
        mutationFn: (userId: string) => voiceGuardApi.addUser(guildId, mode, { channelId: channel.channelId, userId }),
        onSuccess: () => {
            toast.success('เพิ่มสมาชิกสำเร็จ');
            void refresh();
        },
        onError,
    });
    const removeUser = useMutation({
        mutationFn: (userId: string) => voiceGuardApi.removeUser(guildId, mode, { channelId: channel.channelId, userId }),
        onSuccess: () => {
            toast.success('ลบสมาชิกสำเร็จ');
            void refresh();
        },
        onError,
    });

    const remove = async () => {
        const ok = await confirm({ title: 'ยืนยันการลบ', description: `ลบห้อง ${channel.channelName} ออกจาก ${mode} ใช่หรือไม่?`, confirmText: 'ลบ', destructive: true });
        if (!ok) return;
        try {
            await voiceGuardApi.deleteChannel(guildId, mode, channel.channelId);
            toast.success('ลบห้องสำเร็จ');
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
                    <Switch checked={channel.enabled} onCheckedChange={(enabled) => update.mutate({ enabled })} aria-label="เปิดใช้งาน" />
                    <Button variant="ghost" size="icon-sm" onClick={() => void remove()} aria-label="ลบห้อง">
                        <Trash2 className="text-destructive" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <Label className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 font-normal">
                    ส่ง DM แจ้งผู้ใช้เมื่อถูกเตะออก
                    <Switch checked={channel.notify} onCheckedChange={(notify) => update.mutate({ notify })} />
                </Label>
                <UserPicker
                    keepSelection={false}
                    placeholder="เพิ่มสมาชิก — พิมพ์ชื่อหรือ username..."
                    exclude={channel.users.map((u) => u.userId)}
                    onSelect={(user) => addUser.mutate(user.userId)}
                />
                {channel.users.length === 0 ? (
                    <p className="text-sm text-muted-foreground">ยังไม่มีสมาชิก</p>
                ) : (
                    <ul className="space-y-1.5">
                        {channel.users.map((u) => (
                            <li key={u.userId} className="flex items-center gap-3 rounded-lg border px-3 py-1.5">
                                <img src={u.avatar} alt="" className="size-7 rounded-full" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">{u.username}</p>
                                    <p className="truncate font-mono text-xs text-muted-foreground">{u.userId}</p>
                                </div>
                                <Button variant="ghost" size="icon-xs" aria-label="ลบสมาชิก" onClick={() => removeUser.mutate(u.userId)}>
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
    const { mode } = Route.useSearch();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [channelId, setChannelId] = useState('');
    const channels = useQuery(voiceChannelsQuery(guildId));
    const list = useQuery(voiceGuardQuery(guildId, mode));

    const add = useMutation({
        mutationFn: () => voiceGuardApi.updateChannel(guildId, mode, { channelId, enabled: true }),
        onSuccess: () => {
            toast.success('เพิ่มห้องสำเร็จ');
            setChannelId('');
            void queryClient.invalidateQueries({ queryKey: voiceGuardQuery(guildId, mode).queryKey });
        },
        onError: (err) => toast.error('ข้อผิดพลาด', { description: errorMessage(err) }),
    });

    return (
        <>
            <PageHeader
                title="Voice Guard"
                description="จัดการ Whitelist / Blacklist สำหรับห้องเสียง — คนที่ไม่มีสิทธิ์จะถูกเตะออกจากห้องทันทีที่เข้า"
                actions={
                    <ToggleGroup
                        type="single"
                        variant="outline"
                        value={mode}
                        onValueChange={(value) => value && void navigate({ to: '/servers/$guildId/voice-guard', params: { guildId }, search: { mode: value as VoiceGuardMode } })}
                    >
                        <ToggleGroupItem value="whitelist">Whitelist</ToggleGroupItem>
                        <ToggleGroupItem value="blacklist" className="data-[state=on]:text-destructive">
                            Blacklist
                        </ToggleGroupItem>
                    </ToggleGroup>
                }
            />
            <Card>
                <CardContent>
                    <Field label={`เพิ่มห้องเสียงเข้า ${mode}`}>
                        <div className="flex gap-2 md:max-w-xl">
                            <Select value={channelId} onValueChange={setChannelId}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="-- เลือกห้องเสียง --" />
                                </SelectTrigger>
                                <SelectContent className="max-h-80">
                                    {channels.data?.map((ch) => (
                                        <SelectItem key={ch.id} value={ch.id}>
                                            {ch.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button onClick={() => (channelId ? add.mutate() : toast.warning('กรุณาเลือกห้องเสียง'))} disabled={add.isPending}>
                                <Plus /> เพิ่มห้อง
                            </Button>
                        </div>
                    </Field>
                </CardContent>
            </Card>

            {list.isLoading ? (
                <LoadingState />
            ) : list.error ? (
                <ErrorState error={list.error} />
            ) : list.data?.length ? (
                <div className="grid gap-4 md:grid-cols-2">
                    {list.data.map((channel) => (
                        <ChannelCard key={channel.channelId} mode={mode} channel={channel} />
                    ))}
                </div>
            ) : (
                <EmptyState>ยังไม่มีห้องใน {mode}</EmptyState>
            )}
        </>
    );
}
