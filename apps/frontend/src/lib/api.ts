import { sessionRequests } from './session-state';
import { AUTH_ERROR_CODES, type ApiErrorBody } from '@notstack/shared';

// ==========================================
// 🌐 API CLIENT — เรียก /api/* แบบมี cookie session
// API อยู่ origin เดียวกับหน้าเว็บเป็นค่าเริ่มต้น (Cloudflare Worker / Vite dev proxy ส่ง /api ต่อให้ backend)
// ถ้า API อยู่คนละ origin ให้ build ด้วย VITE_API_URL=https://api.example.com (ต้องเป็น domain เดียวกัน เพราะ cookie เป็น SameSite)
// access token (JWT) อายุ 15 นาที อยู่ใน httpOnly cookie — เมื่อ API ตอบ 401 จะเรียก /api/auth/refresh ให้เอง
// แล้วส่ง request เดิมซ้ำ 1 ครั้ง ถ้ายังไม่ผ่านถือว่า session หมด → พาไปหน้า login
// ==========================================

export class ApiError extends Error {
    constructor(
        readonly status: number,
        message: string,
        readonly body: Partial<ApiErrorBody> = {},
    ) {
        super(message);
        this.name = 'ApiError';
    }

    get code(): string | undefined {
        return this.body.code;
    }
}

export const API_BASE = String(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

// URL เต็มของ path ใน API (ใช้กับ <img src> / ลิงก์ที่เปิดตรงๆ เช่น login ด้วย Discord)
export const apiUrl = (path: string): string => (path.startsWith('/api') ? `${API_BASE}${path}` : `${API_BASE}/api${path}`);

// เรียกไม่ถึง backend เลย — backend ยังไม่เปิด / กำลังเริ่มทำงาน (pnpm dev) / proxy ต่อไม่ได้
// (Vite dev proxy และ Cloudflare ตอบ 502/503/504 ที่ไม่ใช่ JSON ของ API เรา)
export const API_UNREACHABLE = 'API_UNREACHABLE';
const UNREACHABLE_MESSAGE = 'เชื่อมต่อ API ไม่ได้ — backend ยังไม่เปิด หรือกำลังเริ่มทำงาน';
const GATEWAY_STATUSES = new Set([502, 503, 504]);

export const isApiUnreachable = (err: unknown): boolean => err instanceof ApiError && err.code === API_UNREACHABLE;

// request เหล่านี้จัดการ 401 เอง ไม่ต้อง refresh ซ้ำ
const NO_RETRY = ['/auth/login', '/auth/refresh', '/auth/logout'];

let refreshing: { signal: AbortSignal; promise: Promise<boolean> } | null = null;
let onUnauthorized: () => void = () => {
    window.location.href = '/login';
};

// router ตั้ง callback นี้ให้พาไปหน้า login แบบไม่ต้องโหลดหน้าใหม่
export function setUnauthorizedHandler(handler: () => void): void {
    onUnauthorized = handler;
}

// หลาย request เจอ 401 พร้อมกัน → refresh แค่ครั้งเดียว แล้วทุกตัวรอผลเดียวกัน
export function refreshSession(signal = sessionRequests.capture()): Promise<boolean> {
    if (refreshing?.signal === signal) return refreshing.promise;
    const promise = fetch(apiUrl('/auth/refresh'), { method: 'POST', credentials: 'include', signal })
        .then(async (res) => {
            if (res.ok) return true;
            const data = (await res.json().catch(() => ({}))) as Partial<ApiErrorBody>;
            if (data.code === AUTH_ERROR_CODES.tokenRotated) {
                await new Promise((resolve) => setTimeout(resolve, 500));
                signal.throwIfAborted();
                return true;
            }
            return false;
        })
        .catch((err: unknown) => {
            if (signal.aborted) throw err;
            return false;
        })
        .finally(() => {
            if (refreshing?.signal === signal) refreshing = null;
        });
    refreshing = { signal, promise };
    return promise;
}

export interface ApiOptions {
    method?: 'GET' | 'POST';
    // body แบบ JSON
    body?: unknown;
    // body ดิบ (เช่นไฟล์รูป) — ใช้คู่กับ contentType
    raw?: BodyInit;
    contentType?: string;
    query?: Record<string, string | number | boolean | null | undefined>;
    responseType?: 'json' | 'text';
    // ไม่พาไปหน้า login เมื่อ session หมด (เช่นตอนเช็คว่า login อยู่ไหม)
    allowUnauthenticated?: boolean;
    signal?: AbortSignal;
}

function buildUrl(path: string, query?: ApiOptions['query']): string {
    const url = apiUrl(path);
    if (!query) return url;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    }
    const qs = params.toString();
    return qs ? `${url}?${qs}` : url;
}

async function send(path: string, options: ApiOptions): Promise<Response> {
    const headers: Record<string, string> = {};
    let body: BodyInit | undefined;
    if (options.raw !== undefined) {
        body = options.raw;
        if (options.contentType) headers['Content-Type'] = options.contentType;
    } else if (options.body !== undefined) {
        body = JSON.stringify(options.body);
        headers['Content-Type'] = 'application/json';
    }
    try {
        return await fetch(buildUrl(path, options.query), {
            method: options.method ?? (body !== undefined ? 'POST' : 'GET'),
            headers,
            body,
            credentials: 'include',
            signal: options.signal,
        });
    } catch (err) {
        // ยกเลิกเอง (เช่น TanStack Query ยกเลิก request เก่า) — ส่งต่อตามเดิม
        if (options.signal?.aborted) throw err;
        throw new ApiError(0, UNREACHABLE_MESSAGE, { code: API_UNREACHABLE });
    }
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
    const sessionSignal = sessionRequests.capture();
    options = { ...options, signal: options.signal ? AbortSignal.any([options.signal, sessionSignal]) : sessionSignal };
    let res = await send(path, options);
    sessionSignal.throwIfAborted();

    if (res.status === 401 && !NO_RETRY.includes(path)) {
        if (await refreshSession(sessionSignal)) res = await send(path, options);
        sessionSignal.throwIfAborted();
        if (res.status === 401 && !options.allowUnauthenticated) onUnauthorized();
    }

    if (!res.ok) {
        const data = (await res.json().catch(() => null)) as Partial<ApiErrorBody> | null;
        if (!data && GATEWAY_STATUSES.has(res.status)) throw new ApiError(res.status, UNREACHABLE_MESSAGE, { code: API_UNREACHABLE });
        const message = res.status === 413 ? 'ไฟล์ใหญ่เกินกำหนด' : data?.error || `HTTP ${res.status}`;
        throw new ApiError(res.status, message, data ?? {});
    }

    const result: unknown = options.responseType === 'text' ? await res.text() : await res.json();
    sessionSignal.throwIfAborted();
    return result as T;
}

export const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));
