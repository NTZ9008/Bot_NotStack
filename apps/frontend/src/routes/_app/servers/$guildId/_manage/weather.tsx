import type { WeatherSettings } from '@notstack/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useBlocker } from '@tanstack/react-router';
import { AlertTriangle, Loader2, RotateCcw, Save, Send } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { guildChannelsQuery, guildRolesQuery } from '@/api/guilds';
import { weatherApi, weatherMetaQuery, weatherSettingsQuery } from '@/api/weather';
import { channelLabel } from '@/components/channel-select';
import { useConfirm } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isDirty, toDraft, type PatchWeather, type WeatherDraft } from '@/features/weather/types';
import { WEATHER_SECTIONS, WeatherForm, type WeatherSection } from '@/features/weather/weather-form';
import { WeatherPreview } from '@/features/weather/weather-preview';
import { useGuildId } from '@/hooks/use-guild';
import { errorMessage } from '@/lib/api';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/weather')({
    loader: ({ context, params }) =>
        Promise.all([
            context.queryClient.ensureQueryData(weatherMetaQuery(params.guildId)),
            context.queryClient.ensureQueryData(weatherSettingsQuery(params.guildId)),
        ]),
    component: WeatherPage,
});

// เวลาไทยแบบอ่านง่าย เช่น "พฤ. 25 ก.ย. 07:00 น."
function formatThai(value: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    return `${date.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' })} ${date.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Bangkok',
    })} น.`;
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
    useBlocker({
        shouldBlockFn: async () =>
            dirty &&
            !(await confirm({
                title: 'ทิ้งการแก้ไขที่ยังไม่บันทึก?',
                description: 'การตั้งค่ารายงานสภาพอากาศมีการแก้ไขที่ยังไม่ได้กดบันทึก',
                confirmText: 'ทิ้งการแก้ไข',
                destructive: true,
            })),
        enableBeforeUnload: () => dirty,
    });

    const save = async () => {
        if (!draft || !dirty || busy) return;
        setBusy('save');
        try {
            const result = await weatherApi.save(guildId, draft);
            load(result.settings);
            if (result.warning) toast.warning('บันทึกแล้ว แต่ยังส่งรายงานไม่ได้', { description: result.warning });
            else toast.success('บันทึกการตั้งค่าแล้ว');
        } catch (err) {
            toast.error('บันทึกไม่สำเร็จ', { description: errorMessage(err) });
        } finally {
            setBusy(null);
        }
    };

    // Ctrl/⌘ + S = บันทึก
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                void save();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    });

    // สวิตช์บันทึกทันที — ใช้ค่าที่บันทึกไว้ (การแก้ไขที่ค้างอยู่ยังอยู่ ไม่ถูกบันทึกไปด้วย)
    const toggle = async (enabled: boolean) => {
        if (enabled && !saved?.channelId) return toast.error('ยังเปิดใช้งานไม่ได้', { description: 'เลือกห้องที่จะส่งแล้วกด "บันทึก" ก่อนเปิดใช้งาน' });
        setBusy('toggle');
        try {
            const result = await weatherApi.save(guildId, { enabled });
            queryClient.setQueryData(weatherSettingsQuery(guildId).queryKey, result.settings);
            if (result.warning) toast.warning('เปิดใช้งานแล้ว แต่ยังส่งรายงานไม่ได้', { description: result.warning });
            else toast.success(enabled ? 'เปิดรายงานสภาพอากาศแล้ว' : 'ปิดรายงานสภาพอากาศแล้ว');
        } catch (err) {
            toast.error('เปลี่ยนสถานะไม่สำเร็จ', { description: errorMessage(err) });
        } finally {
            setBusy(null);
        }
    };

    const testSend = async () => {
        if (!draft) return;
        if (!draft.channelId) return toast.error('ยังส่งทดสอบไม่ได้', { description: 'กรุณาเลือกห้องที่จะส่งในหมวด "เวลา & ห้อง" ก่อน' });
        const ok = await confirm({
            title: `ส่งรายงานทดสอบเข้า ${channelLabel(allChannels, draft.channelId)}?`,
            description: 'ใช้ค่าที่กำลังแก้อยู่ตอนนี้ (แม้ยังไม่บันทึก) — สมาชิกในห้องนั้นจะเห็นข้อความนี้',
            confirmText: 'ส่งทดสอบ',
        });
        if (!ok) return;
        setBusy('test');
        try {
            const result = await weatherApi.test(guildId, draft);
            toast.success('ส่งทดสอบแล้ว', { description: result.message });
        } catch (err) {
            toast.error('ส่งทดสอบไม่สำเร็จ', { description: errorMessage(err) });
        } finally {
            setBusy(null);
        }
    };

    if (meta.isLoading || settings.isLoading) return <LoadingState />;
    if (meta.error || settings.error) return <ErrorState error={meta.error ?? settings.error} title="โหลดข้อมูล Weather ไม่สำเร็จ" />;
    const current = settings.data!;
    if (!draft || !meta.data) return <LoadingState />;

    return (
        <>
            <PageHeader
                title="Daily Weather Report"
                description="รายงานสภาพอากาศประจำวันแบบ embed พร้อมกราฟพยากรณ์และแผนที่เรดาร์ฝน — ตั้งเวลา ห้อง สถานที่ และข้อมูลที่จะแสดงได้ที่นี่"
            />

            {!meta.data.apiKeyConfigured && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
                    <p>
                        ยังไม่ได้ตั้งค่า <code>OPENWEATHER_KEY</code> ในไฟล์ .env ของเซิร์ฟเวอร์ — บอทจะดึงข้อมูลอากาศไม่ได้
                    </p>
                </div>
            )}

            <Card>
                <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1 text-sm">
                        <p className="text-muted-foreground">
                            {current.enabled && current.nextRunAt ? (
                                <>
                                    <Badge className="mr-1.5 bg-emerald-500/15 text-emerald-300">เปิดอยู่</Badge>
                                    ส่งครั้งถัดไป <strong className="text-foreground">{formatThai(current.nextRunAt)}</strong> เข้า {channelLabel(allChannels, current.channelId) ?? '-'}
                                </>
                            ) : (
                                <>
                                    <Badge variant="secondary" className="mr-1.5">
                                        ปิดอยู่
                                    </Badge>
                                    ไม่ส่งรายงานตามเวลา
                                </>
                            )}
                        </p>
                        <p className="text-xs break-words text-muted-foreground">
                            ล่าสุด:{' '}
                            {!current.lastRunAt ? (
                                'ยังไม่เคยส่งตามเวลา'
                            ) : current.lastError ? (
                                <>
                                    <span className="font-semibold text-red-400">✗ ส่งไม่สำเร็จ</span> {formatThai(current.lastRunAt)} — {current.lastError}
                                </>
                            ) : (
                                <>
                                    <span className="font-semibold text-emerald-400">✓ ส่งสำเร็จ</span> {formatThai(current.lastRunAt)}
                                </>
                            )}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {dirty && <Badge className="bg-amber-500/15 text-amber-300">มีการแก้ไขที่ยังไม่บันทึก</Badge>}
                        <Label className="flex items-center gap-2" title="เปิด/ปิดการส่งรายงานตามเวลา (บันทึกทันที)">
                            เปิดใช้งาน
                            <Switch checked={current.enabled} disabled={busy === 'toggle'} onCheckedChange={(checked) => void toggle(checked)} />
                        </Label>
                    </div>
                </CardHeader>
                <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                    <div className="space-y-4">
                        <Tabs value={section} onValueChange={(value) => setSection(value as WeatherSection)}>
                            <TabsList className="h-auto w-full flex-wrap">
                                {WEATHER_SECTIONS.map((s) => (
                                    <TabsTrigger key={s.value} value={s.value} className="flex-1">
                                        {s.label}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                        <WeatherForm section={section} meta={meta.data} draft={draft} patch={patch} channels={channels} roles={roles} />
                    </div>

                    <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
                        <WeatherPreview content={draft.content} options={draft.options} roles={roles} channels={allChannels} enabled={meta.data.apiKeyConfigured} />
                        <div className="flex flex-wrap gap-2">
                            <Button onClick={() => void save()} disabled={!dirty || busy === 'save'} title="Ctrl/⌘ + S">
                                {busy === 'save' ? <Loader2 className="animate-spin" /> : <Save />} บันทึก
                            </Button>
                            <Button variant="outline" disabled={!dirty} onClick={() => saved && setDraft(structuredClone(saved))}>
                                <RotateCcw /> ยกเลิกการแก้ไข
                            </Button>
                            <Button variant="secondary" className="text-amber-300" onClick={() => void testSend()} disabled={busy === 'test'}>
                                {busy === 'test' ? <Loader2 className="animate-spin" /> : <Send />} ส่งทดสอบ
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </>
    );
}
