import './index.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfirmProvider } from '@/components/confirm-dialog';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { queryClient, router } from './router';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <TooltipProvider>
                <ConfirmProvider>
                    <RouterProvider router={router} />
                    <Toaster position="top-right" richColors closeButton />
                </ConfirmProvider>
            </TooltipProvider>
        </QueryClientProvider>
    </StrictMode>,
);
