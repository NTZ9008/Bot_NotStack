import type { GuildChannel, LogSettingsResponse } from '@notstack/shared';
import { useMutation } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { logSettingsApi } from '@/api/bot';
import { ChannelSelect, channelLabel } from '@/components/channel-select';
import { useConfirm } from '@/components/confirm-dialog';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGuildId } from '@/hooks/use-guild';
import { EventCard } from './event-card';
import { failedToast, savedToast, useSettingsCache } from './use-log-settings';

type StatusFilter = 'all' | 'enabled' | 'unconfigured';

// ==========================================
// แท็บ "เหตุการณ์และห้อง" — ตั้งห้องเดียวให้ทุกรายการ + ค้นหา/กรอง + การ์ดของแต่ละเหตุการณ์แยกตามกลุ่ม
// ==========================================
export function EventsTab({ data, channels }: { data: LogSettingsResponse; channels: GuildChannel[] }) {
    const guildId = useGuildId();
    const cache = useSettingsCache();
    const confirm = useConfirm();
    const [bulkChannel, setBulkChannel] = useState('');
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<StatusFilter>('all');

    const applyAll = useMutation({
        mutationFn: (channelId: string) => logSettingsApi.applyAll(guildId, channelId),
        onSuccess: ({ events }) => {
            cache.patch((d) => ({ ...d, events }));
            savedToast('ตั้งห้องให้ทุกรายการแล้ว');
        },
        onError: failedToast,
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

    // กลุ่มที่ API ส่งมาเรียงไว้ก่อน แล้วต่อด้วยกลุ่มที่มีใน event แต่ไม่อยู่ในรายการ
    const groups = [...data.groups, ...new Set(data.events.map((e) => e.group).filter((g) => !data.groups.includes(g)))];
    const term = search.trim().toLowerCase();
    const visibleEvents = data.events.filter(
        (event) =>
            `${event.label} ${event.key} ${event.group}`.toLowerCase().includes(term) &&
            (status === 'all' || (status === 'enabled' && event.enabled) || (status === 'unconfigured' && event.enabled && !event.channelId)),
    );

    return (
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

            <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-48 flex-1">
                    <Search className="absolute top-2 left-3 size-4 text-muted-foreground" />
                    <Input
                        aria-label="ค้นหาเหตุการณ์"
                        className="pl-9"
                        placeholder="ค้นหาเหตุการณ์ เช่น ข้อความ สมาชิก ห้องเสียง…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
                    <SelectTrigger aria-label="กรองสถานะ" className="w-44">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">ทุกสถานะ</SelectItem>
                        <SelectItem value="enabled">เปิดใช้งาน</SelectItem>
                        <SelectItem value="unconfigured">รอเลือกห้อง</SelectItem>
                    </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">{visibleEvents.length} รายการ • บันทึกอัตโนมัติ</span>
            </div>
            {visibleEvents.length === 0 && (
                <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">ไม่พบเหตุการณ์ ลองเปลี่ยนคำค้นหาหรือตัวกรอง</p>
            )}

            {groups.map((group) => {
                const events = visibleEvents.filter((e) => e.group === group);
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
    );
}
