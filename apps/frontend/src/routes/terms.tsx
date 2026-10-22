import { createFileRoute } from '@tanstack/react-router';
import { TermsOfServicePage } from '@/features/landing/legal-pages';

export const Route = createFileRoute('/terms')({
    component: TermsOfServicePage,
});
