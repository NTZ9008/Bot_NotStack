import type {
    LevelUpSettings,
    LevelUpSettingsResponse,
    MyRankCardResponse,
    RankCardMeta,
    RankCardTheme,
    RankMemberStyle,
    RankPreviewKind,
    RankPreviewResponse,
    RewardSyncResponse,
} from '@notstack/shared';
import { queryOptions } from '@tanstack/react-query';
import { api, apiUrl } from '@/lib/api';
import { guildKey } from './guilds';

const r = (guildId: string, path: string) => `/guilds/${guildId}/rank-card${path}`;
export const rankCardKey = (guildId: string) => [...guildKey(guildId), 'rank-card'] as const;

export const rankMetaQuery = (guildId: string) =>
    queryOptions({ queryKey: [...rankCardKey(guildId), 'meta'], queryFn: ({ signal }) => api<RankCardMeta>(r(guildId, '/meta'), { signal }), staleTime: Infinity });
export const rankThemeQuery = (guildId: string) =>
    queryOptions({ queryKey: [...rankCardKey(guildId), 'theme'], queryFn: ({ signal }) => api<RankCardTheme>(r(guildId, '/theme'), { signal }) });
export const myRankCardQuery = (guildId: string) =>
    queryOptions({ queryKey: [...rankCardKey(guildId), 'me'], queryFn: ({ signal }) => api<MyRankCardResponse>(r(guildId, '/me'), { signal }) });
export const levelUpQuery = (guildId: string) =>
    queryOptions({ queryKey: [...rankCardKey(guildId), 'level-up'], queryFn: ({ signal }) => api<LevelUpSettingsResponse>(r(guildId, '/level-up'), { signal }) });

// รูปพื้นหลังที่แอดมินเปิดให้สมาชิกเลือก (สมาชิกทั่วไปเข้าคลังรูปของแอดมินไม่ได้)
export const memberBackgroundUrl = (guildId: string, id: number) => apiUrl(r(guildId, `/backgrounds/${id}/image`));

export const rankCardApi = {
    saveTheme: (guildId: string, theme: RankCardTheme) => api<RankCardTheme>(r(guildId, '/theme'), { body: { theme } }),
    preview: (guildId: string, input: { kind: RankPreviewKind; theme: RankCardTheme; levelUp?: LevelUpSettings }, signal?: AbortSignal) =>
        api<RankPreviewResponse>(r(guildId, '/preview'), { body: input, signal }),
    saveMine: (guildId: string, style: RankMemberStyle) => api<MyRankCardResponse>(r(guildId, '/me'), { body: { style } }),
    resetMine: (guildId: string) => api<MyRankCardResponse>(r(guildId, '/me/reset'), { method: 'POST' }),
    previewMine: (guildId: string, input: { kind: RankPreviewKind; style: RankMemberStyle }, signal?: AbortSignal) =>
        api<RankPreviewResponse>(r(guildId, '/me/preview'), { body: input, signal }),
    saveLevelUp: (guildId: string, settings: LevelUpSettings) => api<LevelUpSettingsResponse>(r(guildId, '/level-up'), { body: { settings } }),
    syncRewards: (guildId: string) => api<RewardSyncResponse>(r(guildId, '/level-up/sync'), { method: 'POST' }),
};
