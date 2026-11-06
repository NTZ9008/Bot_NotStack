import type { GrafanaSettings, UpdateGrafanaSettingsInput } from '@notstack/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Copy, Eye, EyeOff, Loader2, Plus, RefreshCw, Save, Send, Trash2 } from 'lucide-react';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { grafanaQuery, grafanaStatsQuery, rotateGrafanaSecret, sendGrafanaTest, updateGrafana } from '@/api/bot';
import { guildChannelsQuery } from '@/api/guilds';
import { ChannelSelect } from '@/components/channel-select';
import { useConfirm } from '@/components/confirm-dialog';
import { Field } from '@/components/field';
import { PageHeader } from '@/components/page-header';
import { PrBotBodySkeleton } from '@/components/skeleton/guild-pages';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { API_BASE, errorMessage } from '@/lib/api';
import { useGuildId } from '@/hooks/use-guild';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/grafana-alerts')({
    loader: ({ context, params }) => Promise.all([context.queryClient.ensureQueryData(grafanaQuery(params.guildId)), context.queryClient.ensureQueryData(guildChannelsQuery(params.guildId)).catch(() => undefined)]),
    component: GrafanaAlertsPage,
});

const chartConfig = {
    firing: { label: 'Firing', color: '#f97316' },
    resolved: { label: 'Resolved', color: '#a78bfa' },
    sent: { label: 'ส่งทั้งหมด', color: '#38bdf8' },
} satisfies ChartConfig;

function GrafanaStatsCard({ guildId }: { guildId: string }) {
    const { data, isLoading, error, isFetching, refetch } = useQuery(grafanaStatsQuery(guildId));
    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div><CardTitle>สถิติการแจ้งเตือน</CardTitle><CardDescription>จำนวนเหตุการณ์ย้อนหลัง 7 วัน ตามเวลา Asia/Bangkok</CardDescription></div>
                <Button variant="outline" size="icon" aria-label="รีเฟรชสถิติ Grafana" disabled={isFetching} onClick={() => void refetch()}><RefreshCw className={isFetching ? 'animate-spin' : undefined} /></Button>
            </CardHeader>
            <CardContent>
                {error ? <ErrorState error={error} /> : isLoading || !data ? <div className="h-64 animate-pulse rounded-xl bg-muted/50" /> : <>
                    <div className="mb-4 grid grid-cols-3 gap-3">
                        {(['firing', 'resolved', 'sent'] as const).map((key) => <div key={key} className="rounded-xl border p-3"><p className="text-2xl font-semibold tabular-nums">{data.totals[key].toLocaleString()}</p><p className="text-xs text-muted-foreground">{chartConfig[key].label}</p></div>)}
                    </div>
                    <ChartContainer config={chartConfig} className="h-64 w-full">
                        <BarChart accessibilityLayer data={data.daily} margin={{ left: 4, right: 4 }}>
                            <CartesianGrid vertical={false} />
                            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(value: string) => value.slice(5)} />
                            <YAxis allowDecimals={false} width={28} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            <ChartLegend content={<ChartLegendContent />} />
                            <Bar dataKey="firing" fill="var(--color-firing)" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="resolved" fill="var(--color-resolved)" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="sent" fill="var(--color-sent)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ChartContainer>
                </>}
            </CardContent>
        </Card>
    );
}

async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); toast.success(`คัดลอก${label}แล้ว`); }
    catch { toast.error('คัดลอกไม่สำเร็จ'); }
}

