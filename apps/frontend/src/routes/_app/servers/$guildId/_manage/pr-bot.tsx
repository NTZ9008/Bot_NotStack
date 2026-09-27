import type { PrBotSettings, UpdatePrBotInput } from '@notstack/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Copy, Eye, EyeOff, Loader2, Plus, RefreshCw, Save, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { prBotQuery, rotatePrBotSecret, updatePrBot } from '@/api/bot';
import { guildChannelsQuery } from '@/api/guilds';
import { ChannelSelect } from '@/components/channel-select';
import { useConfirm } from '@/components/confirm-dialog';
import { Field } from '@/components/field';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { API_BASE, errorMessage } from '@/lib/api';
import { useGuild, useGuildId } from '@/hooks/use-guild';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/pr-bot')({
    loader: ({ context, params }) => context.queryClient.ensureQueryData(prBotQuery(params.guildId)),
    component: PrBotPage,
});

type Row = { key: string; value: string };
const toRows = (map: Record<string, string>): Row[] => {
    const rows = Object.entries(map).map(([key, value]) => ({ key, value }));
    return rows.length ? rows : [{ key: '', value: '' }];
};
const toMap = (rows: Row[]) => Object.fromEntries(rows.filter((r) => r.key.trim() && r.value.trim()).map((r) => [r.key.trim(), r.value.trim()]));

function useSavePrBot(successMessage: string) {
    const guildId = useGuildId();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: UpdatePrBotInput) => updatePrBot(guildId, input),
        onSuccess: (data) => {
            queryClient.setQueryData(prBotQuery(guildId).queryKey, data);
            toast.success(successMessage);
        },
        onError: (err) => toast.error('บันทึกไม่สำเร็จ', { description: errorMessage(err) }),
    });
}

// แถว key → value ที่เพิ่ม/ลบได้ (แทนการพิมพ์ JSON ดิบ)
function MapEditor({
    title,
    description,
    initial,
    keyPlaceholder,
    valuePlaceholder,
    addLabel,
    saveLabel,
    onSave,
    saving,
}: {
    title: string;
    description: string;
    initial: Record<string, string>;
    keyPlaceholder: string;
    valuePlaceholder: string;
    addLabel: string;
    saveLabel: string;
    onSave: (map: Record<string, string>) => void;
    saving: boolean;
}) {
    const [rows, setRows] = useState<Row[]>(() => toRows(initial));
    useEffect(() => setRows(toRows(initial)), [initial]);
    const update = (index: number, patch: Partial<Row>) => setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {rows.map((row, index) => (
                    <div key={index} className="flex gap-2">
                        <Input placeholder={keyPlaceholder} value={row.key} onChange={(e) => update(index, { key: e.target.value })} />
                        <Input placeholder={valuePlaceholder} value={row.value} onChange={(e) => update(index, { value: e.target.value })} />
                        <Button variant="ghost" size="icon" aria-label="ลบแถว" onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}>
                            <X />
                        </Button>
                    </div>
                ))}
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setRows((prev) => [...prev, { key: '', value: '' }])}>
                        <Plus /> {addLabel}
                    </Button>
                    <Button onClick={() => onSave(toMap(rows))} disabled={saving}>
                        {saving ? <Loader2 className="animate-spin" /> : <Save />} {saveLabel}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

function PrBotForm({ settings }: { settings: PrBotSettings }) {
    const guildId = useGuildId();
    const { data: channels = [] } = useQuery(guildChannelsQuery(guildId));
    const [defaultChannel, setDefaultChannel] = useState(settings.defaultChannelId);
    const saveDefault = useSavePrBot('บันทึกห้อง Default แล้ว');
    const saveOrgs = useSavePrBot('บันทึก Organization Mapping แล้ว');
    const saveMentions = useSavePrBot('บันทึก Mention Mapping แล้ว');

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>ห้อง Default</CardTitle>
                    <CardDescription>ใช้กับ organization/repo ที่ไม่ได้ระบุไว้ด้านล่าง</CardDescription>
                </CardHeader>
                <CardContent>
                    <Field hint="เลือก &quot;ไม่ส่ง&quot; = ปิดการแจ้งเตือนของ organization ที่ไม่ได้ระบุห้องไว้">
                        <form
                            className="flex gap-2"
                            onSubmit={(e) => {
                                e.preventDefault();
                                saveDefault.mutate({ defaultChannelId: defaultChannel.trim() });
                            }}
                        >
                            <ChannelSelect
                                channels={channels.filter((channel) => channel.sendable)}
                                value={defaultChannel}
                                onChange={setDefaultChannel}
                                noneLabel="— ไม่ส่ง —"
                            />
                            <Button type="submit" disabled={saveDefault.isPending}>
                                {saveDefault.isPending ? <Loader2 className="animate-spin" /> : <Save />} Save
                            </Button>
                        </form>
                    </Field>
                </CardContent>
            </Card>

            <MapEditor
                title="📂 ห้องแยกตาม Organization"
                description="PR จาก organization ไหน ให้ไปลงห้องไหน — เพิ่ม/ลบได้ตามต้องการ"
                initial={settings.orgChannels}
                keyPlaceholder="เช่น MUDST-2026-Pegasus"
                valuePlaceholder="Channel ID"
                addLabel="เพิ่ม Organization"
                saveLabel="บันทึก Organization Mapping"
                onSave={(orgChannels) => saveOrgs.mutate({ orgChannels })}
                saving={saveOrgs.isPending}
            />

            <MapEditor
                title="📣 Mention แยกตาม Repo"
                description="PR เปิดจาก repo ไหน (พิมพ์แบบ owner/repo) ให้ mention role อะไร — พิมพ์ชื่อ role ให้ตรงเป๊ะ หรือใส่ mention tag เช่น <@&1234567890> ก็ได้ — repo ที่ไม่ได้ระบุจะไม่ mention"
                initial={settings.repoMentions}
                keyPlaceholder="เช่น MUDST-2026-Pegasus/pegasus-tcg-api"
                valuePlaceholder="Role name หรือ <@&ROLE_ID>"
                addLabel="เพิ่ม Repo"
                saveLabel="บันทึก Mention Mapping"
                onSave={(repoMentions) => saveMentions.mutate({ repoMentions })}
                saving={saveMentions.isPending}
            />
        </>
    );
}

