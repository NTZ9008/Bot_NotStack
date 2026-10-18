import type {
    JiraConnectionResult,
    JiraSaveResponse,
    JiraSettings,
    JiraTicket,
    JiraTicketPage,
    JiraTicketStatus,
    SuccessResponse,
    TestJiraInput,
    UpdateJiraInput,
} from '@notstack/shared';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { guildKey } from './guilds';

// ==========================================
// 🎫 JIRA — ตั้งค่าการเปิด Jira card จาก Discord + รายการห้อง/card
// ==========================================
const g = (guildId: string, path: string) => `/guilds/${guildId}/jira${path}`;

export const jiraSettingsQuery = (guildId: string) =>
    queryOptions({ queryKey: [...guildKey(guildId), 'jira', 'settings'], queryFn: () => api<JiraSettings>(g(guildId, '/settings')) });

export const jiraTicketsQuery = (guildId: string, page: number, status: 'all' | JiraTicketStatus) =>
    queryOptions({
        queryKey: [...guildKey(guildId), 'jira', 'tickets', status, page],
        queryFn: ({ signal }) => api<JiraTicketPage>(g(guildId, '/tickets'), { query: { page, status }, signal }),
        placeholderData: keepPreviousData,
        // สมาชิกเปิดห้องใหม่จาก Discord ได้ตลอด
        refetchInterval: 30_000,
    });

export const jiraApi = {
    save: (guildId: string, input: UpdateJiraInput) => api<JiraSaveResponse>(g(guildId, '/settings'), { body: input }),
    test: (guildId: string, input: TestJiraInput) => api<JiraConnectionResult>(g(guildId, '/test'), { body: input }),
    sendPanel: (guildId: string) => api<SuccessResponse>(g(guildId, '/panel'), { method: 'POST' }),
    closeTicket: (guildId: string, ticketId: number) => api<JiraTicket>(g(guildId, `/tickets/${ticketId}/close`), { method: 'POST' }),
};
