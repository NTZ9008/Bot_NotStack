import type {
    SuccessResponse,
    WeatherMeta,
    WeatherOptions,
    WeatherPlace,
    WeatherPreviewResponse,
    WeatherSaveResponse,
    WeatherSettings,
    WeatherSettingsInput,
} from '@notstack/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { guildKey } from './guilds';

const wx = (guildId: string, path: string) => `/guilds/${guildId}/weather${path}`;

export const weatherMetaQuery = (guildId: string) =>
    queryOptions({ queryKey: [...guildKey(guildId), 'weather', 'meta'], queryFn: () => api<WeatherMeta>(wx(guildId, '/meta')), staleTime: Infinity });
export const weatherSettingsQuery = (guildId: string) =>
    queryOptions({ queryKey: [...guildKey(guildId), 'weather', 'settings'], queryFn: () => api<WeatherSettings>(wx(guildId, '/settings')) });

export interface WeatherDraft {
    channelId: string;
    content: string;
    options: WeatherOptions;
}

export const weatherApi = {
    save: (guildId: string, input: WeatherSettingsInput) => api<WeatherSaveResponse>(wx(guildId, '/settings'), { body: input }),
    preview: (guildId: string, input: { content: string; options: WeatherOptions }, signal?: AbortSignal) =>
        api<WeatherPreviewResponse>(wx(guildId, '/preview'), { body: input, signal }),
    test: (guildId: string, input: WeatherDraft) => api<SuccessResponse>(wx(guildId, '/test'), { body: input }),
    searchLocations: (guildId: string, q: string) => api<WeatherPlace[]>(wx(guildId, '/locations'), { query: { q } }),
};
