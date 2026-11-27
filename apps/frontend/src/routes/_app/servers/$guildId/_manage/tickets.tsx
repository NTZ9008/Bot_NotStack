import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { guildChannelsQuery, guildRolesQuery } from '@/api/guilds';
import { ticketConfigQuery } from '@/api/tickets';
import { PageHeader } from '@/components/page-header';
import { PluginRouteGuard } from '@/components/plugin-gate';
import { JiraPageSkeleton } from '@/components/skeleton/editor-pages';
import { ErrorState } from '@/components/states';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TicketHistoryTab } from '@/features/tickets/history-tab';
import { TicketSettingsTab } from '@/features/tickets/settings-tab';
import { useGuildId } from '@/hooks/use-guild';
import { tr, useT } from '@/lib/i18n';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/tickets')({
    loader: ({ context, params }) => {
        if (!context.guild.installedPlugins?.includes('ticket-system')) return;
        return Promise.all([
            context.queryClient.ensureQueryData(ticketConfigQuery(params.guildId)),
            context.queryClient.ensureQueryData(guildChannelsQuery(params.guildId)).catch(() => undefined),
            context.queryClient.ensureQueryData(guildRolesQuery(params.guildId)).catch(() => undefined),
        ]);
    },
    component: TicketsPage,
});

function TicketsPage() {
    return (
        <PluginRouteGuard
            pluginId="ticket-system"
            help="tickets"
            title={tr('common.ticketSystem')}
            description={tr('tickets.pageDescription')}
        >
            {() => <TicketsPageContent />}
        </PluginRouteGuard>
    );
}

function TicketsPageContent() {
    const t = useT();
    const guildId = useGuildId();
    const [tab, setTab] = useState<'settings' | 'history'>('settings');

    const configQuery = useQuery(ticketConfigQuery(guildId));
    const { data: allChannels = [] } = useQuery(guildChannelsQuery(guildId));
    const { data: roles = [] } = useQuery(guildRolesQuery(guildId));

    if (configQuery.isLoading) return <JiraPageSkeleton />;
    if (configQuery.error) return <ErrorState error={configQuery.error} title={t('tickets.loadConfigFailed')} />;

    return (
        <>
            <PageHeader help="tickets" title={t('common.ticketSystem')} description={t('tickets.pageDescription')} />

            <Tabs value={tab} onValueChange={(value) => setTab(value as 'settings' | 'history')} className="space-y-4">
                <TabsList>
                    <TabsTrigger value="settings">{t('tickets.tabSettings')}</TabsTrigger>
                    <TabsTrigger value="history">{t('tickets.tabHistory')}</TabsTrigger>
                </TabsList>

                <TabsContent value="settings">
                    <TicketSettingsTab guildId={guildId} config={configQuery.data!} allChannels={allChannels} roles={roles} />
                </TabsContent>

                <TabsContent value="history">
                    <TicketHistoryTab guildId={guildId} />
                </TabsContent>
            </Tabs>
        </>
    );
}
