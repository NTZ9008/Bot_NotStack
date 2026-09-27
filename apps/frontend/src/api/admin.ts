import type {
    ActivityMeta,
    ActivityPage,
    ActivityStats,
    AdminUser,
    AuditLogPage,
    CreateUserInput,
    PublicUser,
    RevokeSessionsResponse,
    SuccessResponse,
    UpdateUserInput,
} from '@notstack/shared';
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { guildKey } from './guilds';

// ==========================================
// 👥 Users
// ==========================================
export const usersQuery = queryOptions({
    queryKey: ['admin', 'users'],
    queryFn: () => api<AdminUser[]>('/admin/users'),
});

export const usersApi = {
    create: (input: CreateUserInput) => api<PublicUser>('/admin/users', { body: input }),
    update: (id: number, input: UpdateUserInput) => api<PublicUser>(`/admin/users/${id}/update`, { body: input }),
    revokeSessions: (id: number) => api<RevokeSessionsResponse>(`/admin/users/${id}/revoke-sessions`, { method: 'POST' }),
    remove: (id: number) => api<SuccessResponse>(`/admin/users/${id}/delete`, { method: 'POST' }),
};

// ==========================================
// 📜 Audit logs (แบ่งหน้าด้วย cursor) — ไม่ระบุ guildId = ทั้งระบบ (ADMIN), ระบุ = เฉพาะเซิร์ฟเวอร์นั้น
// ==========================================
export interface AuditFilters {
    action?: string;
    success?: string;
    q?: string;
}

const auditPath = (guildId?: string) => (guildId ? `/guilds/${guildId}/audit-logs` : '/admin/audit-logs');

export const auditLogsQuery = (filters: AuditFilters, guildId?: string) =>
    infiniteQueryOptions({
        queryKey: [...(guildId ? guildKey(guildId) : ['admin']), 'audit-logs', filters],
        queryFn: ({ pageParam }) => api<AuditLogPage>(auditPath(guildId), { query: { ...filters, limit: 50, cursor: pageParam } }),
        initialPageParam: undefined as number | undefined,
        getNextPageParam: (last) => last.nextCursor ?? undefined,
    });

export const auditActionsQuery = (guildId?: string) =>
    queryOptions({
        queryKey: [...(guildId ? guildKey(guildId) : ['admin']), 'audit-logs', 'actions'],
        queryFn: () => api<string[]>(`${auditPath(guildId)}/actions`),
    });

// ==========================================
// 🛰️ Activity (เหตุการณ์ในเซิร์ฟเวอร์ Discord — แยกตามเซิร์ฟเวอร์)
// ==========================================
export interface ActivityFilters {
    eventKey?: string;
    hours: number;
    q?: string;
    includeBots: boolean;
}

export const activityQuery = (guildId: string, filters: ActivityFilters) =>
    infiniteQueryOptions({
        queryKey: [...guildKey(guildId), 'activity', filters],
        queryFn: ({ pageParam }) =>
            api<ActivityPage>(`/guilds/${guildId}/activity`, {
                query: {
                    eventKey: filters.eventKey,
                    from: new Date(Date.now() - filters.hours * 3600000).toISOString(),
                    q: filters.q,
                    includeBots: filters.includeBots ? 'true' : undefined,
                    limit: 50,
                    cursor: pageParam,
                },
            }),
        initialPageParam: undefined as number | undefined,
        getNextPageParam: (last) => last.nextCursor ?? undefined,
    });

export const activityMetaQuery = (guildId: string) =>
    queryOptions({
        queryKey: [...guildKey(guildId), 'activity', 'meta'],
        queryFn: () => api<ActivityMeta>(`/guilds/${guildId}/activity/meta`),
    });

export interface StatsParams {
    from?: string;
    to?: string;
    interval?: 'hour' | 'day';
    includeBots: boolean;
}

export const activityStatsQuery = (guildId: string, params: StatsParams) =>
    queryOptions({
        queryKey: [...guildKey(guildId), 'activity', 'stats', params],
        queryFn: () =>
            api<ActivityStats>(`/guilds/${guildId}/activity/stats`, {
                query: { ...params, includeBots: params.includeBots ? 'true' : undefined, tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
            }),
    });
