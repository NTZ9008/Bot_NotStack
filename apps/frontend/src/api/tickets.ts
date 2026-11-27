import type {
    PublishTicketPanelResponse,
    TicketConfigDto,
    TicketDetailDto,
    TicketItemDto,
    TicketListResponse,
    TicketSaveConfigResponse,
    TicketStatus,
    UpdateTicketConfigInput,
} from '@notstack/shared';
import { formatTicketNumber } from '@notstack/shared';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { api, type ApiBlobResponse } from '@/lib/api';
import { guildKey } from './guilds';

const g = (guildId: string, path: string) => `/guilds/${guildId}/tickets${path}`;

export const ticketConfigQuery = (guildId: string) =>
    queryOptions({
        queryKey: [...guildKey(guildId), 'tickets', 'config'],
        queryFn: () => api<TicketConfigDto>(g(guildId, '/config')),
    });

export const ticketsListQuery = (guildId: string, page: number, status: 'ALL' | TicketStatus, q = '') =>
    queryOptions({
        queryKey: [...guildKey(guildId), 'tickets', 'list', status, page, q],
        queryFn: ({ signal }) =>
            api<TicketListResponse>(g(guildId, ''), {
                query: { page, status, q: q.trim() || undefined },
                signal,
            }),
        placeholderData: keepPreviousData,
        refetchInterval: 30_000,
    });

export const ticketDetailQuery = (guildId: string, ticketId: number | null) =>
    queryOptions({
        queryKey: [...guildKey(guildId), 'tickets', 'detail', ticketId],
        queryFn: ({ signal }) => api<TicketDetailDto>(g(guildId, `/${ticketId}`), { signal }),
        enabled: ticketId !== null,
    });

export const ticketsApi = {
    saveConfig: (guildId: string, body: UpdateTicketConfigInput) =>
        api<TicketSaveConfigResponse>(g(guildId, '/config'), { method: 'POST', body }),
    publishPanel: (guildId: string) =>
        api<PublishTicketPanelResponse>(g(guildId, '/panel'), { method: 'POST' }),
    closeTicket: (guildId: string, ticketId: number) =>
        api<TicketItemDto>(g(guildId, `/${ticketId}/close`), { method: 'POST' }),
    downloadTranscript: async (guildId: string, ticketId: number, ticketNumber: number, format: 'md' | 'html') => {
        const { blob, filename } = await api<ApiBlobResponse>(g(guildId, `/${ticketId}/transcript`), {
            query: { format },
            responseType: 'blob',
        });
        const downloadName = filename ?? `ticket-${formatTicketNumber(ticketNumber)}.${format}`;
        const url = URL.createObjectURL(blob);
        try {
            const link = document.createElement('a');
            link.href = url;
            link.download = downloadName;
            document.body.appendChild(link);
            link.click();
            link.remove();
        } finally {
            URL.revokeObjectURL(url);
        }
    },
};
