import { tr, trText } from '../../lib/i18n';
import type { GuildChannel, LogSettingsResponse } from '@notstack/shared';
import { useMutation } from '@tanstack/react-query';
import { Search } from '@/components/icons';
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
            savedToast(tr('logManager.channelSetForEveryEntry'));
        },
        onError: failedToast,
    });

    const applyToAll = async () => {
        if (!bulkChannel) return toast.warning(tr('common.noChannelSelected'), { description: tr('logManager.pleasePickATargetChannelFirst') });
        const ok = await confirm({
            title: tr('logManager.confirmSettings'),
            description: tr('logManager.sendEveryLogToEachEntrys', { 0: channelLabel(channels, bulkChannel) }),
            confirmText: tr('common.done'),
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
                    <Field label={tr('logManager.setTheSameChannelForAll')}>
                        <div className="flex flex-wrap gap-2 md:max-w-xl md:flex-nowrap">
                            <ChannelSelect channels={channels.filter((ch) => ch.sendable)} value={bulkChannel} onChange={setBulkChannel} />
                            <Button variant="secondary" onClick={() => void applyToAll()} disabled={applyAll.isPending}>
                                {tr('logManager.useThisChannelForAll')}
                            </Button>
                        </div>
                    </Field>
                </CardContent>
            </Card>

            <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-48 flex-1">
                    <Search className="absolute top-2 left-3 size-4 text-muted-foreground" />
                    <Input
                        aria-label={tr('logManager.searchEvents')}
                        className="pl-9"
                        placeholder={tr('logManager.searchEventsEGMessageMember')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
                    <SelectTrigger aria-label={tr('logManager.filterStatus')} className="w-44">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{tr('logManager.allStatuses')}</SelectItem>
                        <SelectItem value="enabled">{tr('common.enabled')}</SelectItem>
                        <SelectItem value="unconfigured">{tr('logManager.waitingForAChannel')}</SelectItem>
                    </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">
                    {visibleEvents.length} {tr('logManager.entriesSavedAutomatically')}
                </span>
            </div>
            {visibleEvents.length === 0 && (
                <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">{tr('logManager.noEventsFoundTryAnotherSearch')}</p>
            )}

            {groups.map((group) => {
                const events = visibleEvents.filter((e) => e.group === group);
                if (!events.length) return null;
                return (
                    <section key={group} className="space-y-3">
                        <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{trText(group)}</h3>
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
