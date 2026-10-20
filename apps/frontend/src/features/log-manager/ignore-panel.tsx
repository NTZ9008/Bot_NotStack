import type { GuildChannel, GuildRole, LogOptions, UpdateLogOptionsInput } from '@notstack/shared';
import { useMutation } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { logSettingsApi } from '@/api/bot';
import { ChannelSelect, channelLabel } from '@/components/channel-select';
import { Field } from '@/components/field';
import { UserPicker } from '@/components/user-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useGuildId } from '@/hooks/use-guild';
import { failedToast, savedToast, useSettingsCache } from './use-log-settings';

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

export function IgnorePanel({
    options,
    userNames,
    channels,
    roles,
}: {
    options: LogOptions;
    userNames: Record<string, string>;
    channels: GuildChannel[];
    roles: GuildRole[];
}) {
    const guildId = useGuildId();
    const cache = useSettingsCache();
    const [channelToAdd, setChannelToAdd] = useState('');
    const [roleToAdd, setRoleToAdd] = useState('');

    const mutation = useMutation({
        mutationFn: (input: UpdateLogOptionsInput) => logSettingsApi.updateOptions(guildId, input),
        onSuccess: (result) => {
            cache.patch((data) => ({ ...data, options: result.options, ignoredUserNames: result.ignoredUserNames }));
            savedToast('บันทึกตัวกรองแล้ว');
        },
        onError: (err) => {
            failedToast(err);
            void cache.refresh();
        },
    });

    const addTo = (key: 'ignoredChannels' | 'ignoredRoles' | 'ignoredUsers', id: string) => {
        if (!id) return;
        if (options[key].includes(id)) return toast.info('มีอยู่ในรายการแล้ว');
        mutation.mutate({ [key]: [...options[key], id] });
    };
    const removeFrom = (key: 'ignoredChannels' | 'ignoredRoles' | 'ignoredUsers', id: string) =>
        mutation.mutate({ [key]: options[key].filter((x) => x !== id) });

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
                            <ChannelSelect
                                channels={channels}
                                showCategories
                                value={channelToAdd}
                                onChange={setChannelToAdd}
                                placeholder="เลือกห้องหรือหมวดหมู่ .."
                            />
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
