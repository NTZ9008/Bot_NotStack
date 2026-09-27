import type { GuildChannel, GuildRole, LogEventSetting, LogOptions, LogSettingsResponse, UpdateLogOptionsInput } from '@notstack/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { guildChannelsQuery, guildRolesQuery } from '@/api/guilds';
import { logSettingsApi, logSettingsQuery } from '@/api/bot';
import { ChannelSelect, channelLabel } from '@/components/channel-select';
import { useConfirm } from '@/components/confirm-dialog';
import { Field } from '@/components/field';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/states';
import { UserPicker } from '@/components/user-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/api';
import { useGuildId } from '@/hooks/use-guild';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/log-manager')({
    loader: ({ context, params }) => context.queryClient.ensureQueryData(logSettingsQuery(params.guildId)),
    component: LogManagerPage,
});

const saved = (title = 'บันทึกแล้ว') => toast.success(title, { duration: 1600 });
const failed = (err: unknown) => toast.error('บันทึกไม่สำเร็จ', { description: errorMessage(err) });

function useSettingsCache() {
    const guildId = useGuildId();
    const queryClient = useQueryClient();
    return {
        patch: (updater: (data: LogSettingsResponse) => LogSettingsResponse) =>
            queryClient.setQueryData<LogSettingsResponse>(logSettingsQuery(guildId).queryKey, (data) => (data ? updater(data) : data)),
        refresh: () => queryClient.invalidateQueries({ queryKey: logSettingsQuery(guildId).queryKey }),
    };
}

