import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/states';
import type { RouterContext } from '@/router';

export const Route = createRootRouteWithContext<RouterContext>()({
    component: Outlet,
    notFoundComponent: NotFound,
    errorComponent: ({ error }) => (
        <div className="mx-auto max-w-xl p-8">
            <ErrorState error={error} title="เกิดข้อผิดพลาด" />
        </div>
    ),
});

function NotFound() {
    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
            <p className="text-5xl font-bold text-indigo-300">404</p>
            <p className="text-muted-foreground">ไม่พบหน้าที่คุณต้องการ</p>
            <Button asChild>
                <Link to="/">กลับหน้าหลัก</Link>
            </Button>
        </div>
    );
}
