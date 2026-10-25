import { apiUrl, refreshSession } from './api';
import { sessionRequests } from './session-state';
import { createSseParser, type SseMessage } from './sse-parser';

export type StreamStatus = 'connecting' | 'live' | 'reconnecting' | 'disabled' | 'unauthorized';

export interface EventStreamOptions {
    path: string;
    // ข้อมูลสาธารณะ — ไม่ refresh session และไม่ถูกตัดตอนเปลี่ยนบัญชี
    sessionless?: boolean;
    onMessage: (message: SseMessage) => void;
    onStatus?: (status: StreamStatus) => void;
    signal: AbortSignal;
}

const MAX_BACKOFF_MS = 30_000;
const sleep = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
    });

// ==========================================
// 📡 EVENT STREAM — อ่าน Server-Sent Events ด้วย fetch (ไม่ใช้ EventSource)
// เพราะต้องรู้ status code: 401 → refresh session แล้วต่อใหม่ / 404 → ปิดอยู่ ไม่ต้องลองซ้ำ
// หลุดเมื่อไหร่ต่อใหม่เองแบบรอนานขึ้นเรื่อยๆ (สูงสุด 30 วินาที) — หยุดเมื่อ signal ถูก abort
// ==========================================
export async function openEventStream({ path, sessionless, onMessage, onStatus, signal: outer }: EventStreamOptions): Promise<void> {
    const signal = sessionless ? outer : AbortSignal.any([outer, sessionRequests.capture()]);
    let attempt = 0;
    let refreshed = false;

    while (!signal.aborted) {
        onStatus?.(attempt === 0 ? 'connecting' : 'reconnecting');
        try {
            const res = await fetch(apiUrl(path), { credentials: 'include', headers: { Accept: 'text/event-stream' }, signal });
            if (res.status === 401 && !sessionless) {
                if (!refreshed && (await refreshSession())) {
                    refreshed = true;
                    continue;
                }
                onStatus?.('unauthorized');
                return;
            }
            if (res.status === 404) {
                onStatus?.('disabled');
                return;
            }
            if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

            onStatus?.('live');
            attempt = 0;
            refreshed = false;
            const parse = createSseParser(onMessage);
            const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
            for (;;) {
                const { value, done } = await reader.read();
                if (done) break;
                parse(value);
            }
        } catch {
            if (signal.aborted) return;
        }
        attempt++;
        const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(attempt, 5)) * (0.7 + Math.random() * 0.6);
        onStatus?.('reconnecting');
        await sleep(delay, signal);
    }
}
