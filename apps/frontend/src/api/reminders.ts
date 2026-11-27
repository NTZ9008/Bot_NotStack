import type {
    CreateReminderInput,
    RemindersListResponse,
    ScheduledReminderItem,
    SuccessResponse,
    UpdateReminderInput,
} from '@notstack/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { guildKey } from './guilds';

// ==========================================
// ⏰ SCHEDULED REMINDERS — API Client & React Query hooks
// ==========================================

export const remindersListQuery = (guildId: string) =>
    queryOptions({
        queryKey: [...guildKey(guildId), 'reminders'],
        queryFn: () => api<RemindersListResponse>(`/guilds/${guildId}/reminders`),
        staleTime: 15 * 1000,
        refetchInterval: 30 * 1000,
    });

export function useReminderMutations(guildId: string) {
    const queryClient = useQueryClient();

    const invalidate = () => {
        void queryClient.invalidateQueries({ queryKey: [...guildKey(guildId), 'reminders'] });
    };

    const create = useMutation({
        mutationFn: (body: CreateReminderInput) => api<ScheduledReminderItem>(`/guilds/${guildId}/reminders`, { method: 'POST', body }),
        onSuccess: invalidate,
    });

    const update = useMutation({
        mutationFn: ({ id, body }: { id: number; body: UpdateReminderInput }) =>
            api<ScheduledReminderItem>(`/guilds/${guildId}/reminders/${id}`, { method: 'PATCH', body }),
        onSuccess: invalidate,
    });

    const remove = useMutation({
        mutationFn: (id: number) => api<SuccessResponse>(`/guilds/${guildId}/reminders/${id}/delete`, { method: 'POST' }),
        onSuccess: invalidate,
    });

    const testSend = useMutation({
        mutationFn: (id: number) => api<ScheduledReminderItem>(`/guilds/${guildId}/reminders/${id}/test`, { method: 'POST' }),
        onSuccess: invalidate,
    });

    return { create, update, remove, testSend };
}
