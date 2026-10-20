import { JIRA_LIMITS, type JiraConnectionResult, type JiraOptions, type JiraSettings } from '@notstack/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ExternalLink, Loader2, PlugZap, RotateCcw, Save, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { guildChannelsQuery, guildRolesQuery } from '@/api/guilds';
import { jiraApi, jiraSettingsQuery } from '@/api/jira';
import { ChannelSelect, channelLabel } from '@/components/channel-select';
import { ColorField } from '@/components/color-field';
import { useConfirm } from '@/components/confirm-dialog';
import { DiscordMessage } from '@/components/discord-message';
import { Field } from '@/components/field';
import { IdChoices } from '@/components/id-choices';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { JiraTicketsCard } from '@/features/jira/tickets-card';
import { useGuildId } from '@/hooks/use-guild';
import { useSaveShortcut, useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes';
import { errorMessage } from '@/lib/api';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/jira')({
    loader: ({ context, params }) => context.queryClient.ensureQueryData(jiraSettingsQuery(params.guildId)),
    component: JiraPage,
});

// ค่าที่แก้ในฟอร์ม — apiToken ว่าง = ไม่เปลี่ยน token เดิม
interface Draft {
    siteUrl: string;
    email: string;
    apiToken: string;
    projectKey: string;
    panelChannelId: string;
    logChannelId: string;
    categoryId: string;
    options: JiraOptions;
}

const toDraft = (s: JiraSettings): Draft => ({
    siteUrl: s.siteUrl,
    email: s.email,
    apiToken: '',
    projectKey: s.projectKey,
    panelChannelId: s.panelChannelId,
    logChannelId: s.logChannelId,
    categoryId: s.categoryId,
    options: structuredClone(s.options),
});

type IssueTypeRow = { id: string; name: string; description: string; missing: boolean };

