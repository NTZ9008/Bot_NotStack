import type { GuildPluginsResponse, GuildSummary, PluginId } from '@notstack/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { guildKey, guildQuery } from './guilds';

// ==========================================
// 🧩 PLUGINS — รายการปลั๊กอินของเซิร์ฟเวอร์ + ติดตั้ง / ถอนการติดตั้ง
// ==========================================
export const guildPluginsQuery = (guildId: string) =>
    queryOptions({
        queryKey: [...guildKey(guildId), 'plugins'],
        queryFn: () => api<GuildPluginsResponse>(`/guilds/${guildId}/plugins`),
        staleTime: 60 * 1000,
    });

export const installPlugin = (guildId: string, pluginId: PluginId) =>
    api<GuildPluginsResponse>(`/guilds/${guildId}/plugins/${pluginId}/install`, { method: 'POST' });

export const uninstallPlugin = (guildId: string, pluginId: PluginId) =>
    api<GuildPluginsResponse>(`/guilds/${guildId}/plugins/${pluginId}/uninstall`, { method: 'POST' });

export function usePluginMutations(guildId: string) {
    const queryClient = useQueryClient();

    const syncCaches = (data: GuildPluginsResponse) => {
        queryClient.setQueryData(guildPluginsQuery(guildId).queryKey, data);
        queryClient.setQueryData<GuildSummary>(guildQuery(guildId).queryKey, (prev) =>
            prev ? { ...prev, installedPlugins: data.installedIds } : prev,
        );
        void queryClient.invalidateQueries({ queryKey: ['guilds', guildId, 'custom-summary'] });
    };

    const install = useMutation({
        mutationFn: (pluginId: PluginId) => installPlugin(guildId, pluginId),
        onSuccess: syncCaches,
    });

    const uninstall = useMutation({
        mutationFn: (pluginId: PluginId) => uninstallPlugin(guildId, pluginId),
        onSuccess: syncCaches,
    });

    return { install, uninstall };
}
