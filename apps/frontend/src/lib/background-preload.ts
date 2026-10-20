// Space out speculative loads so they do not compete with a click/navigation.
// Cancelling stops queued work; in-flight API calls belong to the session signal.
export function schedulePreloads(tasks: Array<() => Promise<unknown>>, signal: AbortSignal, canRun: () => boolean = () => true): () => void {
    let stopped = false;
    let index = 0;
    let timer: ReturnType<typeof setTimeout>;
    const stop = () => {
        stopped = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', stop);
    };
    const schedule = () => {
        if (stopped || signal.aborted || index >= tasks.length) return stop();
        timer = setTimeout(() => void run(), 300);
    };
    const run = async () => {
        if (stopped || signal.aborted) return stop();
        if (!canRun()) return schedule();
        try {
            await tasks[index++]();
        } catch {
            // A failed preload must not block other pages; navigation can retry.
        }
        schedule();
    };
    signal.addEventListener('abort', stop, { once: true });
    schedule();
    return stop;
}

export function canPreloadInBackground(): boolean {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    return document.visibilityState === 'visible' && navigator.onLine && !connection?.saveData && !['slow-2g', '2g'].includes(connection?.effectiveType ?? '');
}