// ==========================================
// 🎫 JIRA CARD — สมาชิกกดปุ่มในห้องแผง → ห้องส่วนตัว → เลือกประเภท + กรอกหัวข้อ/รายละเอียด → card ใน Jira
// แก้ค่าแล้วกด "บันทึก" (Ctrl/⌘ + S) · สวิตช์เปิด/ปิดบันทึกทันที · ส่งแผงใช้ค่าที่บันทึกแล้ว
// ==========================================
function JiraPage() {
    const guildId = useGuildId();
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const settings = useQuery(jiraSettingsQuery(guildId));
    const { data: allChannels = [] } = useQuery(guildChannelsQuery(guildId));
    const { data: roles = [] } = useQuery(guildRolesQuery(guildId));
    const textChannels = allChannels.filter((ch) => ch.sendable);
    const categories = allChannels.filter((ch) => ch.isCategory);

    const [saved, setSaved] = useState<Draft | null>(null);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [busy, setBusy] = useState<'save' | 'toggle' | 'test' | 'panel' | null>(null);
    const [connection, setConnection] = useState<JiraConnectionResult | null>(null);
    const dirty = Boolean(draft && saved && JSON.stringify(draft) !== JSON.stringify(saved));

    const load = (next: JiraSettings) => {
        queryClient.setQueryData(jiraSettingsQuery(guildId).queryKey, next);
        setSaved(toDraft(next));
        setDraft(toDraft(next));
    };

    useEffect(() => {
        if (settings.data && !saved) load(settings.data);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settings.data]);

    const patch = (next: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...next } : current));
    const patchOptions = (next: Partial<JiraOptions>) => setDraft((current) => (current ? { ...current, options: { ...current.options, ...next } } : current));

    useUnsavedChangesGuard(dirty, {
        title: 'ทิ้งการแก้ไขที่ยังไม่บันทึก?',
        description: 'การตั้งค่า Jira มีการแก้ไขที่ยังไม่ได้กดบันทึก',
        confirmText: 'ทิ้งการแก้ไข',
        destructive: true,
    });

    const save = async () => {
        if (!draft || !dirty || busy) return;
        setBusy('save');
        try {
            const result = await jiraApi.save(guildId, draft);
            load(result.settings);
            if (result.warning) toast.warning('บันทึกแล้ว แต่ยังมีปัญหา', { description: result.warning });
            else toast.success('บันทึกการตั้งค่าแล้ว');
        } catch (err) {
            toast.error('บันทึกไม่สำเร็จ', { description: errorMessage(err) });
        } finally {
            setBusy(null);
        }
    };

    useSaveShortcut(() => void save());

    // สวิตช์บันทึกทันทีด้วยค่าที่บันทึกไว้ (การแก้ไขที่ค้างอยู่ไม่ถูกบันทึกไปด้วย)
    const toggle = async (enabled: boolean) => {
        setBusy('toggle');
        try {
            const result = await jiraApi.save(guildId, { enabled });
            queryClient.setQueryData(jiraSettingsQuery(guildId).queryKey, result.settings);
            if (result.warning) toast.warning(enabled ? 'เปิดใช้งานแล้ว แต่ยังมีปัญหา' : 'ปิดใช้งานแล้ว', { description: result.warning });
            else toast.success(enabled ? 'เปิดระบบ Jira card แล้ว' : 'ปิดระบบ Jira card แล้ว');
        } catch (err) {
            toast.error('เปลี่ยนสถานะไม่สำเร็จ', { description: errorMessage(err) });
        } finally {
            setBusy(null);
        }
    };

    const testConnection = async () => {
        if (!draft) return;
        setBusy('test');
        try {
            const result = await jiraApi.test(guildId, { siteUrl: draft.siteUrl, email: draft.email, apiToken: draft.apiToken, projectKey: draft.projectKey });
            setConnection(result);
            toast.success('เชื่อมต่อ Jira สำเร็จ', {
                description: `${result.accountName} · โปรเจกต์ ${result.projectName} (${result.issueTypes.length} ประเภท)`,
            });
        } catch (err) {
            setConnection(null);
            toast.error('เชื่อมต่อ Jira ไม่สำเร็จ', { description: errorMessage(err) });
        } finally {
            setBusy(null);
        }
    };

    const sendPanel = async () => {
        if (!saved?.panelChannelId) return toast.error('ยังส่งแผงไม่ได้', { description: 'เลือกห้องแผงแล้วกด "บันทึก" ก่อน' });
        if (dirty) return toast.error('ยังส่งแผงไม่ได้', { description: 'มีการแก้ไขที่ยังไม่บันทึก — กด "บันทึก" ก่อน' });
        const ok = await confirm({
            title: `ส่งแผงเข้า ${channelLabel(allChannels, saved.panelChannelId)}?`,
            description: 'ถ้าเคยส่งแผงไว้ในห้องนี้แล้ว บอทจะแก้ข้อความเดิมแทนการส่งใหม่',
            confirmText: 'ส่งแผง',
        });
        if (!ok) return;
        setBusy('panel');
        try {
            const result = await jiraApi.sendPanel(guildId);
            toast.success(result.message ?? 'ส่งแผงแล้ว');
            await queryClient.invalidateQueries({ queryKey: jiraSettingsQuery(guildId).queryKey });
        } catch (err) {
            toast.error('ส่งแผงไม่สำเร็จ', { description: errorMessage(err) });
        } finally {
            setBusy(null);
        }
    };

    if (settings.isLoading) return <LoadingState />;
    if (settings.error) return <ErrorState error={settings.error} title="โหลดการตั้งค่า Jira ไม่สำเร็จ" />;
    const current = settings.data!;
    if (!draft) return <LoadingState />;

    // ประเภทจาก Jira (หลังกดทดสอบ) + ประเภทที่เลือกไว้แล้วแต่ไม่พบในโปรเจกต์
    const selected = new Map(draft.options.issueTypes.map((type) => [type.id, type]));
    const issueTypeRows: IssueTypeRow[] = [
        ...(connection?.issueTypes ?? []).map((type) => ({ ...type, missing: false })),
        ...draft.options.issueTypes
            .filter((type) => !connection?.issueTypes.some((t) => t.id === type.id))
            .map((type) => ({ id: type.id, name: type.name, description: '', missing: Boolean(connection) })),
    ];
    const toggleType = (row: IssueTypeRow, on: boolean) =>
        patchOptions({
            issueTypes: on
                ? [...draft.options.issueTypes, { id: row.id, name: row.name, emoji: '' }].slice(0, JIRA_LIMITS.maxIssueTypes)
                : draft.options.issueTypes.filter((type) => type.id !== row.id),
        });
    const setEmoji = (id: string, emoji: string) =>
        patchOptions({ issueTypes: draft.options.issueTypes.map((type) => (type.id === id ? { ...type, emoji } : type)) });

    return (
        <>
            <PageHeader
                help="jira"
                title="เปิด Jira card"
                description="ให้สมาชิกเปิด card ใน Jira จาก Discord แบบระบบ ticket — กดปุ่มในห้องแผง บอทสร้างห้องส่วนตัวให้เลือกประเภทและกรอกหัวข้อ/รายละเอียด แล้วส่งลิงก์ card กลับมา"
            />

            <Card>
                <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-muted-foreground">
                        {current.enabled ? (
                            <Badge className="mr-1.5 bg-emerald-500/15 text-emerald-300">เปิดอยู่</Badge>
                        ) : (
                            <Badge variant="secondary" className="mr-1.5">
                                ปิดอยู่
                            </Badge>
                        )}
                        {current.panelMessageId ? `แผงอยู่ที่ ${channelLabel(allChannels, current.panelChannelId) ?? '-'}` : 'ยังไม่ได้ส่งแผงเข้าห้อง'}
                    </div>
                    <div className="flex items-center gap-3">
                        {dirty && <Badge className="bg-amber-500/15 text-amber-300">มีการแก้ไขที่ยังไม่บันทึก</Badge>}
                        <Label className="flex items-center gap-2" title="เปิด/ปิดการเปิด card จาก Discord (บันทึกทันที)">
                            เปิดใช้งาน
                            <Switch checked={current.enabled} disabled={busy === 'toggle'} onCheckedChange={(checked) => void toggle(checked)} />
                        </Label>
                    </div>
                </CardHeader>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>1. เชื่อมต่อ Jira</CardTitle>
                        <CardDescription>
                            รองรับ Jira Cloud — card จะถูกสร้างในนามบัญชีนี้ สร้าง API token ได้ที่{' '}
                            <a
                                className="text-sky-400 hover:underline"
                                href="https://id.atlassian.com/manage-profile/security/api-tokens"
                                target="_blank"
                                rel="noreferrer"
                            >
                                Atlassian account <ExternalLink className="inline size-3" />
                            </a>
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                        <Field label="Jira site URL" htmlFor="jira-site" hint="เช่น https://your-team.atlassian.net">
                            <Input
                                id="jira-site"
                                placeholder="https://your-team.atlassian.net"
                                value={draft.siteUrl}
                                onChange={(e) => patch({ siteUrl: e.target.value })}
                            />
                        </Field>
                        <Field label="อีเมลบัญชี Atlassian" htmlFor="jira-email">
                            <Input id="jira-email" type="email" autoComplete="off" value={draft.email} onChange={(e) => patch({ email: e.target.value })} />
                        </Field>
                        <Field
                            label="API token"
                            htmlFor="jira-token"
                            hint={current.apiTokenSet ? 'ตั้งไว้แล้ว (เข้ารหัสเก็บไว้) — เว้นว่างถ้าไม่ต้องการเปลี่ยน' : 'ยังไม่ได้ตั้ง'}
                        >
                            <Input
                                id="jira-token"
                                type="password"
                                autoComplete="new-password"
                                placeholder={current.apiTokenSet ? '••••••••••••' : 'วาง API token'}
                                value={draft.apiToken}
                                onChange={(e) => patch({ apiToken: e.target.value })}
                            />
                        </Field>
                        <Field label="Project key" htmlFor="jira-project" hint="ตัวอักษรหน้าเลข card เช่น PROJ ใน PROJ-123">
                            <Input
                                id="jira-project"
                                className="uppercase"
                                placeholder="PROJ"
                                value={draft.projectKey}
                                onChange={(e) => patch({ projectKey: e.target.value.toUpperCase() })}
                            />
                        </Field>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button variant="outline" onClick={() => void testConnection()} disabled={busy === 'test'}>
                                {busy === 'test' ? <Loader2 className="animate-spin" /> : <PlugZap />} ทดสอบการเชื่อมต่อ
                            </Button>
                            {connection && (
                                <span className="text-sm text-emerald-400">
                                    ✓ {connection.accountName} · {connection.projectName}
                                </span>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>2. ประเภท card และรูปแนบ</CardTitle>
                        <CardDescription>
                            กด “ทดสอบการเชื่อมต่อ” เพื่อดึงประเภทจากโปรเจกต์ แล้วติ๊กประเภทที่ให้สมาชิกเลือกได้ (สูงสุด {JIRA_LIMITS.maxIssueTypes}) — ใส่ emoji
                            หน้าชื่อได้
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-2">
                        {!issueTypeRows.length && <p className="text-sm text-muted-foreground">ยังไม่มีประเภท — ทดสอบการเชื่อมต่อก่อน</p>}
                        {issueTypeRows.map((row) => {
                            const chosen = selected.get(row.id);
                            return (
                                <div key={row.id} className="flex items-center gap-3 rounded-md border p-2">
                                    <Checkbox
                                        id={`jira-type-${row.id}`}
                                        checked={Boolean(chosen)}
                                        disabled={!chosen && draft.options.issueTypes.length >= JIRA_LIMITS.maxIssueTypes}
                                        onCheckedChange={(checked) => toggleType(row, checked === true)}
                                    />
                                    <label htmlFor={`jira-type-${row.id}`} className="min-w-0 flex-1 text-sm">
                                        <span className="font-medium">{row.name}</span>
                                        {row.missing && <span className="ml-1 text-xs text-destructive">(ไม่พบในโปรเจกต์แล้ว)</span>}
                                        {row.description && <span className="block truncate text-xs text-muted-foreground">{row.description}</span>}
                                    </label>
                                    {chosen && (
                                        <Input
                                            aria-label={`emoji ของ ${row.name}`}
                                            className="w-20 text-center"
                                            placeholder="emoji"
                                            maxLength={8}
                                            value={chosen.emoji}
                                            onChange={(e) => setEmoji(row.id, e.target.value)}
                                        />
                                    )}
                                </div>
                            );
                        })}
                        <Field
                            label="แนบรูปได้สูงสุดต่อ card"
                            htmlFor="jira-max-images"
                            className="mt-2 border-t pt-4"
                            hint={`0 = ไม่มีช่องแนบรูปใน pop-up · สูงสุด ${JIRA_LIMITS.maxImages} รูป รูปละไม่เกิน ${JIRA_LIMITS.maxImageBytes / 1024 / 1024}MB — รูปถูกแนบเข้า card ใน Jira (บัญชีที่เชื่อมต่อต้องมีสิทธิ์ Create attachments)`}
                        >
                            <Input
                                id="jira-max-images"
                                type="number"
                                inputMode="numeric"
                                className="w-28"
                                min={0}
                                max={JIRA_LIMITS.maxImages}
                                value={draft.options.maxImages}
                                onChange={(e) => {
                                    const value = Math.trunc(Number(e.target.value));
                                    patchOptions({ maxImages: Number.isFinite(value) ? Math.min(JIRA_LIMITS.maxImages, Math.max(0, value)) : 0 });
                                }}
                            />
                        </Field>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>3. ห้องและสิทธิ์</CardTitle>
                        <CardDescription>
                            ห้องส่วนตัวที่สร้างขึ้นเห็นเฉพาะคนเปิด บอท และยศทีมงานที่เลือก (ผู้มีสิทธิ์ Administrator เห็นทุกห้องเสมอ)
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                        <Field label="ห้องแผง" hint="ห้องที่มีปุ่ม “เปิด Jira card” ให้สมาชิกกด">
                            <ChannelSelect channels={textChannels} value={draft.panelChannelId} onChange={(panelChannelId) => patch({ panelChannelId })} />
                        </Field>
                        <Field label="ห้อง log" hint="แจ้งว่าใครเปิด card อะไร พร้อมลิงก์ (ไม่แท็กใคร)">
                            <ChannelSelect
                                channels={textChannels}
                                value={draft.logChannelId}
                                onChange={(logChannelId) => patch({ logChannelId })}
                                noneLabel="— ไม่ส่ง log —"
                            />
                        </Field>
                        <Field label="หมวดหมู่ของห้องส่วนตัว" hint="ห้องส่วนตัวจะถูกสร้างในหมวดหมู่นี้">
                            <ChannelSelect
                                channels={categories}
                                showCategories
                                value={draft.categoryId}
                                onChange={(categoryId) => patch({ categoryId })}
                                noneLabel="— ไม่อยู่ในหมวดหมู่ —"
                            />
                        </Field>
                        <Field
                            label="ปิดห้องอัตโนมัติหลังสร้าง card (วินาที)"
                            htmlFor="jira-auto-close"
                            hint={`0 = ไม่ปิดเอง (คนเปิด/ทีมงานกดปุ่มปิดห้องเอง) · สูงสุด ${JIRA_LIMITS.maxAutoCloseSeconds} วินาที — ในห้องจะขึ้นเวลานับถอยหลังให้เห็น`}
                        >
                            <Input
                                id="jira-auto-close"
                                type="number"
                                inputMode="numeric"
                                className="w-28"
                                min={0}
                                max={JIRA_LIMITS.maxAutoCloseSeconds}
                                value={draft.options.autoCloseSeconds}
                                onChange={(e) => {
                                    const value = Math.trunc(Number(e.target.value));
                                    patchOptions({
                                        autoCloseSeconds: Number.isFinite(value) ? Math.min(JIRA_LIMITS.maxAutoCloseSeconds, Math.max(0, value)) : 0,
                                    });
                                }}
                            />
                        </Field>
                        <IdChoices
                            title="ยศทีมงานที่เห็นทุกห้อง"
                            options={roles}
                            values={draft.options.staffRoleIds}
                            onChange={(staffRoleIds) => patchOptions({ staffRoleIds: staffRoleIds.slice(0, JIRA_LIMITS.maxStaffRoles) })}
                            emptyHint="ไม่เลือก = เห็นเฉพาะคนเปิด (และผู้มีสิทธิ์ Administrator) — ทีมงานยังปิดห้องได้ถ้ามีสิทธิ์ Manage Channels"
                        />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>4. ข้อความแผง</CardTitle>
                        <CardDescription>ข้อความพร้อมปุ่มที่บอทส่งเข้าห้องแผง — แก้แล้วบันทึก จากนั้นกด “ส่ง/อัปเดตแผง”</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                        <Field label="หัวข้อ">
                            <Input
                                maxLength={JIRA_LIMITS.maxPanelTitleLength}
                                value={draft.options.panel.title}
                                onChange={(e) => patchOptions({ panel: { ...draft.options.panel, title: e.target.value } })}
                            />
                        </Field>
                        <Field label="รายละเอียด">
                            <Textarea
                                rows={3}
                                maxLength={JIRA_LIMITS.maxPanelDescriptionLength}
                                value={draft.options.panel.description}
                                onChange={(e) => patchOptions({ panel: { ...draft.options.panel, description: e.target.value } })}
                            />
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="ข้อความบนปุ่ม">
                                <Input
                                    maxLength={JIRA_LIMITS.maxButtonLabelLength}
                                    value={draft.options.panel.buttonLabel}
                                    onChange={(e) => patchOptions({ panel: { ...draft.options.panel, buttonLabel: e.target.value } })}
                                />
                            </Field>
                            <Field label="สีแถบ embed">
                                <ColorField
                                    value={draft.options.panel.color}
                                    onChange={(color) => patchOptions({ panel: { ...draft.options.panel, color } })}
                                />
                            </Field>
                        </div>
                        <DiscordMessage>
                            <div className="max-w-md rounded border-l-4 bg-[#2b2d31] p-3" style={{ borderColor: draft.options.panel.color }}>
                                {draft.options.panel.title && <div className="font-semibold text-white">{draft.options.panel.title}</div>}
                                {draft.options.panel.description && <div className="mt-1 text-sm whitespace-pre-wrap">{draft.options.panel.description}</div>}
                            </div>
                            <span className="mt-2 inline-flex items-center gap-1.5 rounded bg-[#5865f2] px-4 py-1.5 text-sm font-medium text-white">
                                🎫 {draft.options.panel.buttonLabel || 'เปิด Jira card'}
                            </span>
                        </DiscordMessage>
                    </CardContent>
                </Card>
            </div>

            <div className="flex flex-wrap gap-2">
                <Button onClick={() => void save()} disabled={!dirty || busy === 'save'} title="Ctrl/⌘ + S">
                    {busy === 'save' ? <Loader2 className="animate-spin" /> : <Save />} บันทึก
                </Button>
                <Button variant="outline" disabled={!dirty} onClick={() => saved && setDraft(structuredClone(saved))}>
                    <RotateCcw /> ยกเลิกการแก้ไข
                </Button>
                <Button variant="secondary" onClick={() => void sendPanel()} disabled={busy === 'panel'}>
                    {busy === 'panel' ? <Loader2 className="animate-spin" /> : <Send />} {current.panelMessageId ? 'อัปเดตแผง' : 'ส่งแผงเข้าห้อง'}
                </Button>
            </div>

            <JiraTicketsCard guildId={guildId} />
        </>
    );
}
