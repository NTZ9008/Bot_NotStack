import { useQuery } from '@tanstack/react-query';
import { useT, trText } from '@/lib/i18n';
import { createFileRoute, Outlet, redirect, useParams, useRouterState } from '@tanstack/react-router';
import { guildQuery } from '@/api/guilds';
import { meQuery } from '@/api/auth';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { findNavItem } from '@/components/layout/nav-items';
import { CommandPalette } from '@/components/layout/command-palette';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { SplashScreen } from '@/components/splash-screen';

// ==========================================
// 🔐 Layout ของทุกหน้าที่ต้อง login — เมนูซ้าย + แถบบน (ชื่อหน้า / ⌘K ค้นหาและสั่งงาน / เมนูโปรไฟล์)
// ==========================================
export const Route = createFileRoute('/_app')({
    beforeLoad: async ({ context, location }) => {
        const me = await context.queryClient.ensureQueryData(meQuery);
        if (!me) throw redirect({ to: '/login', search: { redirect: location.href } });
        return { me };
    },
    component: AppLayout,
    // splash ต่อจากใน index.html ทันที (ไม่รอ pendingMs) จะได้ไม่มีจังหวะจอว่าง
    pendingComponent: () => <SplashScreen />,
    pendingMs: 0,
});

function AppLayout() {
    const isNavigating = useRouterState({ select: (state) => state.isLoading });
    const routePath = useRouterState({ select: (state) => state.matches[state.matches.length - 1]?.fullPath });
    const current = findNavItem(routePath);
    const { guildId } = useParams({ strict: false });
    const { data: guild } = useQuery({ ...guildQuery(guildId ?? ''), enabled: Boolean(guildId) });
    const t = useT();

    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="min-w-0 bg-transparent">
                <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 bg-background/80 px-3 backdrop-blur md:px-4">
                    {isNavigating && <div role="progressbar" aria-label={t('app.openingPage')} className="absolute inset-x-0 bottom-0 h-0.5 bg-primary/70" />}
                    <SidebarTrigger />
                    <div className="ml-auto flex items-center gap-2">
                        <CommandPalette />
                    </div>
                </header>
                <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 pt-2 pb-10 md:px-10 xl:px-20">
                    <nav aria-label="breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
                        <span className="max-w-56 truncate text-muted-foreground">{guildId ? (guild?.name ?? '…') : 'Dashboard'}</span>
                        <span aria-hidden className="text-muted-foreground">
                            /
                        </span>
                        <span aria-current="page" className="truncate font-medium">
                            {current ? trText(current.label) : 'Dashboard'}
                        </span>
                    </nav>
                    <Outlet />
                </main>
                <footer className="px-6 py-4 text-center text-xs text-muted-foreground">NotStackOverflow Server Bot</footer>
            </SidebarInset>
        </SidebarProvider>
    );
}
