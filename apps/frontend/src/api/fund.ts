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
    UpdateFundPaymentInput,
    UpdateFundTopicInput,
} from '@notstack/shared';
import { queryOptions } from '@tanstack/react-query';
import { api, apiUrl, refreshSession } from '@/lib/api';
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
    updatePayment: (guildId: string, id: number, paymentId: number, input: UpdateFundPaymentInput) =>
        api<SuccessResponse>(f(guildId, `/${id}/payments/${paymentId}`), { body: input }),
    batchPayment: (guildId: string, id: number, input: BatchFundPaymentInput) => api<SuccessResponse>(f(guildId, `/${id}/payments/batch`), { body: input }),
    removePayment: (guildId: string, id: number, paymentId: number) => api<SuccessResponse>(f(guildId, `/${id}/payments/${paymentId}/delete`), { method: 'POST' }),
    sendReport: (guildId: string, id: number, input: SendFundReportInput) => api<SuccessResponse>(f(guildId, `/${id}/report`), { body: input }),
    exportCsv: async (guildId: string, id: number) => {
        const url = apiUrl(f(guildId, `/${id}/export`));
        let res = await fetch(url, { credentials: 'include' });
        if (res.status === 401) {
            const refreshed = await refreshSession();
            if (refreshed) {
                res = await fetch(url, { credentials: 'include' });
            }
        }
        if (!res.ok) {
            const errData = (await res.json().catch(() => ({}))) as { message?: string };
            throw new Error(errData.message || 'ดาวน์โหลด CSV ไม่สำเร็จ');
        }
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        const disposition = res.headers.get('Content-Disposition');
        let filename = `fund-${id}.csv`;
        if (disposition) {
            const starMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
            const standardMatch = disposition.match(/filename="?([^";]+)"?/i);
            if (starMatch && starMatch[1]) {
                try {
                    filename = decodeURIComponent(starMatch[1]);
                } catch {
                    filename = starMatch[1];
                }
            } else if (standardMatch && standardMatch[1]) {
                try {
                    filename = decodeURIComponent(standardMatch[1]);
                } catch {
                    filename = standardMatch[1];
                }
            }
        }
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(blobUrl);
    },
};
