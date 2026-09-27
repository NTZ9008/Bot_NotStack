import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { guildQuery } from '@/api/guilds';
import { forgetGuild, rememberGuild } from '@/hooks/use-guild';
import { ApiError } from '@/lib/api';

// ==========================================
// 🏰 Layout ของทุกหน้าในเซิร์ฟเวอร์เดียว (/servers/:guildId/*)
// โหลดข้อมูลเซิร์ฟเวอร์ + สิทธิ์ของผู้ใช้ก่อน — ไม่มีสิทธิ์ / บอทไม่ได้อยู่แล้ว → กลับไปหน้าเลือกเซิร์ฟเวอร์
// ==========================================
export const Route = createFileRoute('/_app/servers/$guildId')({
    beforeLoad: async ({ context, params }) => {
        try {
            const guild = await context.queryClient.ensureQueryData(guildQuery(params.guildId));
            rememberGuild(params.guildId);
            return { guild };
        } catch (err) {
            if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
                // หน้าแรกจะได้ไม่พากลับมาที่เซิร์ฟเวอร์นี้อีก (เช่นบัญชีอื่นเคยเปิดไว้ในเบราว์เซอร์เดียวกัน)
                forgetGuild(params.guildId);
                throw redirect({ to: '/servers', search: { denied: true } });
            }
            throw err;
        }
    },
    component: Outlet,
});
