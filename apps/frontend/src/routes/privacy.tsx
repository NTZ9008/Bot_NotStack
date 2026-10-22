import { createFileRoute } from '@tanstack/react-router';
import { PrivacyPolicyPage } from '@/features/landing/legal-pages';

export const Route = createFileRoute('/privacy')({
    component: PrivacyPolicyPage,
});
