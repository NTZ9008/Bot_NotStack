import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

// หน้าที่ต้องมีสิทธิ์ Manage Server (สมาชิกทั่วไปดูได้แค่ Levels) — API ตรวจสิทธิ์ซ้ำทุก request อยู่แล้ว
export const Route = createFileRoute('/_app/servers/$guildId/_manage')({
    beforeLoad: ({ context, params }) => {
        if (context.guild.access !== 'manage') throw redirect({ to: '/servers/$guildId/levels', params });
    },
    component: ManageLayout,
});

// สลับเซิร์ฟเวอร์แล้ว router ใช้ component เดิมต่อ — ใส่ key ให้ฟอร์ม/ร่างข้อความของเซิร์ฟเวอร์เดิมถูกล้างทิ้งทั้งหมด
function ManageLayout() {
    const { guildId } = Route.useParams();
    return <Outlet key={guildId} />;
}
