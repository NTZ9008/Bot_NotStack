import { DEFAULT_LOG_APPEARANCE } from '@notstack/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { guildChannelsQuery, guildRolesQuery } from '@/api/guilds';
import { logSettingsApi, logSettingsQuery } from '@/api/bot';
import { PageHeader } from '@/components/page-header';
import { LogManagerBodySkeleton } from '@/components/skeleton/editor-pages';
import { ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppearanceEditor } from '@/features/log-manager/appearance-editor';
import { EventsTab } from '@/features/log-manager/events-tab';
import { IgnorePanel } from '@/features/log-manager/ignore-panel';
import { failedToast, savedToast, useSettingsCache } from '@/features/log-manager/use-log-settings';
import { useGuildId } from '@/hooks/use-guild';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/log-manager')({
    loader: ({ context, params }) => context.queryClient.ensureQueryData(logSettingsQuery(params.guildId)),
    component: LogManagerPage,
});

// ==========================================
// 🧾 Log Manager — สวิตช์ระบบ + แท็บ เหตุการณ์และห้อง / รูปแบบข้อความ / ตัวกรอง
// ==========================================
function LogManagerPage() {
    const guildId = useGuildId();
    const { data, isLoading, error } = useQuery(logSettingsQuery(guildId));
    const { data: channels = [] } = useQuery(guildChannelsQuery(guildId));
    const { data: roles = [] } = useQuery(guildRolesQuery(guildId));
    const cache = useSettingsCache();

    const toggleSystem = useMutation({
        mutationFn: (enabled: boolean) => logSettingsApi.toggleSystem(guildId, enabled),
        onSuccess: ({ systemEnabled }) => {
            cache.patch((d) => ({ ...d, systemEnabled }));
            savedToast(systemEnabled ? 'เปิดระบบ Log แล้ว' : 'ปิดระบบ Log แล้ว');
        },
        onError: failedToast,
    });

    const ready = data?.events.filter((event) => event.enabled && event.channelId).length ?? 0;
    const unconfigured = data?.events.filter((event) => event.enabled && !event.channelId).length ?? 0;

    return (
        <>
            <PageHeader
                help="logManager"
                title="ตั้งค่าบันทึกเหตุการณ์"
                description="ติดตามเหตุการณ์สำคัญ ออกแบบข้อความให้อ่านง่าย และเลือกห้องรับแจ้งเตือน"
                actions={
                    data && (
                        <Label className="flex items-center gap-3 rounded-lg border px-3 py-2">
                            ระบบ Log ทั้งหมด
                            <Switch
                                disabled={toggleSystem.isPending}
                                checked={data.systemEnabled}
                                onCheckedChange={(enabled) => toggleSystem.mutate(enabled)}
                            />
                        </Label>
                    )
                }
            />
            {isLoading ? (
                <LogManagerBodySkeleton />
            ) : error ? (
                <ErrorState error={error} title="โหลดการตั้งค่า Log ไม่สำเร็จ" />
            ) : (
                data && (
                    <>
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                            <Badge variant={data.systemEnabled ? 'secondary' : 'outline'}>{data.systemEnabled ? 'ระบบเปิดอยู่' : 'หยุดส่ง Log ชั่วคราว'}</Badge>
                            <span className="text-muted-foreground">
                                พร้อมส่ง {ready} / {data.events.length} ประเภท
                            </span>
                            {unconfigured > 0 && (
                                <Badge variant="outline" className="text-amber-600 dark:text-amber-400">
                                    รอเลือกห้อง {unconfigured} ประเภท
                                </Badge>
                            )}
                        </div>
                        {!data.systemEnabled && (
                            <p role="status" className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                                ระบบหยุดส่ง embed เข้า Discord อยู่ คุณยังแก้ไขการตั้งค่าได้ ส่วนการบันทึก Activity ขึ้นอยู่กับค่าที่เลือกในแท็บตัวกรอง
                            </p>
                        )}
                        <Tabs defaultValue="events" className="gap-5">
                            <TabsList className="h-auto w-full flex-wrap justify-start sm:w-fit">
                                <TabsTrigger value="events" className="px-4 py-2">
                                    เหตุการณ์และห้อง
                                </TabsTrigger>
                                <TabsTrigger value="appearance" className="px-4 py-2">
                                    รูปแบบข้อความ
                                </TabsTrigger>
                                <TabsTrigger value="filters" className="px-4 py-2">
                                    ตัวกรอง
                                </TabsTrigger>
                            </TabsList>
                            <TabsContent value="appearance" forceMount className="data-[state=inactive]:hidden">
                                <AppearanceEditor
                                    key={guildId}
                                    guildId={guildId}
                                    appearance={data.options.appearance ?? DEFAULT_LOG_APPEARANCE}
                                    events={data.events}
                                    onSaved={(appearance) => cache.patch((current) => ({ ...current, options: { ...current.options, appearance } }))}
                                />
                            </TabsContent>
                            <TabsContent value="filters">
                                <IgnorePanel options={data.options} userNames={data.ignoredUserNames} channels={channels} roles={roles} />
                            </TabsContent>
                            <TabsContent value="events" className="space-y-5">
                                <EventsTab data={data} channels={channels} />
                            </TabsContent>
                        </Tabs>
                    </>
                )
            )}
        </>
    );
}
