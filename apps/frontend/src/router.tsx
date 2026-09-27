import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { meQuery } from '@/api/auth';
import { setUnauthorizedHandler } from '@/lib/api';
import { routeTree } from './routeTree.gen';

export interface RouterContext {
    queryClient: QueryClient;
}

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 15 * 1000,
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
    scrollRestoration: true,
});

// session หมดอายุ (refresh ไม่ผ่าน) → ล้างข้อมูลผู้ใช้แล้วพาไปหน้า login
setUnauthorizedHandler(() => {
    queryClient.setQueryData(meQuery.queryKey, null);
    if (router.state.location.pathname !== '/login') void router.navigate({ to: '/login' });
});

declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router;
    }
}
