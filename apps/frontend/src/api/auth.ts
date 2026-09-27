import type { AuthProviders, ChangePasswordInput, LoginInput, LoginResponse, MeResponse, SuccessResponse } from '@notstack/shared';
import { queryOptions } from '@tanstack/react-query';
import { api, ApiError, isApiUnreachable } from '@/lib/api';

// ผู้ใช้ที่ login อยู่ (null = ยังไม่ได้ login) — ใช้ตัดสินสิทธิ์ของ route และเมนู
export const meQuery = queryOptions({
    queryKey: ['auth', 'me'],
    queryFn: async (): Promise<MeResponse | null> => {
        try {
            return await api<MeResponse>('/auth/me', { allowUnauthenticated: true });
        } catch (err) {
            if (err instanceof ApiError && err.status === 401) return null;
            throw err;
        }
    },
    staleTime: 5 * 60 * 1000,
    // backend ยังไม่พร้อม (เช่นเพิ่งสั่ง pnpm dev แล้ว backend ยัง compile อยู่) → รอแล้วลองใหม่ราว 15 วินาทีก่อนขึ้นหน้า error
    retry: (failureCount, err) => isApiUnreachable(err) && failureCount < 5,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
});

export const providersQuery = queryOptions({
    queryKey: ['auth', 'providers'],
    queryFn: () => api<AuthProviders>('/auth/providers'),
    staleTime: Infinity,
});

export const authApi = {
    login: (input: LoginInput) => api<LoginResponse>('/auth/login', { body: input }),
    logout: () => api<SuccessResponse>('/auth/logout', { method: 'POST' }),
    logoutAll: () => api<SuccessResponse>('/auth/logout-all', { method: 'POST' }),
    changePassword: (input: ChangePasswordInput) => api<SuccessResponse>('/auth/password', { body: input }),
    unlinkDiscord: () => api<SuccessResponse>('/auth/discord/unlink', { method: 'POST' }),
};
