import type { RelationBoard, RelationHistoryPage, RelationLinkDetail } from '@notstack/shared';
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { guildKey } from '@/api/guilds';
import { api } from '@/lib/api';

export interface RelationFilters {
    days: number;
    includeBots: boolean;
}

// ==========================================
// 🕵️ กระดานความสัมพันธ์ — ข้อมูลกระดาน / รายละเอียดเส้น / ประวัติของคนหนึ่งคน
// ==========================================
export const relationBoardQuery = (guildId: string, filters: RelationFilters) =>
    queryOptions({
        queryKey: [...guildKey(guildId), 'relations', 'board', filters],
        queryFn: () =>
            api<RelationBoard>(`/guilds/${guildId}/relations`, { query: { days: filters.days, includeBots: filters.includeBots ? 'true' : undefined } }),
        staleTime: 60 * 1000,
    });

export const relationLinkQuery = (guildId: string, a: string, b: string, days: number) =>
    queryOptions({
        queryKey: [...guildKey(guildId), 'relations', 'link', a, b, days],
        queryFn: () => api<RelationLinkDetail>(`/guilds/${guildId}/relations/links/${a}/${b}`, { query: { days } }),
        staleTime: 60 * 1000,
    });

export const relationHistoryQuery = (guildId: string, userId: string) =>
    infiniteQueryOptions({
        queryKey: [...guildKey(guildId), 'relations', 'history', userId],
        queryFn: ({ pageParam }) => api<RelationHistoryPage>(`/guilds/${guildId}/relations/people/${userId}/history`, { query: { cursor: pageParam } }),
        initialPageParam: undefined as number | undefined,
        getNextPageParam: (last) => last.nextCursor ?? undefined,
        staleTime: 30 * 1000,
    });
