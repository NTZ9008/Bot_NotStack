import { useEffect, useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import type { CreateReactionRolePanelInput } from '@notstack/shared';
import { toast } from 'sonner';
import { guildChannelsQuery, guildRolesQuery } from '@/api/guilds';
import { reactionRolePanelsQuery, useReactionRoleMutations } from '@/api/reaction-roles';
import { channelLabel } from '@/components/channel-select';
import { useConfirm } from '@/components/confirm-dialog';
import { AlertTriangle, Plus, RefreshCw, Sparkles } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { PluginRouteGuard } from '@/components/plugin-gate';
import { PrBotBodySkeleton } from '@/components/skeleton/guild-pages';
import { EmptyState, ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PanelEditor } from '@/features/reaction-roles/panel-editor';
import { useGuildId } from '@/hooks/use-guild';
import { errorMessage } from '@/lib/api';
import { tr, useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/reaction-roles')({
    loader: ({ context, params }) => {
        if (!context.guild.installedPlugins?.includes('reaction-roles')) return;
        return Promise.all([
            context.queryClient.ensureQueryData(reactionRolePanelsQuery(params.guildId)),
            context.queryClient.ensureQueryData(guildChannelsQuery(params.guildId)).catch(() => undefined),
            context.queryClient.ensureQueryData(guildRolesQuery(params.guildId)).catch(() => undefined),
        ]);
    },
    component: ReactionRolesPage,
});

function ReactionRolesPage() {
    return (
        <PluginRouteGuard
            pluginId="reaction-roles"
            help="reactionRoles"
            title={tr('common.reactionRoles')}
            description={tr('common.letMembersPickRolesWithButtonsOrMenus')}
        >
            {() => <ReactionRolesPageContent />}
        </PluginRouteGuard>
    );
}

