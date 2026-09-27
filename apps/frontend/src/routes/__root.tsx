import { createRootRouteWithContext, Link, Outlet, useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { RefreshCw, Unplug } from 'lucide-react';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isApiUnreachable } from '@/lib/api';
import type { RouterContext } from '@/router';

export const Route = createRootRouteWithContext<RouterContext>()({
    component: Outlet,
    notFoundComponent: NotFound,
    errorComponent: RootError,
});

function RootError({ error, reset }: ErrorComponentProps) {
    const router = useRouter();
    const retry = () => {
        reset();
        void router.invalidate();
    };

    if (isApiUnreachable(error)) {
        return (
            <div className="flex min-h-svh items-center justify-center p-4">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Unplug className="size-5 text-amber-400" /> เชื่อมต่อ API ไม่ได้
                        </CardTitle>
                        <CardDescription>backend ยังไม่เปิด กำลังเริ่มทำงาน หรือระบบส่งต่อ /api ไปที่ backend ไม่ได้ — ลองใหม่อีกครั้งในอีกสักครู่</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {import.meta.env.DEV && (
                            <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                                ตอน dev: หน้าเว็บส่ง <code>/api</code> ต่อไปที่ backend พอร์ต 3035 (หรือ <code>API_URL</code>) — ดู log ของ backend ในหน้าต่างที่รัน{' '}
                                <code>pnpm dev</code> ว่าเปิดเสร็จแล้วหรือมี error ตอนเริ่ม (เช่นค่าใน .env ไม่ครบ / ต่อฐานข้อมูลไม่ได้)
                            </p>
                        )}
                        <Button onClick={retry} className="w-full">
                            <RefreshCw /> ลองใหม่
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-xl space-y-4 p-8">
            <ErrorState error={error} title="เกิดข้อผิดพลาด" />
            <Button variant="outline" onClick={retry}>
                <RefreshCw /> ลองใหม่
            </Button>
        </div>
    );
}

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
