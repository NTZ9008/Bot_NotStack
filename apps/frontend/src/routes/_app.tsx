import { useQuery } from '@tanstack/react-query';
import { useT, trText } from '@/lib/i18n';
import { createFileRoute, Outlet, redirect, useParams, useRouterState } from '@tanstack/react-router';
import { guildQuery } from '@/api/guilds';
import { meQuery } from '@/api/auth';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { findNavItem } from '@/components/layout/nav-items';
import { TopBar } from '@/components/layout/top-bar';
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { SplashScreen } from '@/components/splash-screen';
import { ChristmasThemePromo } from '@/components/layout/christmas-promo';

// ==========================================
// 🔐 Layout ของทุกหน้าที่ต้อง login — แถบบนลอย (โลโก้ / ลิงก์ด่วน / ⌘K / ภาษา / ธีม / โปรไฟล์)
// + เมนูซ้ายแบบการ์ดลอย + เนื้อหาที่ค่อยๆ ลอยขึ้นทุกครั้งที่เปลี่ยนหน้า
// ==========================================
export const Route = createFileRoute('/_app')({
    beforeLoad: async ({ context, location }) => {
        const me = await context.queryClient.ensureQueryData(meQuery);
        // viewTransition: มาจากหน้า landing แล้วค่อยๆ เปลี่ยนเป็นหน้า login (ดู landing.css)
        if (!me) throw redirect({ to: '/login', search: { redirect: location.href }, viewTransition: true });
        return { me };
    },
    component: AppLayout,
    // splash ต่อจากใน index.html ทันที (ไม่รอ pendingMs) จะได้ไม่มีจังหวะจอว่าง
    pendingComponent: () => <SplashScreen />,
    pendingMs: 0,
});

function AppLayout() {
    const pathname = useRouterState({ select: (state) => state.location.pathname });
    const routePath = useRouterState({ select: (state) => state.matches[state.matches.length - 1]?.fullPath });
    const current = findNavItem(routePath);
    const { guildId } = useParams({ strict: false });
    const { data: guild } = useQuery({ ...guildQuery(guildId ?? ''), enabled: Boolean(guildId) });
    const t = useT();

    return (
        // --dash-top = ความสูงแถบบน (64px) + ระยะขอบบน/ล่าง 12px ; เมนูซ้ายกับเนื้อหาเริ่มใต้เส้นนี้
        <SidebarProvider className="mx-auto max-w-[1440px] [--dash-top:5.5rem]">
            <BackgroundWordmark />
            <TopBar />
            <AppSidebar />
            <SidebarInset className="min-w-0 bg-transparent pt-(--dash-top)">
                <div className="mx-auto w-full max-w-6xl flex-1 px-3 pb-10 md:px-5">
                    <Breadcrumb aria-label={t('app.breadcrumb')} className="mb-4 min-w-0">
                        <BreadcrumbList className="flex-nowrap">
                            <BreadcrumbItem className="max-w-48 min-w-0">
                                <span className="truncate">{guildId ? (guild?.name ?? '…') : 'Dashboard'}</span>
                            </BreadcrumbItem>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem className="min-w-0">
                                <h1 className="truncate">
                                    <BreadcrumbPage className="font-medium">{current ? trText(current.label) : 'Dashboard'}</BreadcrumbPage>
                                </h1>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                    {/* key ตาม path: เปลี่ยนหน้าแล้วเล่นแอนิเมชันเข้าใหม่ (เปลี่ยนแค่ ?search เช่นตัวกรอง จะไม่กระพริบ) */}
                    <div key={pathname} className="dash-page-in space-y-6">
                        <Outlet />
                    </div>
                </div>
                <footer className="px-6 pb-6 text-center text-xs text-muted-foreground">NotStackOverflow Server Bot · Developed by arlifzs © 2026</footer>
            </SidebarInset>
            {/* 🎄 ชั่วคราว: ป้ายแนะนำธีมคริสต์มาส (ลบได้หลังปีใหม่) */}
            <ChristmasThemePromo />
        </SidebarProvider>
    );
}

// ลายน้ำพื้นหลัง: คำว่า BOT NOTSTACK ตัวโตแบบเส้นขอบจางๆ เลื่อนช้าๆ สลับทิศกันทีละแถว (แบบตัวหนังสือวิ่งของหน้า landing)
// อยู่หลังเนื้อหา (z-0 มาก่อนใน DOM; -z-10 จะโดนพื้นหลังของ body ทับ) และจางพอให้การ์ด/ตัวหนังสือของ UI เด่นกว่าพื้นหลังชัดเจน
const WORDMARK = 'BOT NOTSTACK · BOT NOTSTACK · BOT NOTSTACK · ';
function BackgroundWordmark() {
    return (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0 flex flex-col justify-center gap-[4vh] overflow-hidden select-none">
            {[0, 1, 2].map((row) => (
                <div key={row} className={`dash-wordmark ${row % 2 ? 'dash-wordmark-reverse' : ''}`}>
                    <span>{WORDMARK}</span>
                    <span>{WORDMARK}</span>
                </div>
            ))}
        </div>
    );
}
