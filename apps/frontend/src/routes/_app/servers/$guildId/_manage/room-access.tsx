import { tr } from '../../../../../lib/i18n';
import { Spinner } from '@/components/ui/spinner';
import { ALL_ROOMS, type AccessRoom, type GrantAccessInput, type RoomAccessItem } from '@notstack/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Trash2 } from '@/components/icons';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { accessRoomsQuery, roomAccessApi, roomAccessQuery } from '@/api/bot';
import { guildChannelsQuery } from '@/api/guilds';
import { ChannelSelect } from '@/components/channel-select';
import { useConfirm } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { Field } from '@/components/field';
import { PageHeader } from '@/components/page-header';
import { RoomAccessTableSkeleton } from '@/components/skeleton/guild-pages';
import { ErrorState } from '@/components/states';
import { UserPicker, type PickedUser } from '@/components/user-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { errorMessage } from '@/lib/api';
import { DEFAULT_AVATAR, formatCountdown } from '@/lib/format';
import { useGuildId } from '@/hooks/use-guild';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/room-access')({
    // เริ่มโหลดข้อมูลพร้อมกับโค้ดของหน้า (และตอนเอาเมาส์ชี้ลิงก์) — ไม่รอให้หน้า render ก่อน
    loader: ({ context: { queryClient }, params, preload }) => {
        const loading = Promise.all([
            queryClient.prefetchQuery(roomAccessQuery(params.guildId)),
            queryClient.prefetchQuery(accessRoomsQuery(params.guildId)),
            queryClient.prefetchQuery(guildChannelsQuery(params.guildId)),
        ]);
        return preload ? loading : undefined;
    },
    component: RoomAccessPage,
});

type Action = 'grant' | 'grant_temp' | 'revoke';

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

function DurationSelect({ value, onChange, max, unit }: { value: number; onChange: (value: number) => void; max: number; unit: string }) {
    return (
        <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
            <SelectTrigger className="w-28">
                <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
                {range(max).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                        {n.toString().padStart(2, '0')} {unit}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

// ตัวนับเวลาที่เหลือของสิทธิ์ชั่วคราว (อัปเดตทุกวินาที)
function useNow(intervalMs = 1000) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(timer);
    }, [intervalMs]);
    return now;
}

