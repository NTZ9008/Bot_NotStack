import type { GuildChannel, LogEventSetting } from '@notstack/shared';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { logSettingsApi } from '@/api/bot';
import { ChannelSelect } from '@/components/channel-select';
import { Switch } from '@/components/ui/switch';
import { useGuildId } from '@/hooks/use-guild';
import { failedToast, savedToast, useSettingsCache } from './use-log-settings';

// ==========================================
// การ์ดของ log แต่ละชนิด — บันทึกอัตโนมัติทันทีที่แก้ (ไม่ต้องกดปุ่ม Save)
// ==========================================
export function EventCard({ event, channels }: { event: LogEventSetting; channels: GuildChannel[] }) {
    const guildId = useGuildId();
    const cache = useSettingsCache();
    const [color, setColor] = useState(event.color);
    useEffect(() => {
        setColor(event.color);
    }, [event.color]);

    const mutation = useMutation({
        mutationFn: (patch: { enabled?: boolean; channelId?: string; color?: string }) => logSettingsApi.update(guildId, { key: event.key, ...patch }),
        onSuccess: ({ setting }) => {
            cache.patch((data) => ({ ...data, events: data.events.map((e) => (e.key === setting.key ? setting : e)) }));
            savedToast();
        },
        onError: (err) => {
            failedToast(err);
            // ย้อนค่ากลับตามที่บันทึกจริง ไม่ให้หน้าจอโกหกว่าบันทึกแล้ว
            setColor(event.color);
            void cache.refresh();
        },
    });

    // ช่องเลือกสียิง onChange ถี่ระหว่างลาก → บันทึกเมื่อหยุดเลือกแล้ว
    useEffect(() => {
        if (color === event.color) return;
        const timer = setTimeout(() => {
            mutation.mutate({ color });
        }, 600);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [color, event.color]);

    return (
        <div className="space-y-2 rounded-lg border bg-card p-3" style={{ borderLeft: `3px solid ${color}` }}>
            <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium" title={event.label}>
                    {event.label}
                </span>
                <Switch
                    aria-label={`เปิด log ${event.label}`}
                    disabled={mutation.isPending}
                    checked={event.enabled}
                    onCheckedChange={(enabled) => mutation.mutate({ enabled })}
                />
            </div>
            <ChannelSelect
                channels={channels.filter((ch) => ch.sendable)}
                disabled={mutation.isPending}
                value={event.channelId}
                noneLabel="ยังไม่เลือกห้อง"
                placeholder="เลือกห้องปลายทาง"
                onChange={(channelId) => mutation.mutate({ channelId })}
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                สี
                <input
                    aria-label={`สีของ ${event.label}`}
                    disabled={mutation.isPending}
                    type="color"
                    className="h-6 w-10 cursor-pointer rounded border border-input bg-transparent"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                />
                <span className="font-mono">{color.toUpperCase()}</span>
                <span className={`ml-auto ${event.enabled && !event.channelId ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                    {mutation.isPending ? 'กำลังบันทึก…' : !event.enabled ? 'ปิดอยู่' : !event.channelId ? 'รอเลือกห้อง' : 'เปิดใช้งาน'}
                </span>
            </div>
        </div>
    );
}
