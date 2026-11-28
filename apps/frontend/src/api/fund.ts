import { tr } from '../lib/i18n';
import {
    DEFAULT_FUND_REPORT_THEME,
    type AddFundMembersInput,
    type BatchFundPaymentInput,
    type CreateFundPaymentInput,
    type CreateFundTopicInput,
    type FundReportThemeId,
    type FundTopicDetail,
    type FundTopicSummary,
    type SendFundReportInput,
    type SuccessResponse,
    type UpdateFundMemberInput,
    type UpdateFundPaymentInput,
    type UpdateFundTopicInput,
} from '@notstack/shared';
import { queryOptions } from '@tanstack/react-query';
import { api, apiUrl, refreshSession } from '@/lib/api';
import { guildKey } from './guilds';

// ==========================================
// เก็บเงินตามเป้า — /api/guilds/:guildId/funds/*
// ==========================================
const f = (guildId: string, path = '') => `/guilds/${guildId}/funds${path}`;

async function fetchAuthed(url: string): Promise<Response> {
    let res = await fetch(url, { credentials: 'include' });
    if (res.status === 401) {
        const refreshed = await refreshSession();
        if (refreshed) {
            res = await fetch(url, { credentials: 'include' });
        }
    }
    return res;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
}

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
    removePayment: (guildId: string, id: number, paymentId: number) =>
        api<SuccessResponse>(f(guildId, `/${id}/payments/${paymentId}/delete`), { method: 'POST' }),
    sendReport: (guildId: string, id: number, input: SendFundReportInput) => api<SuccessResponse>(f(guildId, `/${id}/report`), { body: input }),
    reportImageUrl: (guildId: string, id: number, version = '', theme: FundReportThemeId = DEFAULT_FUND_REPORT_THEME) => {
        const params = new URLSearchParams();
        params.set('theme', theme);
        if (version) params.set('v', version);
        return apiUrl(`${f(guildId, `/${id}/report-image`)}?${params.toString()}`);
    },
    downloadReportPng: async (guildId: string, id: number, topicName: string, theme: FundReportThemeId = DEFAULT_FUND_REPORT_THEME) => {
        const url = fundApi.reportImageUrl(guildId, id, String(Date.now()), theme);
        const res = await fetchAuthed(url);
        if (!res.ok) {
            const errData = (await res.json().catch(() => ({}))) as { message?: string };
            throw new Error(errData.message || tr('funds.failedToDownloadReportPng'));
        }
        const safeName = (topicName || 'fund').replace(/[/\\?%*:|"<>]/g, '_').slice(0, 50);
        triggerBlobDownload(await res.blob(), `fund-report-${safeName}-${theme}.png`);
    },
    exportCsv: async (guildId: string, id: number) => {
        const url = apiUrl(f(guildId, `/${id}/export`));
        const res = await fetchAuthed(url);
        if (!res.ok) {
            const errData = (await res.json().catch(() => ({}))) as { message?: string };
            throw new Error(errData.message || tr('common.failedToDownloadCsv'));
        }
        const blob = await res.blob();
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
        triggerBlobDownload(blob, filename);
    },
};