// ห้องที่เปิดให้ใช้ระบบตั๋ว (ตั้งเองต่อเซิร์ฟเวอร์)
function RoomsCard({ rooms }: { rooms: AccessRoom[] }) {
    const guildId = useGuildId();
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const { data: channels = [] } = useQuery(guildChannelsQuery(guildId));
    const [channelId, setChannelId] = useState('');
    const onRooms = (next: AccessRoom[]) => queryClient.setQueryData(accessRoomsQuery(guildId).queryKey, next);
    const add = useMutation({
        mutationFn: () => roomAccessApi.addRoom(guildId, channelId),
        onSuccess: (next) => {
            onRooms(next);
            setChannelId('');
            toast.success(tr('roomAccess.channelAdded'));
        },
        onError: (err) => toast.error(tr('roomAccess.failedToAddChannel'), { description: errorMessage(err) }),
    });
    const remove = useMutation({
        mutationFn: (id: string) => roomAccessApi.removeRoom(guildId, id),
        onSuccess: (next) => {
            onRooms(next);
            void queryClient.invalidateQueries({ queryKey: roomAccessQuery(guildId).queryKey });
        },
        onError: (err) => toast.error(tr('roomAccess.failedToRemoveChannel'), { description: errorMessage(err) }),
    });
    const available = channels.filter((channel) => !channel.isCategory && !rooms.some((room) => room.id === channel.id));

    return (
        <Card>
            <CardHeader>
                <CardTitle>{tr('roomAccess.channelsUsingTheTicketSystem')}</CardTitle>
                <CardDescription>{tr('roomAccess.specialChannelsYouCanGrantAccess')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                    {rooms.length === 0 && <p className="text-sm text-muted-foreground">{tr('roomAccess.noChannelsYetAddOneBelow')}</p>}
                    {rooms.map((room) => (
                        <Badge key={room.id} variant="secondary" className="gap-1.5 py-1 pr-1 pl-2.5 text-sm">
                            <span className={room.exists ? undefined : 'text-muted-foreground line-through'}>
                                {room.exists ? `#${room.name}` : `ID: ${room.id}`}
                            </span>
                            <button
                                type="button"
                                className="rounded p-0.5 hover:bg-destructive/20 hover:text-destructive"
                                aria-label={tr('roomAccess.removeChannel', { 0: room.name })}
                                disabled={remove.isPending}
                                onClick={async () => {
                                    const ok = await confirm({
                                        title: tr('roomAccess.removeThisChannelFromTheTicket'),
                                        description: tr('roomAccess.temporaryTicketsForThisChannelWill'),
                                        confirmText: tr('common.remove2'),
                                        destructive: true,
                                    });
                                    if (ok) remove.mutate(room.id);
                                }}
                            >
                                <Trash2 className="size-3.5" />
                            </button>
                        </Badge>
                    ))}
                </div>
                <div className="flex max-w-xl gap-2">
                    <ChannelSelect channels={available} value={channelId} onChange={setChannelId} placeholder={tr('roomAccess.pickAChannelToAdd')} />
                    <Button onClick={() => add.mutate()} disabled={!channelId || add.isPending}>
                        {add.isPending ? <Spinner /> : <Plus />} {tr('common.add')}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

function RoomAccessPage() {
    const guildId = useGuildId();
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const now = useNow();
    const list = useQuery({ ...roomAccessQuery(guildId), refetchInterval: 30000 });
    const { data: rooms = [] } = useQuery(accessRoomsQuery(guildId));

    const [user, setUser] = useState<PickedUser | null>(null);
    const [roomId, setRoomId] = useState<string>(ALL_ROOMS);
    const [action, setAction] = useState<Action>('grant');
    const [duration, setDuration] = useState({ h: 0, m: 0, s: 0 });

    const mutation = useMutation({
        mutationFn: (input: GrantAccessInput) => roomAccessApi.change(guildId, input),
        onSettled: () => queryClient.invalidateQueries({ queryKey: roomAccessQuery(guildId).queryKey }),
    });

    const submit = async () => {
        if (!user) return toast.warning(tr('common.missingInformation'), { description: tr('roomAccess.pleasePickAUserFromThe') });
        let minutes: number | undefined;
        if (action === 'grant_temp') {
            if (duration.h === 0 && duration.m === 0 && duration.s === 0) {
                return toast.warning(tr('common.missingInformation'), { description: tr('roomAccess.pleaseEnterADurationGreaterThan') });
            }
            // backend รับเป็นนาที (ทศนิยมได้ สำหรับวินาที)
            minutes = duration.h * 60 + duration.m + duration.s / 60;
        }
        const apiAction = action === 'revoke' ? 'revoke' : 'grant';
        const actionText = apiAction === 'grant' ? tr('roomAccess.grantAccess') : tr('roomAccess.revokeAccess');
        const ok = await confirm({
            title: tr('roomAccess.confirm', { 0: actionText }),
            description: tr('roomAccess.for', { 0: actionText, 1: user.username }),
            destructive: apiAction === 'revoke',
        });
        if (!ok) return;
        try {
            const result = await mutation.mutateAsync({ userId: user.userId, roomId, action: apiAction, duration: minutes });
            if (result.errors?.length) toast.warning(tr('roomAccess.doneWithSomeProblems'), { description: [result.message, ...result.errors].join('\n') });
            else toast.success(tr('roomAccess.done'), { description: result.message });
        } catch (err) {
            toast.error(tr('roomAccess.actionFailed'), { description: errorMessage(err) });
        }
    };

    const revoke = async (item: RoomAccessItem) => {
        const ok = await confirm({
            title: tr('roomAccess.revokeAccess2'),
            description: tr('roomAccess.revokeSAccessToImmediately', { 0: item.username, 1: item.roomName }),
            confirmText: tr('roomAccess.revokeAccess'),
            destructive: true,
        });
        if (!ok) return;
        try {
            await mutation.mutateAsync({ userId: item.userId, roomId: item.roomId, action: 'revoke' });
            toast.success(tr('roomAccess.accessRevoked'));
        } catch (err) {
            toast.error(tr('common.error'), { description: errorMessage(err) });
        }
    };

    const columns: ColumnDef<RoomAccessItem>[] = [
        {
            id: 'user',
            header: 'User',
            cell: ({ row: { original: item } }) => (
                <div className="flex items-center gap-3">
                    <img src={item.avatar ?? DEFAULT_AVATAR} alt="" className="size-8 rounded-full" />
                    <div>
                        <p className="font-medium">{item.username}</p>
                        <p className="font-mono text-xs text-muted-foreground">{item.userId}</p>
                    </div>
                </div>
            ),
        },
        { accessorKey: 'roomName', header: 'Room' },
        {
            accessorKey: 'type',
            header: 'Type',
            cell: ({ row }) =>
                row.original.type === 'temporary' ? (
                    <Badge variant="warning">{tr('roomAccess.timeLimited')}</Badge>
                ) : (
                    <Badge variant="success">{tr('roomAccess.permanent')}</Badge>
                ),
        },
        {
            id: 'left',
            header: 'Time Left',
            cell: ({ row: { original: item } }) => {
                if (item.type !== 'temporary' || !item.expireAt) return '—';
                const left = item.expireAt - now;
                return left <= 0 ? (
                    <span className="text-destructive">{tr('roomAccess.expired')}</span>
                ) : (
                    <span className="font-mono">{formatCountdown(left)}</span>
                );
            },
        },
        {
            id: 'action',
            header: 'Action',
            cell: ({ row }) => (
                <Button size="xs" variant="destructive" onClick={() => void revoke(row.original)}>
                    {tr('roomAccess.revokeAccess')}
                </Button>
            ),
        },
    ];

    return (
        <>
            <PageHeader help="roomAccess" title={tr('common.roomAccess')} description={tr('roomAccess.grantUsersAccessToSpecialChannels')} />
            <RoomsCard rooms={rooms} />
            <Card>
                <CardContent className="grid gap-4 md:max-w-xl">
                    <Field label={tr('common.user')} hint={tr('roomAccess.typeANameAndPickFrom')}>
                        <UserPicker value={user} onSelect={setUser} onClear={() => setUser(null)} placeholder={tr('roomAccess.typeAMemberNameOrUsername')} />
                    </Field>
                    <Field label={tr('roomAccess.pickTheChannelToGrantAccess')}>
                        <Select value={roomId} onValueChange={setRoomId}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {rooms.map((room) => (
                                    <SelectItem key={room.id} value={room.id}>
                                        {room.exists ? `#${room.name}` : tr('roomAccess.idChannelNotFound', { 0: room.id })}
                                    </SelectItem>
                                ))}
                                <SelectItem value={ALL_ROOMS}>
                                    {tr('roomAccess.everyChannelInTheList')}
                                    {rooms.length} {tr('roomAccess.channels')}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label={tr('roomAccess.pickAnAction')}>
                        <Select value={action} onValueChange={(value) => setAction(value as Action)}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="grant">{tr('roomAccess.grantPermanentAccess')}</SelectItem>
                                <SelectItem value="grant_temp">{tr('roomAccess.grantTemporaryAccess')}</SelectItem>
                                <SelectItem value="revoke">{tr('roomAccess.revokeAccess')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </Field>
                    {action === 'grant_temp' && (
                        <Field label={tr('roomAccess.durationHoursMinutesSeconds')}>
                            <div className="flex items-center gap-2">
                                <DurationSelect value={duration.h} max={73} unit={tr('roomAccess.hr')} onChange={(h) => setDuration((d) => ({ ...d, h }))} />:
                                <DurationSelect value={duration.m} max={60} unit={tr('common.minute')} onChange={(m) => setDuration((d) => ({ ...d, m }))} />:
                                <DurationSelect value={duration.s} max={60} unit={tr('roomAccess.sec')} onChange={(s) => setDuration((d) => ({ ...d, s }))} />
                            </div>
                        </Field>
                    )}
                    <Button className="w-full" onClick={() => void submit()} disabled={mutation.isPending || rooms.length === 0}>
                        {mutation.isPending && <Spinner />} {tr('roomAccess.run')}
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>{tr('roomAccess.peopleWithChannelAccess')}</CardTitle>
                    <CardDescription>{tr('roomAccess.permanentAndTimeLimitedAccessUpdates')}</CardDescription>
                </CardHeader>
                <CardContent>
                    {list.isLoading ? (
                        <RoomAccessTableSkeleton />
                    ) : list.error ? (
                        <ErrorState error={list.error} />
                    ) : (
                        <DataTable columns={columns} data={list.data ?? []} empty={tr('roomAccess.noOneHasAccess')} />
                    )}
                </CardContent>
            </Card>
        </>
    );
}