async function copy(text: string, label: string) {
    try {
        await navigator.clipboard.writeText(text);
        toast.success(`คัดลอก${label}แล้ว`);
    } catch {
        toast.error('คัดลอกไม่สำเร็จ — เลือกข้อความแล้วคัดลอกเอง');
    }
}

// URL + secret ที่ต้องใส่ใน GitHub (Settings → Webhooks) — แต่ละเซิร์ฟเวอร์มีของตัวเอง
function WebhookCard({ settings }: { settings: PrBotSettings }) {
    const guild = useGuild();
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const [reveal, setReveal] = useState(false);
    const url = `${API_BASE || window.location.origin}${settings.webhookPath}`;
    const rotate = useMutation({
        mutationFn: () => rotatePrBotSecret(guild.id),
        onSuccess: ({ webhookSecret }) => {
            queryClient.setQueryData(prBotQuery(guild.id).queryKey, { ...settings, webhookSecret });
            setReveal(true);
            toast.success('สร้าง secret ใหม่แล้ว', { description: 'อย่าลืมแก้ช่อง Secret ใน GitHub ให้ตรงกัน' });
        },
        onError: (err) => toast.error('สร้าง secret ใหม่ไม่สำเร็จ', { description: errorMessage(err) }),
    });

    return (
        <Card>
            <CardHeader>
                <CardTitle>GitHub Webhook</CardTitle>
                <CardDescription>
                    ที่ GitHub: Settings → Webhooks → Add webhook — Content type <code>application/json</code>, เลือก event <b>Pull requests</b>
                </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
                <Field label="Payload URL">
                    <div className="flex gap-2">
                        <Input readOnly className="font-mono text-xs" value={url} onFocus={(e) => e.target.select()} />
                        <Button variant="outline" onClick={() => void copy(url, ' URL')}>
                            <Copy /> คัดลอก
                        </Button>
                    </div>
                </Field>
                <Field label="Secret" hint="ใครรู้ secret นี้ส่งแจ้งเตือนปลอมเข้าเซิร์ฟเวอร์นี้ได้ — ถ้าหลุดให้กดสร้างใหม่แล้วแก้ใน GitHub">
                    <div className="flex flex-wrap gap-2">
                        <Input readOnly className="min-w-0 flex-1 font-mono text-xs" type={reveal ? 'text' : 'password'} value={settings.webhookSecret} onFocus={(e) => e.target.select()} />
                        <Button variant="outline" size="icon" aria-label={reveal ? 'ซ่อน secret' : 'แสดง secret'} onClick={() => setReveal((value) => !value)}>
                            {reveal ? <EyeOff /> : <Eye />}
                        </Button>
                        <Button variant="outline" onClick={() => void copy(settings.webhookSecret, ' secret')}>
                            <Copy /> คัดลอก
                        </Button>
                        <Button
                            variant="outline"
                            disabled={rotate.isPending}
                            onClick={async () => {
                                const ok = await confirm({
                                    title: 'สร้าง secret ใหม่?',
                                    description: 'secret เดิมจะใช้ไม่ได้ทันที — webhook ที่ตั้งไว้ใน GitHub จะส่งไม่ผ่านจนกว่าจะแก้เป็น secret ใหม่',
                                    confirmText: 'สร้างใหม่',
                                    destructive: true,
                                });
                                if (ok) rotate.mutate();
                            }}
                        >
                            {rotate.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} สร้างใหม่
                        </Button>
                    </div>
                </Field>
                {guild.isHome && (
                    <p className="text-xs text-muted-foreground">
                        เซิร์ฟเวอร์หลัก: webhook เดิม <code>/webhook/github</code> (ใช้ GITHUB_WEBHOOK_SECRET ใน .env ของเซิร์ฟเวอร์) ยังใช้ได้ตามเดิม
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

function PrBotPage() {
    const guildId = useGuildId();
    const { data, isLoading, error } = useQuery(prBotQuery(guildId));
    return (
        <>
            <PageHeader title="PR Bot — GitHub Notifications" description="ตั้งค่าห้องแจ้งเตือน Pull Request แยกตาม organization และ mention role แยกตาม repo" />
            {isLoading ? (
                <LoadingState />
            ) : error ? (
                <ErrorState error={error} />
            ) : (
                data && (
                    <>
                        <WebhookCard settings={data} />
                        <PrBotForm settings={data} />
                    </>
                )
            )}
        </>
    );
}
