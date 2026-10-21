import { useCallback, useEffect, useRef } from 'react';
import { preloadScope, type PreloadTask } from '@/lib/background-preload';
import { sessionRequests } from '@/lib/session-state';

// Pass a memoized task list; intent can promote queued work without bypassing the limit.
export function usePreloadTasks(tasks: PreloadTask[]) {
    const scope = useRef<ReturnType<typeof preloadScope> | null>(null);
    const session = sessionRequests.capture();
    useEffect(() => {
        const current = preloadScope(session);
        scope.current = current;
        tasks.forEach((task) => current.enqueue(task));
        return () => {
            current.stop();
            scope.current = null;
        };
    }, [tasks, session]);
    return useCallback(
        (keys: string | string[]) => {
            const wanted = new Set(typeof keys === 'string' ? [keys] : keys);
            tasks.filter((task) => wanted.has(task.key)).forEach((task) => scope.current?.enqueue(task, true));
        },
        [tasks],
    );
}
