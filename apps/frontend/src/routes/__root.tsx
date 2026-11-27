import { tr } from '../lib/i18n';
import { createRootRouteWithContext, Link, Outlet, useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { RefreshCw, Unplug } from '@/components/icons';
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
                            <Unplug className="size-5 text-warning" /> {tr('root.cantReachTheApi')}
                        </CardTitle>
                        <CardDescription>{tr('root.theBackendIsntUpYetIs')}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {import.meta.env.DEV && (
                            <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                                {tr('root.inDevTheWebAppForwards')} <code>/api</code> {tr('root.toTheBackendOnPort3035')} <code>API_URL</code>
                                {tr('root.checkTheBackendLogInThe')} <code>pnpm dev</code> {tr('root.toSeeWhetherItFinishedStarting')}
                            </p>
                        )}
                        <Button onClick={retry} className="w-full">
                            <RefreshCw /> {tr('root.retry')}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-xl space-y-4 p-8">
            <ErrorState error={error} title={tr('common.somethingWentWrong')} />
            <Button variant="outline" onClick={retry}>
                <RefreshCw /> {tr('root.retry')}
            </Button>
        </div>
    );
}

function NotFound() {
    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
            <p className="text-5xl font-bold text-highlight">404</p>
            <p className="text-muted-foreground">{tr('root.thePageYoureLookingForDoesnt')}</p>
            <Button asChild>
                <Link to="/">{tr('root.backToHome')}</Link>
            </Button>
        </div>
    );
}
