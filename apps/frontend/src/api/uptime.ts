import type {
    CreateUptimeTargetInput,
    SuccessResponse,
    UpdateUptimeTargetInput,
    UptimeOverviewResponse,
    UptimeTargetDetailResponse,
    UptimeTargetSummary,
} from '@notstack/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { guildKey } from './guilds';

// ==========================================
// 💓 UPTIME MONITOR — API Client & React Query hooks
// ==========================================

export const uptimeOverviewQuery = (guildId: string) =>
    queryOptions({
        queryKey: [...guildKey(guildId), 'uptime'],
        queryFn: () => api<UptimeOverviewResponse>(`/guilds/${guildId}/uptime`),
        staleTime: 15 * 1000,
        refetchInterval: 30 * 1000,
    });

export const uptimeDetailQuery = (guildId: string, targetId: number) =>
    queryOptions({
        queryKey: [...guildKey(guildId), 'uptime', 'detail', targetId],
        queryFn: () => api<UptimeTargetDetailResponse>(`/guilds/${guildId}/uptime/${targetId}`),
        staleTime: 15 * 1000,
        refetchInterval: 30 * 1000,
    });

export function useUptimeMutations(guildId: string) {
    const queryClient = useQueryClient();

    const invalidate = () => {
        void queryClient.invalidateQueries({ queryKey: [...guildKey(guildId), 'uptime'] });
    };

    const create = useMutation({
        mutationFn: (body: CreateUptimeTargetInput) => api<UptimeTargetSummary>(`/guilds/${guildId}/uptime`, { method: 'POST', body }),
        onSuccess: invalidate,
    });

    const update = useMutation({
        mutationFn: ({ id, body }: { id: number; body: UpdateUptimeTargetInput }) =>
            api<UptimeTargetSummary>(`/guilds/${guildId}/uptime/${id}`, { method: 'PATCH', body }),
        onSuccess: invalidate,
    });

    const remove = useMutation({
        mutationFn: (id: number) => api<SuccessResponse>(`/guilds/${guildId}/uptime/${id}/delete`, { method: 'POST' }),
        onSuccess: invalidate,
    });

    const checkNow = useMutation({
        mutationFn: (id: number) => api<UptimeTargetSummary>(`/guilds/${guildId}/uptime/${id}/check`, { method: 'POST' }),
        onSuccess: invalidate,
    });

    return { create, update, remove, checkNow };
}
