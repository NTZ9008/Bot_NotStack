import type { SuccessResponse, VoiceListenStatus } from '@notstack/shared';
import { queryOptions } from '@tanstack/react-query';
import { guildKey } from '@/api/guilds';
import { api } from '@/lib/api';

// ==========================================
// 🎧 ฟังห้องเสียง — สถานะดึงซ้ำทุก 2 วินาที (ไฟ "กำลังพูด" ของแต่ละคน)
// ==========================================
export const voiceListenQuery = (guildId: string) =>
    queryOptions({
        queryKey: [...guildKey(guildId), 'voice-listen'],
        queryFn: ({ signal }) => api<VoiceListenStatus>(`/guilds/${guildId}/voice-listen`, { signal }),
        refetchInterval: 2_000,
    });

export const voiceListenApi = {
    join: (guildId: string, channelId: string) => api<VoiceListenStatus>(`/guilds/${guildId}/voice-listen/join`, { body: { channelId } }),
    leave: (guildId: string) => api<SuccessResponse>(`/guilds/${guildId}/voice-listen/leave`, { method: 'POST' }),
};
