import type {
    CreateReactionRoleItemInput,
    CreateReactionRolePanelInput,
    PublishReactionRolePanelResponse,
    ReactionRoleItemDto,
    ReactionRolePanelDto,
    ReactionRolePanelsResponse,
    SuccessResponse,
    UpdateReactionRoleItemInput,
    UpdateReactionRolePanelInput,
} from '@notstack/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { guildKey } from './guilds';

// ==========================================
// 🎭 REACTION ROLES — API Client & React Query hooks
// ==========================================

export const reactionRolePanelsQuery = (guildId: string) =>
    queryOptions({
        queryKey: [...guildKey(guildId), 'reaction-roles'],
        queryFn: () => api<ReactionRolePanelsResponse>(`/guilds/${guildId}/reaction-roles`),
        staleTime: 15 * 1000,
    });

export function useReactionRoleMutations(guildId: string) {
    const queryClient = useQueryClient();

    const invalidate = () => {
        void queryClient.invalidateQueries({ queryKey: [...guildKey(guildId), 'reaction-roles'] });
    };

    const createPanel = useMutation({
        mutationFn: (body: CreateReactionRolePanelInput) =>
            api<ReactionRolePanelDto>(`/guilds/${guildId}/reaction-roles`, { method: 'POST', body }),
        onSuccess: invalidate,
    });

    const updatePanel = useMutation({
        mutationFn: ({ id, body }: { id: number; body: UpdateReactionRolePanelInput }) =>
            api<ReactionRolePanelDto>(`/guilds/${guildId}/reaction-roles/${id}`, { method: 'PATCH', body }),
        onSuccess: invalidate,
    });

    const removePanel = useMutation({
        mutationFn: (id: number) => api<SuccessResponse>(`/guilds/${guildId}/reaction-roles/${id}/delete`, { method: 'POST' }),
        onSuccess: invalidate,
    });

    const publishPanel = useMutation({
        mutationFn: (id: number) =>
            api<PublishReactionRolePanelResponse>(`/guilds/${guildId}/reaction-roles/${id}/publish`, { method: 'POST' }),
        onSuccess: invalidate,
    });

    const addItem = useMutation({
        mutationFn: ({ panelId, body }: { panelId: number; body: CreateReactionRoleItemInput }) =>
            api<ReactionRoleItemDto>(`/guilds/${guildId}/reaction-roles/${panelId}/items`, { method: 'POST', body }),
        onSuccess: invalidate,
    });

    const updateItem = useMutation({
        mutationFn: ({ panelId, itemId, body }: { panelId: number; itemId: number; body: UpdateReactionRoleItemInput }) =>
            api<ReactionRoleItemDto>(`/guilds/${guildId}/reaction-roles/${panelId}/items/${itemId}`, { method: 'PATCH', body }),
        onSuccess: invalidate,
    });

    const removeItem = useMutation({
        mutationFn: ({ panelId, itemId }: { panelId: number; itemId: number }) =>
            api<SuccessResponse>(`/guilds/${guildId}/reaction-roles/${panelId}/items/${itemId}/delete`, { method: 'POST' }),
        onSuccess: invalidate,
    });

    return {
        createPanel,
        updatePanel,
        removePanel,
        publishPanel,
        addItem,
        updateItem,
        removeItem,
    };
}
