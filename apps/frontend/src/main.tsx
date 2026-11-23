import './index.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { Fragment, StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfirmProvider } from '@/components/confirm-dialog';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { loadLang, useLang } from './lib/i18n';
import { queryClient, router } from './router';

// เปลี่ยนภาษาแบบไม่โหลดหน้าใหม่: remount ทั้งแอป (ข้อความที่แปลตอน render) + โหลดข้อมูล API ใหม่ (api.ts แปลป้ายกำกับตอนรับข้อมูล)
// + invalidate router (title ของหน้า)
function LangBoundary({ children }: { children: React.ReactNode }) {
    const [lang] = useLang();
    const first = useRef(lang);
    useEffect(() => {
        if (lang === first.current) return;
        first.current = lang;
        void queryClient.invalidateQueries();
        void router.invalidate();
    }, [lang]);
    return <Fragment key={lang}>{children}</Fragment>;
}

// โหลดไม่สำเร็จก็ render ต่อ (ข้อความที่ไม่มีคำแปลแสดงภาษาไทย)
void loadLang(document.documentElement.lang === 'en' ? 'en' : 'th')
    .catch(() => undefined)
    .then(() => {
        createRoot(document.getElementById('root')!).render(
            <StrictMode>
                <QueryClientProvider client={queryClient}>
                    <TooltipProvider>
                        <ConfirmProvider>
                            <LangBoundary>
                                <RouterProvider router={router} />
                            </LangBoundary>
                            <Toaster position="bottom-center" closeButton />
                        </ConfirmProvider>
                    </TooltipProvider>
                </QueryClientProvider>
            </StrictMode>,
        );
    });

try {
    if (import.meta.env.DEV || localStorage.getItem('notstack:performance') === '1') {
        void import('./lib/performance').then(({ observePerformance }) => observePerformance(router)).catch(() => undefined);
    }
} catch {
    // Storage can be unavailable in restricted browser contexts; diagnostics are optional.
}
