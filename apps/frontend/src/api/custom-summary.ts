import type {
    CustomSummaryChannelOption,
    CustomSummaryPdfRequestInput,
    CustomSummaryRequestInput,
    CustomSummaryResponse,
} from '@notstack/shared';
import { queryOptions } from '@tanstack/react-query';
import { api, type ApiBlobResponse } from '../lib/api';

export const customSummaryChannelsQuery = (guildId: string) =>
    queryOptions({
        queryKey: ['guilds', guildId, 'custom-summary', 'channels'],
        queryFn: () => api<CustomSummaryChannelOption[]>(`/guilds/${guildId}/custom-summary/channels`),
        staleTime: 60_000,
    });

export function fetchCustomSummary(guildId: string, body: CustomSummaryRequestInput, signal?: AbortSignal) {
    return api<CustomSummaryResponse>(`/guilds/${guildId}/custom-summary`, {
        method: 'POST',
        body,
        signal,
    });
}

export function exportCustomSummaryPdf(guildId: string, body: CustomSummaryPdfRequestInput) {
    return api<ApiBlobResponse>(`/guilds/${guildId}/custom-summary/pdf`, {
        method: 'POST',
        body,
        responseType: 'blob',
    });
}
