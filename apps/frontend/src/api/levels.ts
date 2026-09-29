import type { SuccessResponse, XpHistoryPage, XpMemberMutation, XpSettingsResponse } from '@notstack/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { guildKey } from './guilds';
const path = (guild: string, suffix: string) => `/guilds/${guild}/levels/${suffix}`;
export const xpKey = (guild: string) => [...guildKey(guild), 'levels'];
export const xpSettingsQuery = (guild: string) =>
    queryOptions({ queryKey: [...xpKey(guild), 'settings'], queryFn: ({ signal }) => api<XpSettingsResponse>(path(guild, 'settings'), { signal }) });
export const xpHistoryQuery = (guild: string, userId?: string, cursor?: number) =>
    queryOptions({
        queryKey: [...xpKey(guild), 'history', userId, cursor],
        queryFn: ({ signal }) => api<XpHistoryPage>(path(guild, 'history'), { query: { userId, cursor }, signal }),
    });
export const xpApi = {
    save: (guild: string, input: XpSettingsResponse) => api<XpSettingsResponse>(path(guild, 'settings'), { body: input }),
    member: (guild: string, input: XpMemberMutation) => api<SuccessResponse>(path(guild, 'members'), { body: input }),
    reset: (guild: string, reason: string, confirmation: string) => api<SuccessResponse>(path(guild, 'reset'), { body: { reason, confirmation } }),
};