function ReactionRolesPageContent() {
    const t = useT();
    const guildId = useGuildId();
    const confirm = useConfirm();

    const { data, isLoading, isFetching, error, refetch } = useQuery(reactionRolePanelsQuery(guildId));
    const { data: channels = [] } = useQuery(guildChannelsQuery(guildId));
    const { data: roles = [] } = useQuery(guildRolesQuery(guildId));
    const { createPanel, updatePanel, removePanel, publishPanel } = useReactionRoleMutations(guildId);

    const panels = useMemo(() => data?.panels ?? [], [data?.panels]);
    const warnings = useMemo(() => data?.warnings ?? [], [data?.warnings]);

    const [selectedPanelId, setSelectedPanelId] = useState<number | 'new' | null>(null);

    useEffect(() => {
        if (selectedPanelId === 'new') return;
        if (panels.length === 0) {
            if (selectedPanelId !== null) setSelectedPanelId(null);
            return;
        }
        if (selectedPanelId === null || !panels.some((p) => p.id === selectedPanelId)) {
            setSelectedPanelId(panels[0]!.id);
        }
    }, [panels, selectedPanelId]);

    const activePanel = useMemo(
        () => (typeof selectedPanelId === 'number' ? (panels.find((p) => p.id === selectedPanelId) ?? null) : null),
        [panels, selectedPanelId],
    );

    const handleSave = async (payload: CreateReactionRolePanelInput) => {
        try {
            if (activePanel) {
                const updated = await updatePanel.mutateAsync({ id: activePanel.id, body: payload });
                setSelectedPanelId(updated.id);
                toast.success(t('reactionRoles.panelSavedToast'));
            } else {
                const created = await createPanel.mutateAsync(payload);
                setSelectedPanelId(created.id);
                toast.success(t('reactionRoles.panelCreatedToast'));
            }
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };

    const handlePublish = async (payload: CreateReactionRolePanelInput, shouldSaveFirst: boolean) => {
        try {
            let targetId = activePanel?.id;
            if (!targetId) {
                const created = await createPanel.mutateAsync(payload);
                targetId = created.id;
                setSelectedPanelId(created.id);
            } else if (shouldSaveFirst) {
                const updated = await updatePanel.mutateAsync({ id: targetId, body: payload });
                targetId = updated.id;
            }

            const result = await publishPanel.mutateAsync(targetId);
            toast.success(
                result.edited
                    ? t('reactionRoles.panelSyncedToast', { 0: result.channelName })
                    : t('reactionRoles.panelPublishedToast', { 0: result.channelName }),
            );
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };

    const handleDelete = async () => {
        if (!activePanel) return;
        const ok = await confirm({
            title: t('reactionRoles.confirmDeleteTitle', { 0: activePanel.title }),
            description: t('reactionRoles.confirmDeleteDesc'),
            confirmText: t('common.delete'),
            destructive: true,
        });
        if (!ok) return;

        try {
            await removePanel.mutateAsync(activePanel.id);
            setSelectedPanelId(null);
            toast.success(t('reactionRoles.panelDeletedToast'));
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };

    return (
        <>
            <PageHeader
                help="reactionRoles"
                title={t('common.reactionRoles')}
                description={t('common.letMembersPickRolesWithButtonsOrMenus')}
                actions={
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={t('common.refresh')}
                            disabled={isFetching}
                            onClick={() => void refetch()}
                        >
                            <RefreshCw className={isFetching ? 'size-4 animate-spin' : 'size-4'} />
                        </Button>
                        <Button type="button" onClick={() => setSelectedPanelId('new')} className="gap-1.5">
                            <Plus className="size-4" />
                            {t('reactionRoles.newPanel')}
                        </Button>
                    </div>
                }
            />

            {isLoading ? (
                <PrBotBodySkeleton />
            ) : error ? (
                <ErrorState error={error} />
            ) : (
                <div className="space-y-5">
                    {warnings.length > 0 && (
                        <div className="space-y-1 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
                            <div className="flex items-center gap-1.5 font-semibold">
                                <AlertTriangle className="size-4 shrink-0" />
                                {t('reactionRoles.permissionWarningsTitle')}
                            </div>
                            <ul className="list-inside list-disc space-y-0.5">
                                {warnings.map((w, idx) => (
                                    <li key={idx}>{w}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {panels.length === 0 && selectedPanelId !== 'new' ? (
                        <EmptyState className="py-12">
                            <Sparkles className="mx-auto mb-3 size-8 text-violet-500" />
                            <p className="text-sm font-medium text-foreground">{t('reactionRoles.emptyTitle')}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{t('reactionRoles.emptyDesc')}</p>
                            <Button type="button" size="sm" onClick={() => setSelectedPanelId('new')} className="mt-4 gap-1.5">
                                <Plus className="size-4" />
                                {t('reactionRoles.newPanel')}
                            </Button>
                        </EmptyState>
                    ) : (
                        <>
                            {panels.length > 0 && (
                                <div className="flex flex-wrap items-center gap-2">
                                    {panels.map((p) => {
                                        const active = selectedPanelId === p.id;
                                        return (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => setSelectedPanelId(p.id)}
                                                className={cn(
                                                    'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors',
                                                    active
                                                        ? 'border-primary bg-primary/10 font-medium text-foreground'
                                                        : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                                                )}
                                            >
                                                <span
                                                    className="size-2.5 rounded-full"
                                                    style={{ backgroundColor: p.embedColor }}
                                                />
                                                <span className="max-w-44 truncate">{p.title}</span>
                                                <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                                                    {p.items.length}
                                                </Badge>
                                                <span className="hidden text-[11px] text-muted-foreground sm:inline">
                                                    {channelLabel(channels, p.channelId) ?? p.channelId}
                                                </span>
                                            </button>
                                        );
                                    })}
                                    {selectedPanelId === 'new' && (
                                        <Badge variant="outline" className="border-primary/40 px-2.5 py-1 text-xs text-primary">
                                            + {t('reactionRoles.newPanel')}
                                        </Badge>
                                    )}
                                </div>
                            )}

                            <PanelEditor
                                key={selectedPanelId === 'new' ? 'new' : (activePanel?.id ?? 'none')}
                                panel={selectedPanelId === 'new' ? null : activePanel}
                                channels={channels}
                                roles={roles}
                                saving={createPanel.isPending || updatePanel.isPending}
                                publishing={publishPanel.isPending}
                                deleting={removePanel.isPending}
                                onSave={handleSave}
                                onPublish={handlePublish}
                                onDelete={activePanel ? handleDelete : undefined}
                            />
                        </>
                    )}
                </div>
            )}
        </>
    );
}