// ==========================================
// การ์ดของ log แต่ละชนิด — บันทึกอัตโนมัติทันทีที่แก้ (ไม่ต้องกดปุ่ม Save)
// ==========================================
function EventCard({ event, channels }: { event: LogEventSetting; channels: GuildChannel[] }) {
    const guildId = useGuildId();
    const cache = useSettingsCache();
    const [color, setColor] = useState(event.color);
    const lastSaved = useRef(event.color);
    useEffect(() => {
        setColor(event.color);
        lastSaved.current = event.color;
    }, [event.color]);

    const mutation = useMutation({
        mutationFn: (patch: { enabled?: boolean; channelId?: string; color?: string }) => logSettingsApi.update(guildId, { key: event.key, ...patch }),
        onSuccess: ({ setting }) => {
            cache.patch((data) => ({ ...data, events: data.events.map((e) => (e.key === setting.key ? setting : e)) }));
            saved();
        },
        onError: (err) => {
            failed(err);
            // ย้อนค่ากลับตามที่บันทึกจริง ไม่ให้หน้าจอโกหกว่าบันทึกแล้ว
            setColor(lastSaved.current);
            void cache.refresh();
        },
    });

    // ช่องเลือกสียิง onChange ถี่ระหว่างลาก → บันทึกเมื่อหยุดเลือกแล้ว
    useEffect(() => {
        if (color === lastSaved.current) return;
        const timer = setTimeout(() => {
            lastSaved.current = color;
            mutation.mutate({ color });
        }, 600);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [color]);

    return (
        <div className="space-y-2 rounded-lg border bg-card p-3" style={{ borderLeft: `3px solid ${color}` }}>
            <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium" title={event.label}>
                    {event.label}
                </span>
                <Switch checked={event.enabled} onCheckedChange={(enabled) => mutation.mutate({ enabled })} />
            </div>
            <ChannelSelect
                channels={channels.filter((ch) => ch.sendable)}
                value={event.channelId}
                noneLabel="เลือก .."
                placeholder="เลือก .."
                onChange={(channelId) => mutation.mutate({ channelId })}
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                สี
                <input type="color" className="h-6 w-10 cursor-pointer rounded border border-input bg-transparent" value={color} onChange={(e) => setColor(e.target.value)} />
                <span className="font-mono">{color.toUpperCase()}</span>
            </div>
        </div>
    );
}

// ==========================================
// ตัวกรอง — ไม่ต้องบันทึก log (ห้อง / คน / ยศ / บอท) แนวเดียวกับ Carl-bot
// ==========================================
function Chips({ items, empty, onRemove }: { items: { id: string; label: string }[]; empty: string; onRemove: (id: string) => void }) {
    if (!items.length) return <p className="text-xs text-muted-foreground">{empty}</p>;
    return (
        <div className="flex flex-wrap gap-1.5">
            {items.map((item) => (
                <Badge key={item.id} variant="secondary" className="gap-1 pr-1">
                    {item.label}
                    <button type="button" className="rounded-sm opacity-70 hover:opacity-100" onClick={() => onRemove(item.id)} aria-label="เอาออก">
                        <X className="size-3" />
                    </button>
                </Badge>
            ))}
        </div>
    );
}

function IgnorePanel({ options, userNames, channels, roles }: { options: LogOptions; userNames: Record<string, string>; channels: GuildChannel[]; roles: GuildRole[] }) {
    const guildId = useGuildId();
    const cache = useSettingsCache();
    const [channelToAdd, setChannelToAdd] = useState('');
    const [roleToAdd, setRoleToAdd] = useState('');

    const mutation = useMutation({
        mutationFn: (input: UpdateLogOptionsInput) => logSettingsApi.updateOptions(guildId, input),
        onSuccess: (result) => {
            cache.patch((data) => ({ ...data, options: result.options, ignoredUserNames: result.ignoredUserNames }));
            saved('บันทึกตัวกรองแล้ว');
        },
        onError: (err) => {
            failed(err);
            void cache.refresh();
        },
    });

    const addTo = (key: 'ignoredChannels' | 'ignoredRoles' | 'ignoredUsers', id: string) => {
        if (!id) return;
        if (options[key].includes(id)) return toast.info('มีอยู่ในรายการแล้ว');
        mutation.mutate({ [key]: [...options[key], id] });
    };
    const removeFrom = (key: 'ignoredChannels' | 'ignoredRoles' | 'ignoredUsers', id: string) => mutation.mutate({ [key]: options[key].filter((x) => x !== id) });

    return (
        <Card>
            <CardHeader>
                <CardTitle>ตัวกรอง — ไม่ต้องบันทึก log</CardTitle>
                <CardDescription>ยกเว้นห้อง คน หรือยศ ที่ไม่อยากให้ขึ้น log — เลือกหมวดหมู่เท่ากับยกเว้นทุกห้องในหมวดนั้น</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-2 md:grid-cols-2">
                    <Label className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2 font-normal">
                        ไม่ต้องบันทึกการกระทำของบอท
                        <Switch checked={options.ignoreBots} onCheckedChange={(ignoreBots) => mutation.mutate({ ignoreBots })} />
                    </Label>
                    <Label className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2 font-normal">
                        บันทึกทุกเหตุการณ์ลงฐานข้อมูล (ใช้ทำกราฟหน้า Overview และตาราง Activity Log)
                        <Switch checked={options.activityRecording} onCheckedChange={(activityRecording) => mutation.mutate({ activityRecording })} />
                    </Label>
                </div>
                <div className="grid gap-6 lg:grid-cols-3">
                    <Field label="ห้อง / หมวดหมู่ที่ยกเว้น">
                        <div className="flex gap-2">
                            <ChannelSelect channels={channels} showCategories value={channelToAdd} onChange={setChannelToAdd} placeholder="เลือกห้องหรือหมวดหมู่ .." />
                            <Button
                                variant="outline"
                                size="icon"
                                aria-label="เพิ่ม"
                                onClick={() => {
                                    addTo('ignoredChannels', channelToAdd);
                                    setChannelToAdd('');
                                }}
                            >
                                <Plus />
                            </Button>
                        </div>
                        <Chips
                            items={options.ignoredChannels.map((id) => ({ id, label: channelLabel(channels, id) ?? id }))}
                            empty="ยังไม่ได้ยกเว้นอะไร"
                            onRemove={(id) => removeFrom('ignoredChannels', id)}
                        />
                    </Field>
                    <Field label="ยศที่ยกเว้น">
                        <div className="flex gap-2">
                            <Select value={roleToAdd} onValueChange={setRoleToAdd}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="เลือกยศ .." />
                                </SelectTrigger>
                                <SelectContent className="max-h-80">
                                    {roles.map((role) => (
                                        <SelectItem key={role.id} value={role.id}>
                                            @{role.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                variant="outline"
                                size="icon"
                                aria-label="เพิ่ม"
                                onClick={() => {
                                    addTo('ignoredRoles', roleToAdd);
                                    setRoleToAdd('');
                                }}
                            >
                                <Plus />
                            </Button>
                        </div>
                        <Chips
                            items={options.ignoredRoles.map((id) => ({ id, label: `@${roles.find((r) => r.id === id)?.name ?? `ID: ${id}`}` }))}
                            empty="ยังไม่ได้ยกเว้นอะไร"
                            onRemove={(id) => removeFrom('ignoredRoles', id)}
                        />
                    </Field>
                    <Field label="สมาชิกที่ยกเว้น">
                        <UserPicker
                            keepSelection={false}
                            placeholder="พิมพ์ชื่อสมาชิกที่ไม่ต้องการให้ขึ้น log..."
                            exclude={options.ignoredUsers}
                            onSelect={(user) => addTo('ignoredUsers', user.userId)}
                        />
                        <Chips
                            items={options.ignoredUsers.map((id) => ({ id, label: userNames[id] && userNames[id] !== id ? `@${userNames[id]}` : `ID: ${id}` }))}
                            empty="ยังไม่ได้ยกเว้นอะไร"
                            onRemove={(id) => removeFrom('ignoredUsers', id)}
                        />
                    </Field>
                </div>
            </CardContent>
        </Card>
    );
}

function LogManagerPage() {
    const guildId = useGuildId();
    const { data, isLoading, error } = useQuery(logSettingsQuery(guildId));
    const { data: channels = [] } = useQuery(guildChannelsQuery(guildId));
    const { data: roles = [] } = useQuery(guildRolesQuery(guildId));
    const cache = useSettingsCache();
    const confirm = useConfirm();
    const [bulkChannel, setBulkChannel] = useState('');

    const toggleSystem = useMutation({
        mutationFn: (enabled: boolean) => logSettingsApi.toggleSystem(guildId, enabled),
        onSuccess: ({ systemEnabled }) => {
            cache.patch((d) => ({ ...d, systemEnabled }));
            saved(systemEnabled ? 'เปิดระบบ Log แล้ว' : 'ปิดระบบ Log แล้ว');
        },
        onError: failed,
    });

    const applyAll = useMutation({
        mutationFn: (channelId: string) => logSettingsApi.applyAll(guildId, channelId),
        onSuccess: ({ events }) => {
            cache.patch((d) => ({ ...d, events }));
            saved('ตั้งห้องให้ทุกรายการแล้ว');
        },
        onError: failed,
    });

    const applyToAll = async () => {
        if (!bulkChannel) return toast.warning('ยังไม่ได้เลือกห้อง', { description: 'กรุณาเลือกห้องปลายทางก่อน' });
        const ok = await confirm({
            title: 'ยืนยันการตั้งค่า',
            description: `ตั้งให้ log ทุกรายการส่งเข้าห้อง ${channelLabel(channels, bulkChannel)} ใช่ไหม? (ค่าห้องเดิมของทุกรายการจะถูกทับ)`,
            confirmText: 'ตกลง',
        });
        if (ok) applyAll.mutate(bulkChannel);
    };

    const groups = data ? [...data.groups, ...new Set(data.events.map((e) => e.group).filter((g) => !data.groups.includes(g)))] : [];

    return (
        <>
            <PageHeader
                title="Log Management — หมวดหมู่"
                description="เลือกว่าจะติดตาม log อะไร ส่งเข้าห้องไหน และใช้สีอะไรในการแจ้งเตือน"
                actions={
                    data && (
                        <Label className="flex items-center gap-3 rounded-lg border px-3 py-2">
                            ระบบ Log ทั้งหมด
                            <Switch checked={data.systemEnabled} onCheckedChange={(enabled) => toggleSystem.mutate(enabled)} />
                        </Label>
                    )
                }
            />
            {isLoading ? (
                <LoadingState />
            ) : error ? (
                <ErrorState error={error} title="โหลดการตั้งค่า Log ไม่สำเร็จ" />
            ) : (
                data && (
                    <>
                        <Card>
                            <CardContent>
                                <Field label="ตั้งห้องเดียวกันให้ทุกรายการ">
                                    <div className="flex flex-wrap gap-2 md:max-w-xl md:flex-nowrap">
                                        <ChannelSelect channels={channels.filter((ch) => ch.sendable)} value={bulkChannel} onChange={setBulkChannel} />
                                        <Button variant="secondary" onClick={() => void applyToAll()} disabled={applyAll.isPending}>
                                            ใช้ห้องนี้กับทุกรายการ
                                        </Button>
                                    </div>
                                </Field>
                            </CardContent>
                        </Card>

                        <IgnorePanel options={data.options} userNames={data.ignoredUserNames} channels={channels} roles={roles} />

                        {groups.map((group) => {
                            const events = data.events.filter((e) => e.group === group);
                            if (!events.length) return null;
                            return (
                                <section key={group} className="space-y-3">
                                    <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{group}</h3>
                                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                        {events.map((event) => (
                                            <EventCard key={event.key} event={event} channels={channels} />
                                        ))}
                                    </div>
                                </section>
                            );
                        })}
                    </>
                )
            )}
        </>
    );
}
