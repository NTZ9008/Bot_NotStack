import type { GuildSummary } from '@notstack/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { guildQuery } from '@/api/guilds';

// id ของเซิร์ฟเวอร์ที่กำลังจัดการ — ใช้ได้ในทุกหน้าใต้ /servers/$guildId
export function useGuildId(): string {
    return useParams({ from: '/_app/servers/$guildId', select: (params) => params.guildId });
}

// ข้อมูลเซิร์ฟเวอร์ + สิทธิ์ของผู้ใช้ (layout โหลดไว้ให้แล้วก่อนเปิดหน้า)
export function useGuild(): GuildSummary {
    return useSuspenseQuery(guildQuery(useGuildId())).data;
}

// เซิร์ฟเวอร์ล่าสุดที่เปิด — หน้าแรกพากลับไปที่เดิม (เก็บในเบราว์เซอร์นี้เท่านั้น)
const LAST_GUILD_KEY = 'notstack:last-guild';

export function rememberGuild(guildId: string): void {
    try {
        localStorage.setItem(LAST_GUILD_KEY, guildId);
    } catch {
        // โหมดส่วนตัว / ปิด storage — ไม่เป็นไร
    }
}

export function forgetGuild(guildId: string): void {
    try {
        if (localStorage.getItem(LAST_GUILD_KEY) === guildId) localStorage.removeItem(LAST_GUILD_KEY);
    } catch {
        // ไม่เป็นไร
    }
}

export function lastGuild(): string | null {
    try {
        return localStorage.getItem(LAST_GUILD_KEY);
    } catch {
        return null;
    }
}
