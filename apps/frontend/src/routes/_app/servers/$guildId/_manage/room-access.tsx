import { ALL_ROOMS, type AccessRoom, type GrantAccessInput, type RoomAccessItem } from '@notstack/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { accessRoomsQuery, roomAccessApi, roomAccessQuery } from '@/api/bot';
import { guildChannelsQuery } from '@/api/guilds';
import { ChannelSelect } from '@/components/channel-select';
import { useConfirm } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { Field } from '@/components/field';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/states';
import { UserPicker, type PickedUser } from '@/components/user-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { errorMessage } from '@/lib/api';
import { DEFAULT_AVATAR, formatCountdown } from '@/lib/format';
import { useGuildId } from '@/hooks/use-guild';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/room-access')({
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
            toast.success('เพิ่มห้องแล้ว');
        },
        onError: (err) => toast.error('เพิ่มห้องไม่สำเร็จ', { description: errorMessage(err) }),
    });
    const remove = useMutation({
        mutationFn: (id: string) => roomAccessApi.removeRoom(guildId, id),
        onSuccess: (next) => {
            onRooms(next);
            void queryClient.invalidateQueries({ queryKey: roomAccessQuery(guildId).queryKey });
        },
        onError: (err) => toast.error('เอาห้องออกไม่สำเร็จ', { description: errorMessage(err) }),
    });
    const available = channels.filter((channel) => !channel.isCategory && !rooms.some((room) => room.id === channel.id));

    return (
        <Card>
            <CardHeader>
                <CardTitle>ห้องที่ใช้ระบบตั๋ว</CardTitle>
                <CardDescription>ห้องพิเศษที่ให้สิทธิ์เข้าได้จากหน้านี้ — บอทต้องมีสิทธิ์ Manage Channels / Manage Roles ในห้องนั้น</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                    {rooms.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีห้อง — เพิ่มห้องด้านล่างก่อนเริ่มให้สิทธิ์</p>}
                    {rooms.map((room) => (
                        <Badge key={room.id} variant="secondary" className="gap-1.5 py-1 pr-1 pl-2.5 text-sm">
                            <span className={room.exists ? undefined : 'text-muted-foreground line-through'}>{room.exists ? `#${room.name}` : `ID: ${room.id}`}</span>
                            <button
                                type="button"
                                className="rounded p-0.5 hover:bg-destructive/20 hover:text-destructive"
                                aria-label={`เอาห้อง ${room.name} ออก`}
                                disabled={remove.isPending}
                                onClick={async () => {
                                    const ok = await confirm({
                                        title: 'เอาห้องนี้ออกจากระบบตั๋ว?',
                                        description: 'ตั๋วชั่วคราวของห้องนี้จะไม่ถูกถอนอัตโนมัติอีก (สิทธิ์ที่ให้ไปแล้วยังอยู่ในห้อง — ถอนสิทธิ์ก่อนถ้าไม่ต้องการ)',
                                        confirmText: 'เอาออก',
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
                    <ChannelSelect channels={available} value={channelId} onChange={setChannelId} placeholder="เลือกห้องที่จะเพิ่ม..." />
                    <Button onClick={() => add.mutate()} disabled={!channelId || add.isPending}>
                        {add.isPending ? <Loader2 className="animate-spin" /> : <Plus />} เพิ่ม
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
        if (!user) return toast.warning('ข้อมูลไม่ครบถ้วน', { description: 'กรุณาเลือกผู้ใช้จากรายการค้นหา (หรือพิมพ์ User ID)' });
        let minutes: number | undefined;
        if (action === 'grant_temp') {
            if (duration.h === 0 && duration.m === 0 && duration.s === 0) {
                return toast.warning('ข้อมูลไม่ครบถ้วน', { description: 'กรุณาระบุระยะเวลาที่มากกว่า 0' });
            }
            // backend รับเป็นนาที (ทศนิยมได้ สำหรับวินาที)
            minutes = duration.h * 60 + duration.m + duration.s / 60;
        }
        const apiAction = action === 'revoke' ? 'revoke' : 'grant';
        const actionText = apiAction === 'grant' ? 'ให้สิทธิ์' : 'ถอนสิทธิ์';
        const ok = await confirm({
            title: `ยืนยันการ${actionText}?`,
            description: `คุณต้องการ${actionText} ${user.username} เข้าห้องใช่หรือไม่?`,
            destructive: apiAction === 'revoke',
        });
        if (!ok) return;
        try {
            const result = await mutation.mutateAsync({ userId: user.userId, roomId, action: apiAction, duration: minutes });
            if (result.errors?.length) toast.warning('ดำเนินการเสร็จสิ้น (มีปัญหาบางส่วน)', { description: [result.message, ...result.errors].join('\n') });
            else toast.success('ดำเนินการเสร็จสิ้น', { description: result.message });
        } catch (err) {
            toast.error('ดำเนินการไม่สำเร็จ', { description: errorMessage(err) });
        }
    };

    const revoke = async (item: RoomAccessItem) => {
        const ok = await confirm({
            title: 'ยืนยันการถอนสิทธิ์?',
            description: `ถอนสิทธิ์ ${item.username} จากห้อง ${item.roomName} ทันที`,
            confirmText: 'ถอนสิทธิ์',
            destructive: true,
        });
        if (!ok) return;
        try {
            await mutation.mutateAsync({ userId: item.userId, roomId: item.roomId, action: 'revoke' });
            toast.success('ถอนสิทธิ์สำเร็จ');
        } catch (err) {
            toast.error('ข้อผิดพลาด', { description: errorMessage(err) });
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
                    <Badge className="bg-amber-500/15 text-amber-300">จำกัดเวลา</Badge>
                ) : (
                    <Badge className="bg-emerald-500/15 text-emerald-300">ถาวร</Badge>
                ),
        },
        {
            id: 'left',
            header: 'Time Left',
            cell: ({ row: { original: item } }) => {
                if (item.type !== 'temporary' || !item.expireAt) return '—';
                const left = item.expireAt - now;
                return left <= 0 ? <span className="text-destructive">หมดเวลาแล้ว</span> : <span className="font-mono">{formatCountdown(left)}</span>;
            },
        },
        {
            id: 'action',
            header: 'Action',
            cell: ({ row }) => (
                <Button size="xs" variant="destructive" onClick={() => void revoke(row.original)}>
                    ถอนสิทธิ์
                </Button>
            ),
        },
    ];

    return (
        <>
            <PageHeader title="Grant Room Access" description="ให้สิทธิ์ผู้ใช้ในการมองเห็นห้องพิเศษ — ถาวร หรือจำกัดเวลา (บอทถอนสิทธิ์และแจ้งเตือนทาง DM ให้เอง)" />
            <RoomsCard rooms={rooms} />
            <Card>
                <CardContent className="grid gap-4 md:max-w-xl">
                    <Field label="ผู้ใช้" hint="พิมพ์ชื่อแล้วเลือกจากรายการ — หรือพิมพ์ User ID ลงไปตรงๆ ก็ได้">
                        <UserPicker value={user} onSelect={setUser} onClear={() => setUser(null)} placeholder="พิมพ์ชื่อหรือ username ของสมาชิก..." />
                    </Field>
                    <Field label="เลือกห้องที่ต้องการให้สิทธิ์">
                        <Select value={roomId} onValueChange={setRoomId}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {rooms.map((room) => (
                                    <SelectItem key={room.id} value={room.id}>
                                        {room.exists ? `#${room.name}` : `ID: ${room.id} (ไม่พบห้องนี้)`}
                                    </SelectItem>
                                ))}
                                <SelectItem value={ALL_ROOMS}>ทุกห้องในรายการ ({rooms.length} ห้อง)</SelectItem>
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label="เลือกรูปแบบการดำเนินการ">
                        <Select value={action} onValueChange={(value) => setAction(value as Action)}>
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="grant">ให้สิทธิ์ถาวร</SelectItem>
                                <SelectItem value="grant_temp">ให้สิทธิ์ชั่วคราว</SelectItem>
                                <SelectItem value="revoke">ถอนสิทธิ์</SelectItem>
                            </SelectContent>
                        </Select>
                    </Field>
                    {action === 'grant_temp' && (
                        <Field label="ระยะเวลา (ชั่วโมง : นาที : วินาที)">
                            <div className="flex items-center gap-2">
                                <DurationSelect value={duration.h} max={73} unit="ชม." onChange={(h) => setDuration((d) => ({ ...d, h }))} />:
                                <DurationSelect value={duration.m} max={60} unit="นาที" onChange={(m) => setDuration((d) => ({ ...d, m }))} />:
                                <DurationSelect value={duration.s} max={60} unit="วิ" onChange={(s) => setDuration((d) => ({ ...d, s }))} />
                            </div>
                        </Field>
                    )}
                    <Button className="w-full" onClick={() => void submit()} disabled={mutation.isPending || rooms.length === 0}>
                        {mutation.isPending && <Loader2 className="animate-spin" />} ดำเนินการ
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>รายชื่อผู้ได้รับสิทธิ์เข้าห้อง</CardTitle>
                    <CardDescription>ผู้ที่มีสิทธิ์ถาวร และจำกัดเวลา (อัปเดตอัตโนมัติ)</CardDescription>
                </CardHeader>
                <CardContent>
                    {list.isLoading ? (
                        <LoadingState />
                    ) : list.error ? (
                        <ErrorState error={list.error} />
                    ) : (
                        <DataTable columns={columns} data={list.data ?? []} empty="ไม่มีผู้ได้รับสิทธิ์" />
                    )}
                </CardContent>
            </Card>
        </>
    );
}