function GrafanaSettingsCards({ settings }: { settings: GrafanaSettings }) {
    const guildId = useGuildId();
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const { data: channels = [] } = useQuery(guildChannelsQuery(guildId));
    const [reveal, setReveal] = useState(false);
    const [defaultChannel, setDefaultChannel] = useState(settings.defaultChannelId);
    const [rows, setRows] = useState<Array<{ label: 'env' | 'severity'; value: string; channelId: string }>>([]);
    const webhookUrl = `${API_BASE || window.location.origin}${settings.webhookPath}`;
    useEffect(() => {
        setDefaultChannel(settings.defaultChannelId);
        setRows(Object.entries(settings.labelChannels).map(([key, channelId]) => {
            const [label, ...rest] = key.split(':');
            return { label: label === 'severity' ? 'severity' : 'env', value: rest.join(':'), channelId };
        }));
    }, [settings]);
    const save = useMutation({
        mutationFn: (input: UpdateGrafanaSettingsInput) => updateGrafana(guildId, input),
        onSuccess: (data) => { queryClient.setQueryData(grafanaQuery(guildId).queryKey, data); toast.success('บันทึกการตั้งค่า Grafana แล้ว'); },
        onError: (err) => toast.error('บันทึกไม่สำเร็จ', { description: errorMessage(err) }),
    });
    const rotate = useMutation({
        mutationFn: () => rotateGrafanaSecret(guildId),
        onSuccess: ({ webhookSecret }) => { queryClient.setQueryData(grafanaQuery(guildId).queryKey, { ...settings, webhookSecret }); setReveal(true); toast.success('สร้าง Secret ใหม่แล้ว'); },
        onError: (err) => toast.error('สร้าง Secret ไม่สำเร็จ', { description: errorMessage(err) }),
    });
    const test = useMutation({
        mutationFn: () => sendGrafanaTest(guildId),
        onSuccess: () => toast.success('ส่ง Test Alert ไป Discord แล้ว'),
        onError: (err) => toast.error('ส่ง Test Alert ไม่สำเร็จ', { description: errorMessage(err) }),
    });
    const saveSettings = (event: FormEvent) => {
        event.preventDefault();
        const labelChannels = Object.fromEntries(rows.filter((row) => row.value.trim() && row.channelId).map((row) => [`${row.label}:${row.value.trim()}`, row.channelId]));
        save.mutate({ defaultChannelId: defaultChannel, labelChannels });
    };
    return <>
        <Card>
            <CardHeader><CardTitle>Grafana Webhook</CardTitle><CardDescription>ที่ Grafana: Alerting → Contact points → Add contact point — เลือก Integration เป็น Webhook แล้ววาง Payload URL ด้านล่าง ตั้ง HTTP Header `Authorization: Bearer &lt;Secret&gt;`</CardDescription></CardHeader>
            <CardContent className="space-y-4">
                <Field label="Payload URL"><div className="flex gap-2"><Input readOnly className="font-mono text-xs" value={webhookUrl} onFocus={(event) => event.target.select()} /><Button variant="outline" onClick={() => void copy(webhookUrl, ' URL')}><Copy /> คัดลอก</Button></div></Field>
                <Field label="Secret / Token" hint="เก็บ Secret ไว้ในที่ปลอดภัย แล้วตั้ง Authorization header ใน Grafana Contact point"><div className="flex flex-wrap gap-2"><Input readOnly className="min-w-0 flex-1 font-mono text-xs" type={reveal ? 'text' : 'password'} value={settings.webhookSecret} onFocus={(event) => event.target.select()} /><Button variant="outline" size="icon" aria-label={reveal ? 'ซ่อน Secret' : 'แสดง Secret'} onClick={() => setReveal((value) => !value)}>{reveal ? <EyeOff /> : <Eye />}</Button><Button variant="outline" onClick={() => void copy(settings.webhookSecret, ' Secret')}><Copy /> คัดลอก</Button><Button variant="outline" disabled={rotate.isPending} onClick={async () => { if (await confirm({ title: 'สร้าง Secret ใหม่?', description: 'Secret เดิมจะใช้ไม่ได้ทันที อย่าลืมอัปเดต Authorization header ใน Grafana', confirmText: 'สร้างใหม่', destructive: true })) rotate.mutate(); }}>{rotate.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} สร้างใหม่</Button></div></Field>
                <div className="flex flex-wrap items-center gap-3"><Button disabled={test.isPending || !settings.defaultChannelId} onClick={() => test.mutate()}>{test.isPending ? <Loader2 className="animate-spin" /> : <Send />} ส่งแจ้งเตือนทดสอบ (Test Alert)</Button><p className="text-xs text-muted-foreground">ตั้งค่า endpoint ต่อ Guild พร้อมรองรับ mapping ตาม label</p></div>
            </CardContent>
        </Card>
        <Card>
            <CardHeader><CardTitle>ห้องแจ้งเตือนและ Routing</CardTitle><CardDescription>เลือกห้องเริ่มต้น หรือกำหนดห้องแยกตาม label `env` และ `severity`</CardDescription></CardHeader>
            <CardContent><form className="space-y-5" onSubmit={saveSettings}>
                <Field label="ห้องเริ่มต้น" hint="เลือกไม่ส่งเพื่อปิดการแจ้งเตือนสำหรับ Alert ที่ไม่ตรง mapping"><div className="flex flex-col gap-2 sm:flex-row"><ChannelSelect channels={channels.filter((channel) => channel.sendable)} value={defaultChannel} onChange={setDefaultChannel} noneLabel="— ไม่ส่ง —" /><Button type="submit" disabled={save.isPending}>{save.isPending ? <Loader2 className="animate-spin" /> : <Save />} บันทึก</Button></div></Field>
                <div className="space-y-3"><div><p className="text-sm font-medium">แยกห้องตาม Environment หรือ Severity</p><p className="text-xs text-muted-foreground">เช่น `env:prod` หรือ `severity:critical` — mapping ที่ตรงจะใช้ก่อนห้องเริ่มต้น</p></div>
                    {rows.map((row, index) => <div key={index} className="grid gap-2 sm:grid-cols-[140px_minmax(120px,1fr)_minmax(180px,1.4fr)_40px]">
                        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" aria-label="ชนิด label" value={row.label} onChange={(event) => setRows((current) => current.map((item, i) => i === index ? { ...item, label: event.target.value as 'env' | 'severity' } : item))}><option value="env">env</option><option value="severity">severity</option></select>
                        <Input aria-label="ค่า label" placeholder={row.label === 'env' ? 'prod' : 'critical'} value={row.value} onChange={(event) => setRows((current) => current.map((item, i) => i === index ? { ...item, value: event.target.value } : item))} />
                        <ChannelSelect channels={channels.filter((channel) => channel.sendable)} value={row.channelId} onChange={(channelId) => setRows((current) => current.map((item, i) => i === index ? { ...item, channelId } : item))} noneLabel="— เลือกห้อง —" />
                        <Button type="button" variant="ghost" size="icon" aria-label="ลบ mapping" onClick={() => setRows((current) => current.filter((_, i) => i !== index))}><Trash2 /></Button>
                    </div>)}
                    <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setRows((current) => [...current, { label: 'env', value: '', channelId: '' }])}><Plus /> เพิ่ม Mapping</Button><Button type="submit" disabled={save.isPending}>{save.isPending ? <Loader2 className="animate-spin" /> : <Save />} บันทึก</Button></div>
                </div>
            </form></CardContent>
        </Card>
    </>;
}

function GrafanaAlertsPage() {
    const guildId = useGuildId();
    const { data, isLoading, error } = useQuery(grafanaQuery(guildId));
    return <>
        <PageHeader help="grafanaAlerts" title="แจ้งเตือน Grafana Alert" description="รับสถานะ Alertmanager และส่งต่อไปยังห้อง Discord ของเซิร์ฟเวอร์นี้" />
        {isLoading ? <PrBotBodySkeleton /> : error ? <ErrorState error={error} /> : data && <div className="space-y-5"><GrafanaStatsCard guildId={guildId} /><GrafanaSettingsCards settings={data} /></div>}
    </>;
}
