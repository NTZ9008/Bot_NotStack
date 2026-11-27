import { tr } from '../lib/i18n';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { AlertCircle, Inbox } from '@/components/icons';
import type { ReactNode } from 'react';
import { errorMessage } from '@/lib/api';

export function ErrorState({ error, title = tr('common.failedToLoadData'), className }: { error: unknown; title?: string; className?: string }) {
    return (
        <Alert variant="destructive" className={className}>
            <AlertCircle />
            <AlertTitle>{title}</AlertTitle>
            <AlertDescription>{errorMessage(error)}</AlertDescription>
        </Alert>
    );
}

export function EmptyState({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <Empty className={className}>
            <EmptyHeader>
                <EmptyMedia variant="icon">
                    <Inbox />
                </EmptyMedia>
                {typeof children === 'string' ? <EmptyDescription>{children}</EmptyDescription> : null}
            </EmptyHeader>
            {typeof children === 'string' ? null : <EmptyContent className="text-sm text-muted-foreground">{children}</EmptyContent>}
        </Empty>
    );
}
