import { tr, dateLocale } from '../../../../../lib/i18n';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { WeatherSettings } from '@notstack/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { AlertTriangle, Send } from '@/components/icons';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { guildChannelsQuery, guildRolesQuery } from '@/api/guilds';
import { weatherApi, weatherMetaQuery, weatherSettingsQuery } from '@/api/weather';
import { channelLabel } from '@/components/channel-select';
import { useConfirm } from '@/components/confirm-dialog';
import { FeatureSwitch, SaveBar } from '@/components/page-controls';
import { PageHeader } from '@/components/page-header';
import { WeatherPageSkeleton } from '@/components/skeleton/editor-pages';
import { ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isDirty, toDraft, type PatchWeather, type WeatherDraft } from '@/features/weather/types';
import { WEATHER_SECTIONS, WeatherForm, type WeatherSection } from '@/features/weather/weather-form';
import { WeatherPreview } from '@/features/weather/weather-preview';
import { useGuildId } from '@/hooks/use-guild';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes';
import { errorMessage } from '@/lib/api';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/weather')({
    loader: ({ context, params }) =>
        Promise.all([
            context.queryClient.ensureQueryData(guildChannelsQuery(params.guildId)).catch(() => undefined),
            context.queryClient.ensureQueryData(guildRolesQuery(params.guildId)).catch(() => undefined),
            context.queryClient.ensureQueryData(weatherMetaQuery(params.guildId)),
            context.queryClient.ensureQueryData(weatherSettingsQuery(params.guildId)),
        ]),
    component: WeatherPage,
});

// เวลาไทยแบบอ่านง่าย เช่น "พฤ. 25 ก.ย. 07:00 น."
function formatThai(value: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    return tr('weather.dateTime', {
        0: date.toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' }),
        1: date.toLocaleTimeString(dateLocale(), {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Bangkok',
        }),
    });
}

