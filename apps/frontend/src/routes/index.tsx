import { createFileRoute } from '@tanstack/react-router';
import { appInfoQuery } from '@/api/app';
import { LandingPage } from '@/features/landing/landing-page';

// หน้าแรกสาธารณะ (ไม่ต้อง login) — Dashboard อยู่ที่ /dashboard
export const Route = createFileRoute('/')({
    loader: ({ context }) => void context.queryClient.prefetchQuery(appInfoQuery),
    component: LandingPage,
});
