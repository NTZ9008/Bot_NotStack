import type { AppInfo, BotInfo } from '@notstack/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const appInfoQuery = queryOptions({
    queryKey: ['app', 'info'],
    // หน้า login ก็เรียก — ไม่ผูกกับ session (401 จาก backend เก่าที่ยังไม่เปิด /version สาธารณะ จะไม่ล้าง session ทับหน้า login)
    queryFn: () => api<AppInfo>('/version', { sessionless: true }),
    staleTime: 5 * 60 * 1000,
});

export const DEFAULT_BOT: BotInfo = { name: 'Bot_NotStack', avatar: 'https://cdn.discordapp.com/embed/avatars/0.png' };
