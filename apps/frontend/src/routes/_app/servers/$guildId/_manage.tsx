import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

// หน้าที่ต้องมีสิทธิ์ Manage Server (สมาชิกทั่วไปดูได้แค่ Levels) — API ตรวจสิทธิ์ซ้ำทุก request อยู่แล้ว
export const Route = createFileRoute('/_app/servers/$guildId/_manage')({
    beforeLoad: ({ context, params }) => {
        if (context.guild.access !== 'manage') throw redirect({ to: '/servers/$guildId/levels', params });
    },
    component: Outlet,
});
