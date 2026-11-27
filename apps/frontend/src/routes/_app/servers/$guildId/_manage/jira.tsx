import { tr } from '../../../../../lib/i18n';
import { Spinner } from '@/components/ui/spinner';
import type { JiraConnectionResult, JiraOptions, JiraSettings } from '@notstack/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Send } from '@/components/icons';
import { FeatureSwitch, SaveBar } from '@/components/page-controls';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { guildChannelsQuery, guildRolesQuery } from '@/api/guilds';
import { jiraApi, jiraSettingsQuery } from '@/api/jira';
import { channelLabel } from '@/components/channel-select';
import { useConfirm } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { PluginRouteGuard } from '@/components/plugin-gate';
import { JiraPageSkeleton } from '@/components/skeleton/editor-pages';
import { ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { JiraConnectionCard } from '@/features/jira/connection-card';
import { toJiraDraft, type JiraDraft } from '@/features/jira/draft';
import { JiraIssueTypesCard } from '@/features/jira/issue-types-card';
import { JiraPanelCard } from '@/features/jira/panel-card';
import { JiraRoomsCard } from '@/features/jira/rooms-card';
import { JiraTicketsCard } from '@/features/jira/tickets-card';
import { useGuildId } from '@/hooks/use-guild';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes';
import { errorMessage } from '@/lib/api';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/jira')({
    loader: ({ context, params }) => {
        if (!context.guild.installedPlugins?.includes('jira-card')) return;
        return Promise.all([
            context.queryClient.ensureQueryData(jiraSettingsQuery(params.guildId)),
            context.queryClient.ensureQueryData(guildChannelsQuery(params.guildId)).catch(() => undefined),
            context.queryClient.ensureQueryData(guildRolesQuery(params.guildId)).catch(() => undefined),
        ]);
    },
    component: JiraPage,
});

// ==========================================
// 🎫 JIRA CARD — สมาชิกกดปุ่มในห้องแผง → ห้องส่วนตัว → เลือกประเภท + กรอกหัวข้อ/รายละเอียด → card ใน Jira
// แก้ค่าแล้วกด "บันทึก" (Ctrl/⌘ + S) · สวิตช์เปิด/ปิดบันทึกทันที · ส่งแผงใช้ค่าที่บันทึกแล้ว
// ==========================================
function JiraPage() {
    return (
        <PluginRouteGuard
            pluginId="jira-card"
            help="jira"
            title={tr('common.jiraCards')}
            description={tr('jira.letMembersOpenJiraCardsFrom')}
        >
            {() => <JiraPageContent />}
        </PluginRouteGuard>
    );
}

function JiraPageContent() {
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
        title: tr('common.discardUnsavedChanges'),
        description: tr('jira.jiraSettingsHaveUnsavedChanges'),
        confirmText: tr('common.discardChanges'),
        destructive: true,
    });

    const save = async () => {
        if (!draft || !dirty || busy) return;
        setBusy('save');
        try {
            const result = await jiraApi.save(guildId, draft);
            load(result.settings);
            if (result.warning) toast.warning(tr('jira.savedButThereAreStillProblems'), { description: result.warning });
            else toast.success(tr('common.settingsSaved'));
        } catch (err) {
            toast.error(tr('common.saveFailed'), { description: errorMessage(err) });
        } finally {
            setBusy(null);
        }
    };

    // สวิตช์บันทึกทันทีด้วยค่าที่บันทึกไว้ (การแก้ไขที่ค้างอยู่ไม่ถูกบันทึกไปด้วย)
    const toggle = async (enabled: boolean) => {
        setBusy('toggle');
        try {
            const result = await jiraApi.save(guildId, { enabled });
            queryClient.setQueryData(jiraSettingsQuery(guildId).queryKey, result.settings);
            if (result.warning) toast.warning(enabled ? tr('jira.enabledButThereAreStillProblems') : tr('jira.disabled'), { description: result.warning });
            else toast.success(enabled ? tr('jira.jiraCardsEnabled') : tr('jira.jiraCardsDisabled'));
        } catch (err) {
            toast.error(tr('common.failedToChangeStatus'), { description: errorMessage(err) });
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
            toast.success(tr('jira.jiraConnected'), {
                description: tr('jira.projectTypes', { 0: result.accountName, 1: result.projectName, 2: result.issueTypes.length }),
            });
        } catch (err) {
            setConnection(null);
            toast.error(tr('jira.failedToConnectToJira'), { description: errorMessage(err) });
        } finally {
            setBusy(null);
        }
    };

    const sendPanel = async () => {
        if (!saved?.panelChannelId) return toast.error(tr('jira.cantSendThePanelYet'), { description: tr('jira.pickAPanelChannelAndPress') });
        if (dirty) return toast.error(tr('jira.cantSendThePanelYet'), { description: tr('jira.youHaveUnsavedChangesPressSave') });
        const ok = await confirm({
            title: tr('jira.sendThePanelTo', { 0: channelLabel(allChannels, saved.panelChannelId) }),
            description: tr('jira.ifAPanelWasAlreadySent'),
            confirmText: tr('jira.sendPanel'),
        });
        if (!ok) return;
        setBusy('panel');
        try {
            const result = await jiraApi.sendPanel(guildId);
            toast.success(result.message ?? tr('jira.panelSent'));
            await queryClient.invalidateQueries({ queryKey: jiraSettingsQuery(guildId).queryKey });
        } catch (err) {
            toast.error(tr('jira.failedToSendPanel'), { description: errorMessage(err) });
        } finally {
            setBusy(null);
        }
    };

    if (settings.isLoading) return <JiraPageSkeleton />;
    if (settings.error) return <ErrorState error={settings.error} title={tr('jira.failedToLoadJiraSettings')} />;
    const current = settings.data!;
    if (!draft) return <JiraPageSkeleton />;

    return (
        <>
            <PageHeader
                help="jira"
                title={tr('common.jiraCards')}
                description={tr('jira.letMembersOpenJiraCardsFrom')}
                actions={
                    <FeatureSwitch
                        checked={current.enabled}
                        disabled={busy === 'toggle'}
                        onCheckedChange={(checked) => void toggle(checked)}
                        title={tr('jira.turnOpeningCardsFromDiscordOn')}
                    />
                }
            />

            <Card>
                <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-muted-foreground">
                        {current.enabled ? (
                            <Badge variant="success" className="mr-1.5">
                                {tr('common.on')}
                            </Badge>
                        ) : (
                            <Badge variant="secondary" className="mr-1.5">
                                {tr('common.off')}
                            </Badge>
                        )}
                        {current.panelMessageId
                            ? tr('jira.panelIsIn', { 0: channelLabel(allChannels, current.panelChannelId) ?? '-' })
                            : tr('jira.panelNotSentToAChannel')}
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

            <JiraTicketsCard guildId={guildId} />

            <SaveBar dirty={dirty} saving={busy === 'save'} onSave={() => void save()} onReset={() => saved && setDraft(structuredClone(saved))}>
                <Button variant="secondary" onClick={() => void sendPanel()} disabled={busy === 'panel'}>
                    {busy === 'panel' ? <Spinner /> : <Send />} {current.panelMessageId ? tr('jira.updatePanel') : tr('jira.sendPanelToChannel')}
                </Button>
            </SaveBar>
        </>
    );
}
