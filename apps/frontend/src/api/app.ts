import type { AppInfo, BotInfo } from '@notstack/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const appInfoQuery = queryOptions({
    queryKey: ['app', 'info'],
    queryFn: () => api<AppInfo>('/version'),
    staleTime: 5 * 60 * 1000,
});

export const DEFAULT_BOT: BotInfo = { name: 'Bot_NotStack', avatar: 'https://cdn.discordapp.com/embed/avatars/0.png' };