// ==========================================
// 🌤️ DAILY WEATHER REPORT — รายงานสภาพอากาศประจำวันของเซิร์ฟเวอร์ (embed + กราฟพยากรณ์ + แผนที่เรดาร์ฝน)
// - 5 หมวด: เวลา & ห้อง / สถานที่ / ข้อความ & ข้อมูล / กราฟ / เรดาร์ — แก้แล้วกด "บันทึก" (Ctrl/⌘ + S)
// - สวิตช์เปิด/ปิดบันทึกทันที · ตัวอย่างสร้างที่ server ด้วยโค้ดเดียวกับตอนส่งจริง
// ==========================================
function WeatherPage() {
    const guildId = useGuildId();
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const meta = useQuery(weatherMetaQuery(guildId));
    const settings = useQuery(weatherSettingsQuery(guildId));
    const { data: allChannels = [] } = useQuery(guildChannelsQuery(guildId));
    const { data: roles = [] } = useQuery(guildRolesQuery(guildId));
    const channels = allChannels.filter((ch) => ch.sendable);

    const [saved, setSaved] = useState<WeatherDraft | null>(null);
    const [draft, setDraft] = useState<WeatherDraft | null>(null);
    const [section, setSection] = useState<WeatherSection>('schedule');
    const [busy, setBusy] = useState<'save' | 'test' | 'toggle' | null>(null);
    const dirty = isDirty(draft, saved);

    // รับค่าที่ server ตรวจแล้ว (ตอนโหลดครั้งแรก / หลังบันทึก) มาเป็นทั้งค่าที่บันทึกไว้และค่าที่กำลังแก้
    const load = (next: WeatherSettings) => {
        queryClient.setQueryData(weatherSettingsQuery(guildId).queryKey, next);
        setSaved(toDraft(next));
        setDraft(toDraft(next));
    };

    useEffect(() => {
        if (settings.data && !saved) load(settings.data);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settings.data]);

    const patch = useCallback<PatchWeather>((mutate) => {
        setDraft((current) => {
            if (!current) return current;
            const next = structuredClone(current);
            mutate(next);
            return next;
        });
    }, []);

    // ออกจากหน้านี้ (หรือปิดแท็บ) ตอนมีการแก้ไขค้างอยู่ → ถามก่อน
    useUnsavedChangesGuard(dirty, {
        title: tr('common.discardUnsavedChanges'),
        description: tr('weather.theWeatherReportSettingsHaveUnsaved'),
        confirmText: tr('common.discardChanges'),
        destructive: true,
    });

    const save = async () => {
        if (!draft || !dirty || busy) return;
        setBusy('save');
        try {
            const result = await weatherApi.save(guildId, draft);
            load(result.settings);
            if (result.warning) toast.warning(tr('weather.savedButTheReportCantBe'), { description: result.warning });
            else toast.success(tr('common.settingsSaved'));
        } catch (err) {
            toast.error(tr('common.saveFailed'), { description: errorMessage(err) });
        } finally {
            setBusy(null);
        }
    };

    // สวิตช์บันทึกทันที — ใช้ค่าที่บันทึกไว้ (การแก้ไขที่ค้างอยู่ยังอยู่ ไม่ถูกบันทึกไปด้วย)
    const toggle = async (enabled: boolean) => {
        if (enabled && !saved?.channelId) return toast.error(tr('common.cantEnableYet'), { description: tr('common.pickAChannelAndPressSave') });
        setBusy('toggle');
        try {
            const result = await weatherApi.save(guildId, { enabled });
            queryClient.setQueryData(weatherSettingsQuery(guildId).queryKey, result.settings);
            if (result.warning) toast.warning(tr('weather.enabledButTheReportCantBe'), { description: result.warning });
            else toast.success(enabled ? tr('weather.weatherReportEnabled') : tr('weather.weatherReportDisabled'));
        } catch (err) {
            toast.error(tr('common.failedToChangeStatus'), { description: errorMessage(err) });
        } finally {
            setBusy(null);
        }
    };

    const testSend = async () => {
        if (!draft) return;
        if (!draft.channelId) return toast.error(tr('common.cantSendATestYet'), { description: tr('weather.pleasePickAChannelInTime') });
        const ok = await confirm({
            title: tr('weather.sendATestReportTo', { 0: channelLabel(allChannels, draft.channelId) }),
            description: tr('weather.usesTheValuesYoureEditingNow'),
            confirmText: tr('common.sendTest'),
        });
        if (!ok) return;
        setBusy('test');
        try {
            const result = await weatherApi.test(guildId, draft);
            toast.success(tr('common.testSent'), { description: result.message });
        } catch (err) {
            toast.error(tr('common.failedToSendTest'), { description: errorMessage(err) });
        } finally {
            setBusy(null);
        }
    };

    if (meta.isLoading || settings.isLoading) return <WeatherPageSkeleton />;
    if (meta.error || settings.error) return <ErrorState error={meta.error ?? settings.error} title={tr('weather.failedToLoadWeatherData')} />;
    const current = settings.data!;
    if (!draft || !meta.data) return <WeatherPageSkeleton />;

    return (
        <>
            <PageHeader
                help="weather"
                title={tr('common.weatherReport')}
                description={tr('weather.dailyWeatherEmbedWithAForecast')}
                actions={
                    <FeatureSwitch
                        checked={current.enabled}
                        disabled={busy === 'toggle'}
                        onCheckedChange={(checked) => void toggle(checked)}
                        title={tr('weather.turnScheduledReportsOnOffSaved')}
                    />
                }
            />

            {!meta.data.apiKeyConfigured && (
                <Alert variant="warning">
                    <AlertTriangle />
                    <AlertDescription>
                        <p>
                            {tr('weather.notSet')} <code>OPENWEATHER_KEY</code> {tr('weather.inTheServerEnvFileThe')}
                        </p>
                    </AlertDescription>
                </Alert>
            )}

            <Card>
                <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1 text-sm">
                        <p className="text-muted-foreground">
                            {current.enabled && current.nextRunAt ? (
                                <>
                                    <Badge variant="success" className="mr-1.5">
                                        {tr('common.on')}
                                    </Badge>
                                    {tr('weather.nextSend')} <strong className="text-foreground">{formatThai(current.nextRunAt)}</strong> {tr('common.joins')}{' '}
                                    {channelLabel(allChannels, current.channelId) ?? '-'}
                                </>
                            ) : (
                                <>
                                    <Badge variant="secondary" className="mr-1.5">
                                        {tr('common.off')}
                                    </Badge>

                                    {tr('weather.noScheduledReport')}
                                </>
                            )}
                        </p>
                        <p className="text-xs break-words text-muted-foreground">
                            {tr('weather.last')}{' '}
                            {!current.lastRunAt ? (
                                tr('weather.neverSentOnSchedule')
                            ) : current.lastError ? (
                                <>
                                    <span className="font-semibold text-destructive">{tr('weather.sendFailed')}</span> {formatThai(current.lastRunAt)} —{' '}
                                    {current.lastError}
                                </>
                            ) : (
                                <>
                                    <span className="font-semibold text-success">{tr('weather.sent')}</span> {formatThai(current.lastRunAt)}
                                </>
                            )}
                        </p>
                    </div>
                </CardHeader>
                <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                    <div className="space-y-4">
                        <Tabs value={section} onValueChange={(value) => setSection(value as WeatherSection)} className="gap-4">
                            <TabsList className="h-auto w-full flex-wrap">
                                {WEATHER_SECTIONS().map((s) => (
                                    <TabsTrigger key={s.value} value={s.value} className="flex-1">
                                        {s.label}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                            <TabsContent value={section}>
                                <WeatherForm section={section} meta={meta.data} draft={draft} patch={patch} channels={channels} roles={roles} />
                            </TabsContent>
                        </Tabs>
                    </div>

                    <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
                        <WeatherPreview
                            content={draft.content}
                            options={draft.options}
                            roles={roles}
                            channels={allChannels}
                            enabled={meta.data.apiKeyConfigured}
                        />
                    </div>
                </CardContent>
            </Card>

            <SaveBar dirty={dirty} saving={busy === 'save'} onSave={() => void save()} onReset={() => saved && setDraft(structuredClone(saved))}>
                <Button variant="secondary" onClick={() => void testSend()} disabled={busy === 'test'}>
                    {busy === 'test' ? <Spinner /> : <Send />} {tr('common.sendTest')}
                </Button>
            </SaveBar>
        </>
    );
}
