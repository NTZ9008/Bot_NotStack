import type { PublicUser } from '@notstack/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { meQuery } from '@/api/auth';

// ผู้ใช้ที่ login อยู่ — ใช้ได้ในทุกหน้าภายใต้ layout _app (route guard โหลดไว้ให้แล้ว)
export function useAuth(): { user: PublicUser; isAdmin: boolean; discordEnabled: boolean } {
    const { data } = useSuspenseQuery(meQuery);
    if (!data) throw new Error('ยังไม่ได้เข้าสู่ระบบ');
    return { user: data.user, isAdmin: data.user.role === 'ADMIN', discordEnabled: data.discordEnabled };
}
