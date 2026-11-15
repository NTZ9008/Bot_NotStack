import { api } from '@/lib/api';
import { queryOptions } from '@tanstack/react-query';

export interface AiModelUsage {
    name: string;
    category: string;
    rpm: { current: number; limit: number };
    tpm: { current: number; limit: number };
    rpd: { current: number; limit: number };
    cooldownUntil: number | null;
    status: 'ready' | 'cooldown';
}

export interface GuildAiSettings {
    aiEnabled: boolean;
    hasKey: boolean;
    maskedKey: string | null;
    isUsingFallbackHomeKey: boolean;
    hasFallbackHomeKey: boolean;
    dailyLimit: number;
    todayTotalRequests: number;
    models: AiModelUsage[];
}

export const aiSettingsQuery = (guildId: string) => queryOptions({
    queryKey: ['guild', guildId, 'ai'],
    queryFn: () => api<GuildAiSettings>(`/guilds/${guildId}/ai`),
    refetchInterval: 20_000,
});

export const updateAiSettings = (guildId: string, body: { aiEnabled?: boolean; apiKey?: string | null; dailyLimit?: number }) =>
    api<GuildAiSettings>(`/guilds/${guildId}/ai`, { method: 'PATCH', body });

export const testAiKey = (guildId: string, apiKey?: string) =>
    api<{ ok: boolean; message: string }>(`/guilds/${guildId}/ai/test-key`, { method: 'POST', body: apiKey ? { apiKey } : {} });
