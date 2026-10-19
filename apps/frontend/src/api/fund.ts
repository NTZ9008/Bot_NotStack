import type {
    AddFundMembersInput,
    BatchFundPaymentInput,
    CreateFundPaymentInput,
    CreateFundTopicInput,
    FundTopicDetail,
    FundTopicSummary,
    SendFundReportInput,
    SuccessResponse,
    UpdateFundMemberInput,
    UpdateFundTopicInput,
} from '@notstack/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { guildKey } from './guilds';

// ==========================================
// 💰 เก็บเงินตามเป้า — /api/guilds/:guildId/funds/*
// ==========================================
const f = (guildId: string, path = '') => `/guilds/${guildId}/funds${path}`;

export const fundsKey = (guildId: string) => [...guildKey(guildId), 'funds'] as const;

export const fundsQuery = (guildId: string) => queryOptions({ queryKey: fundsKey(guildId), queryFn: () => api<FundTopicSummary[]>(f(guildId)) });

export const fundQuery = (guildId: string, topicId: number | null) =>
    queryOptions({
        queryKey: [...fundsKey(guildId), topicId],
        queryFn: () => api<FundTopicDetail>(f(guildId, `/${topicId}`)),
        enabled: topicId !== null,
    });

export const fundApi = {
    create: (guildId: string, input: CreateFundTopicInput) => api<FundTopicDetail>(f(guildId), { body: input }),
    update: (guildId: string, id: number, input: UpdateFundTopicInput) => api<FundTopicDetail>(f(guildId, `/${id}`), { body: input }),
    remove: (guildId: string, id: number) => api<SuccessResponse>(f(guildId, `/${id}/delete`), { method: 'POST' }),
    addMembers: (guildId: string, id: number, input: AddFundMembersInput) => api<SuccessResponse>(f(guildId, `/${id}/members`), { body: input }),
    updateMember: (guildId: string, id: number, memberId: number, input: UpdateFundMemberInput) =>
        api<SuccessResponse>(f(guildId, `/${id}/members/${memberId}`), { body: input }),
    removeMember: (guildId: string, id: number, memberId: number) => api<SuccessResponse>(f(guildId, `/${id}/members/${memberId}/delete`), { method: 'POST' }),
    addPayment: (guildId: string, id: number, input: CreateFundPaymentInput) => api<SuccessResponse>(f(guildId, `/${id}/payments`), { body: input }),
    batchPayment: (guildId: string, id: number, input: BatchFundPaymentInput) => api<SuccessResponse>(f(guildId, `/${id}/payments/batch`), { body: input }),
    removePayment: (guildId: string, id: number, paymentId: number) => api<SuccessResponse>(f(guildId, `/${id}/payments/${paymentId}/delete`), { method: 'POST' }),
    sendReport: (guildId: string, id: number, input: SendFundReportInput) => api<SuccessResponse>(f(guildId, `/${id}/report`), { body: input }),
    exportCsv: async (guildId: string, id: number) => {
        const res = await fetch(`/api/guilds/${guildId}/funds/${id}/export`, { credentials: 'include' });
        if (!res.ok) throw new Error('ดาวน์โหลด CSV ไม่สำเร็จ');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const disposition = res.headers.get('Content-Disposition');
        let filename = `fund-${id}.csv`;
        if (disposition && disposition.includes('filename=')) {
            const match = disposition.match(/filename="?([^";]+)"?/);
            if (match && match[1]) filename = decodeURIComponent(match[1]);
        }
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    },
};
