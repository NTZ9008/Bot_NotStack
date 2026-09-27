import { createFileRoute, redirect } from '@tanstack/react-router';

// หน้าแรกของเซิร์ฟเวอร์: ผู้ที่จัดการได้ → Overview, สมาชิกทั่วไป → Levels
export const Route = createFileRoute('/_app/servers/$guildId/')({
    beforeLoad: ({ context, params }) => {
        throw redirect({ to: context.guild.access === 'manage' ? '/servers/$guildId/overview' : '/servers/$guildId/levels', params });
    },
});
