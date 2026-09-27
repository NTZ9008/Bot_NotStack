import type {
    SuccessResponse,
    WelcomeAsset,
    WelcomeAssetResponse,
    WelcomeCard,
    WelcomeCardInput,
    WelcomeCardResponse,
    WelcomeDesign,
    WelcomeMeta,
    WelcomePreviewResponse,
} from '@notstack/shared';
import { queryOptions } from '@tanstack/react-query';
import { api, apiUrl } from '@/lib/api';
import { guildKey } from './guilds';

const w = (guildId: string, path: string) => `/guilds/${guildId}/welcome${path}`;

export const welcomeMetaQuery = (guildId: string) =>
    queryOptions({ queryKey: [...guildKey(guildId), 'welcome', 'meta'], queryFn: () => api<WelcomeMeta>(w(guildId, '/meta')) });
export const welcomeCardsQuery = (guildId: string) =>
    queryOptions({ queryKey: [...guildKey(guildId), 'welcome', 'cards'], queryFn: () => api<WelcomeCard[]>(w(guildId, '/cards')) });
export const welcomeAssetsQuery = (guildId: string) =>
    queryOptions({ queryKey: [...guildKey(guildId), 'welcome', 'assets'], queryFn: () => api<WelcomeAsset[]>(w(guildId, '/assets')) });

export const assetImageUrl = (guildId: string, id: number) => apiUrl(w(guildId, `/assets/${id}/image`));

export interface PreviewInput {
    design: WelcomeDesign;
    backgroundId: number | null;
    userId: string | null;
}

export const welcomeApi = {
    createCard: (guildId: string, input: WelcomeCardInput & { duplicateOf?: number }) => api<WelcomeCardResponse>(w(guildId, '/cards'), { body: input }),
    updateCard: (guildId: string, id: number, input: WelcomeCardInput) => api<WelcomeCardResponse>(w(guildId, `/cards/${id}/update`), { body: input }),
    deleteCard: (guildId: string, id: number) => api<SuccessResponse>(w(guildId, `/cards/${id}/delete`), { method: 'POST' }),
    preview: (guildId: string, input: PreviewInput, signal?: AbortSignal) => api<WelcomePreviewResponse>(w(guildId, '/preview'), { body: input, signal }),
    test: (guildId: string, input: { channelId: string; content: string; design: WelcomeDesign; backgroundId: number | null; userId: string | null }) =>
        api<SuccessResponse>(w(guildId, '/test'), { body: input }),
    uploadAsset: (guildId: string, file: File) =>
        api<WelcomeAssetResponse>(w(guildId, '/assets'), { method: 'POST', raw: file, contentType: file.type, query: { name: file.name } }),
    renameAsset: (guildId: string, id: number, name: string) => api<WelcomeAssetResponse>(w(guildId, `/assets/${id}/rename`), { body: { name } }),
    deleteAsset: (guildId: string, id: number) => api<SuccessResponse>(w(guildId, `/assets/${id}/delete`), { method: 'POST' }),
};
