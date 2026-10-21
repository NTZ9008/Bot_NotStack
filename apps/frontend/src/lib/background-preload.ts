export interface PreloadTask {
    key: string;
    run: () => Promise<unknown>;
}
interface Job extends PreloadTask {
    owners: Set<AbortSignal>;
    priority: boolean;
    running: boolean;
}

// Shared by route and tab preloads: at most two speculative jobs at a time.
// Intent promotes an existing queued job instead of starting a duplicate request.
export class PreloadQueue {
    private readonly jobs = new Map<string, Job>();
    private active = 0;
    private timer: ReturnType<typeof setTimeout> | undefined;

    constructor(
        private readonly canRun: () => boolean,
        private readonly concurrency = 2,
    ) {}

    enqueue(task: PreloadTask, signal: AbortSignal, priority = false): void {
        if (signal.aborted) return;
        let job = this.jobs.get(task.key);
        if (!job) {
            job = { ...task, owners: new Set(), priority, running: false };
            this.jobs.set(task.key, job);
        }
        job.owners.add(signal);
        job.priority ||= priority;
        this.schedule(priority ? 0 : 50);
    }

    cancel(signal: AbortSignal): void {
        for (const [key, job] of this.jobs) {
            job.owners.delete(signal);
            if (!job.running && !job.owners.size) this.jobs.delete(key);
        }
        if (![...this.jobs.values()].some((job) => !job.running)) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
    }

    private schedule(delay: number): void {
        if (this.active >= this.concurrency || ![...this.jobs.values()].some((job) => !job.running)) return;
        if (this.timer !== undefined) {
            if (delay !== 0) return;
            clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => {
            this.timer = undefined;
            this.pump();
        }, delay);
    }

    private pump(): void {
        for (const [key, job] of this.jobs) {
            for (const owner of job.owners) if (owner.aborted) job.owners.delete(owner);
            if (!job.running && !job.owners.size) this.jobs.delete(key);
        }
        if (!this.canRun()) {
            this.schedule(300);
            return;
        }
        const queued = [...this.jobs.values()].filter((job) => !job.running).sort((a, b) => Number(b.priority) - Number(a.priority));
        for (const job of queued) {
            if (this.active >= this.concurrency) break;
            job.running = true;
            this.active++;
            void this.run(job);
        }
    }

    private async run(job: Job): Promise<void> {
        try {
            await job.run();
        } catch {
            /* Navigation can retry a failed speculative load. */
        } finally {
            this.active--;
            this.jobs.delete(job.key);
            this.schedule(0);
        }
    }
}

export function canPreloadInBackground(): boolean {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    return document.visibilityState === 'visible' && navigator.onLine && !connection?.saveData && !['slow-2g', '2g'].includes(connection?.effectiveType ?? '');
}

let navigationPending = false;
export function pausePreloads(pending: boolean): void {
    navigationPending = pending;
}
export const backgroundPreloads = new PreloadQueue(() => canPreloadInBackground() && !navigationPending);
const sessions = new WeakMap<AbortSignal, number>();
let nextSession = 0;

// Each mounted scope cancels only its own queued work, including under StrictMode.
export function preloadScope(session: AbortSignal) {
    if (!sessions.has(session)) sessions.set(session, ++nextSession);
    const namespace = sessions.get(session)!;
    const controller = new AbortController();
    const signal = AbortSignal.any([session, controller.signal]);
    const cancel = () => backgroundPreloads.cancel(signal);
    signal.addEventListener('abort', cancel, { once: true });
    return {
        enqueue: (task: PreloadTask, priority = false) => backgroundPreloads.enqueue({ ...task, key: `${namespace}:${task.key}` }, signal, priority),
        stop: () => {
            controller.abort();
            signal.removeEventListener('abort', cancel);
        },
    };
}
