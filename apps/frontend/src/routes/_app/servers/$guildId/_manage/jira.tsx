import type { JiraConnectionResult, JiraOptions, JiraSettings } from '@notstack/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Loader2, RotateCcw, Save, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { guildChannelsQuery, guildRolesQuery } from '@/api/guilds';
import { jiraApi, jiraSettingsQuery } from '@/api/jira';
import { channelLabel } from '@/components/channel-select';
import { useConfirm } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { JiraPageSkeleton } from '@/components/skeleton/editor-pages';
import { ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { JiraConnectionCard } from '@/features/jira/connection-card';
import { toJiraDraft, type JiraDraft } from '@/features/jira/draft';
import { JiraIssueTypesCard } from '@/features/jira/issue-types-card';
import { JiraPanelCard } from '@/features/jira/panel-card';
import { JiraRoomsCard } from '@/features/jira/rooms-card';
import { JiraTicketsCard } from '@/features/jira/tickets-card';
import { useGuildId } from '@/hooks/use-guild';
import { useSaveShortcut, useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes';
import { errorMessage } from '@/lib/api';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/jira')({
    loader: ({ context, params }) => context.queryClient.ensureQueryData(jiraSettingsQuery(params.guildId)),
    component: JiraPage,
});

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

    const [saved, setSaved] = useState<JiraDraft | null>(null);
    const [draft, setDraft] = useState<JiraDraft | null>(null);
    const [busy, setBusy] = useState<'save' | 'toggle' | 'test' | 'panel' | null>(null);
    const [connection, setConnection] = useState<JiraConnectionResult | null>(null);
    const dirty = Boolean(draft && saved && JSON.stringify(draft) !== JSON.stringify(saved));

    const load = (next: JiraSettings) => {
        queryClient.setQueryData(jiraSettingsQuery(guildId).queryKey, next);
        setSaved(toJiraDraft(next));
        setDraft(toJiraDraft(next));
    };

    useEffect(() => {
        if (settings.data && !saved) load(settings.data);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settings.data]);

    const patch = (next: Partial<JiraDraft>) => setDraft((current) => (current ? { ...current, ...next } : current));
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

    if (settings.isLoading) return <JiraPageSkeleton />;
    if (settings.error) return <ErrorState error={settings.error} title="โหลดการตั้งค่า Jira ไม่สำเร็จ" />;
    const current = settings.data!;
    if (!draft) return <JiraPageSkeleton />;

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
                <JiraConnectionCard
                    draft={draft}
                    patch={patch}
                    apiTokenSet={current.apiTokenSet}
                    connection={connection}
                    testing={busy === 'test'}
                    onTest={() => void testConnection()}
                />
                <JiraIssueTypesCard draft={draft} patchOptions={patchOptions} connection={connection} />
                <JiraRoomsCard draft={draft} patch={patch} patchOptions={patchOptions} textChannels={textChannels} categories={categories} roles={roles} />
                <JiraPanelCard draft={draft} patchOptions={patchOptions} />
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
