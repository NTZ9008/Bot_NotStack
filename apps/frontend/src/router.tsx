import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { NavigationSkeleton } from '@/components/skeleton/navigation';
import { replaceSession } from '@/lib/session';
import { setUnauthorizedHandler } from '@/lib/api';
import { pausePreloads } from '@/lib/background-preload';
import { routeTree } from './routeTree.gen';

export interface RouterContext {
    queryClient: QueryClient;
}

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 15 * 1000,
            // Keep visited/preloaded pages available while moving between menus.
            gcTime: 15 * 60 * 1000,
            retry: (failureCount, error) => failureCount < 1 && !(error instanceof Error && 'status' in error && Number(error.status) < 500),
            refetchOnWindowFocus: false,
        },
    },
});

export const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    // ข้อมูลของหน้าให้ TanStack Query เป็นคนดูแล cache
    defaultPreloadStaleTime: 0,
    // Keep the current page during short transitions; never hold ready content behind a timer.
    defaultPendingComponent: NavigationSkeleton,
    defaultPendingMs: 250,
    defaultPendingMinMs: 0,
    scrollRestoration: true,
});

router.subscribe('onBeforeLoad', () => pausePreloads(true));
router.subscribe('onResolved', () => pausePreloads(false));

// splash ทันที (pendingMs 0) ใช้แค่ตอนเปิดเว็บครั้งแรก ต่อจาก splash ใน index.html
// หลังจากนั้นค้างหน้าเดิมไว้ระหว่างเช็ค session → landing ⇄ login เปลี่ยนแบบ view transition ไม่มี splash แทรก
const stopInitialSplash = router.subscribe('onResolved', () => {
    stopInitialSplash();
    for (const id of ['/_app', '/login'] as const) router.routesById[id].options.pendingMs = 1500;
});

// session หมดอายุ (refresh ไม่ผ่าน) → ล้างข้อมูลผู้ใช้แล้วพาไปหน้า login
setUnauthorizedHandler(() => {
    replaceSession(queryClient, null);
    if (router.state.location.pathname !== '/login') void router.navigate({ to: '/login' });
});

declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router;
    }
}
