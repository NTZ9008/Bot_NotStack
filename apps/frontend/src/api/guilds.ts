import type { GuildChannel, GuildListResponse, GuildRole, GuildSummary, MemberSearchResult, VoiceChannelOption } from '@notstack/shared';
import { queryOptions } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';

// ==========================================
// 🏰 เซิร์ฟเวอร์ — รายการที่ผู้ใช้เข้าถึงได้ + ห้อง / ยศ / สมาชิกของแต่ละเซิร์ฟเวอร์
// ทุก query ของเซิร์ฟเวอร์ขึ้นต้น key ด้วย ['guild', guildId] (ล้าง cache ของเซิร์ฟเวอร์เดียวได้ง่าย)
// ==========================================
export const guildKey = (guildId: string) => ['guild', guildId] as const;

export const guildsQuery = queryOptions({
    queryKey: ['guilds'],
    queryFn: () => api<GuildListResponse>('/guilds'),
    staleTime: 60 * 1000,
    // กลับมาหน้านี้หลังเชิญบอทในแท็บอื่น → รายการเซิร์ฟเวอร์อัปเดตเอง
    refetchOnWindowFocus: true,
});

export const guildQuery = (guildId: string) =>
    queryOptions({
        queryKey: [...guildKey(guildId), 'detail'],
        queryFn: () => api<GuildSummary>(`/guilds/${guildId}`),
        staleTime: 60 * 1000,
    });

// บอทยังไม่ออนไลน์ (503) → ยังใช้หน้าเว็บต่อได้ แค่รายชื่อห้อง/ยศว่าง
async function orEmpty<T>(promise: Promise<T[]>): Promise<T[]> {
    try {
        return await promise;
    } catch (err) {
        if (err instanceof ApiError && err.status === 503) return [];
        throw err;
    }
}

export const guildChannelsQuery = (guildId: string) =>
    queryOptions({
        queryKey: [...guildKey(guildId), 'channels'],
        queryFn: () => orEmpty(api<GuildChannel[]>(`/guilds/${guildId}/channels`)),
        staleTime: 60 * 1000,
    });

export const guildRolesQuery = (guildId: string) =>
    queryOptions({
        queryKey: [...guildKey(guildId), 'roles'],
        queryFn: () => orEmpty(api<GuildRole[]>(`/guilds/${guildId}/roles`)),
        staleTime: 60 * 1000,
    });

export const voiceChannelsQuery = (guildId: string) =>
    queryOptions({
        queryKey: [...guildKey(guildId), 'voice-channels'],
        queryFn: () => orEmpty(api<VoiceChannelOption[]>(`/guilds/${guildId}/voice-channels`)),
        staleTime: 60 * 1000,
    });

export const searchMembersQuery = (guildId: string, q: string) =>
    queryOptions({
        queryKey: [...guildKey(guildId), 'members', q],
        queryFn: ({ signal }) => api<MemberSearchResult[]>(`/guilds/${guildId}/members/search`, { query: { q }, signal }),
        enabled: q.trim().length > 0,
        staleTime: 30 * 1000,
    });
