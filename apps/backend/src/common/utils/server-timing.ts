import { AsyncLocalStorage } from 'node:async_hooks';
import type { Response } from 'express';

const timings = new AsyncLocalStorage<Map<string, number>>();

export function recordTiming(name: string, duration: number): void {
    const context = timings.getStore();
    if (context) context.set(name, (context.get(name) ?? 0) + duration);
}

export async function timeOperation<T>(name: string, work: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
        return await work();
    } finally {
        recordTiming(name, performance.now() - start);
    }
}

// Only called from authenticated read/preview endpoints. No IDs or query values in headers.
export async function withServerTiming<T>(res: Response, work: () => Promise<T>): Promise<T> {
    return timings.run(new Map(), async () => {
        try {
            return await timeOperation('total', work);
        } finally {
            res.set('Server-Timing', [...timings.getStore()!].map(([name, ms]) => `${name};dur=${ms.toFixed(1)}`).join(', '));
        }
    });
}
