import { createFileRoute, redirect } from '@tanstack/react-router';
import { lastGuild } from '@/hooks/use-guild';

// หน้าแรกหลัง login: กลับไปเซิร์ฟเวอร์ที่เปิดล่าสุด (ถ้ามี) ไม่งั้นไปหน้าเลือกเซิร์ฟเวอร์
export const Route = createFileRoute('/_app/')({
    beforeLoad: () => {
        const guildId = lastGuild();
        throw redirect(guildId ? { to: '/servers/$guildId', params: { guildId } } : { to: '/servers' });
    },
});
