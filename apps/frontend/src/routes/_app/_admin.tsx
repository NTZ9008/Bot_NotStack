import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

// หน้าที่เป็นของ ADMIN เท่านั้น (API ฝั่ง server ตรวจสิทธิ์ซ้ำทุก request อยู่แล้ว)
export const Route = createFileRoute('/_app/_admin')({
    beforeLoad: ({ context }) => {
        if (context.me.user.role !== 'ADMIN') throw redirect({ to: '/servers' });
    },
    component: Outlet,
});
