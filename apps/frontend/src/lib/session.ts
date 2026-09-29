import type { MeResponse } from '@notstack/shared';
import type { QueryClient } from '@tanstack/react-query';
import { sessionRequests } from './session-state';

export function replaceSession(queryClient: QueryClient, me: MeResponse | null): void {
    sessionRequests.reset();
    void queryClient.cancelQueries();
    queryClient.clear();
    queryClient.setQueryData(['auth', 'me'], me);
}
