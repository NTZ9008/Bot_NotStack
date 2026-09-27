import { z } from 'zod';

// ==========================================
// 🔐 AUTH — บัญชีผู้ใช้ Dashboard (username/password และ Discord OAuth)
// ==========================================

export const ROLES = ['USER', 'ADMIN'] as const;
export type UserRole = (typeof ROLES)[number];

export const USERNAME_RE = /^[a-z0-9_.-]{3,32}$/;
export const USERNAME_MESSAGE = 'username ต้องเป็น a-z 0-9 _ . - ยาว 3-32 ตัวอักษร';

export const normalizeUsername = (value: unknown): string => (typeof value === 'string' ? value.trim().toLowerCase() : '');
export const isValidUsername = (value: string): boolean => USERNAME_RE.test(value);

// bcrypt ใช้แค่ 72 byte แรก — ยาวกว่านั้นจะถูกตัดทิ้งเงียบๆ จึงไม่ยอมรับตั้งแต่แรก
export function validatePassword(password: unknown): string | null {
    if (typeof password !== 'string' || password.length < 8) return 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร';
    if (new TextEncoder().encode(password).length > 72) return 'รหัสผ่านยาวเกินไป (สูงสุด 72 byte)';
    return null;
}

export const usernameSchema = z.unknown().transform((value, ctx) => {
    const username = normalizeUsername(value);
    if (!isValidUsername(username)) {
        ctx.addIssue({ code: 'custom', message: USERNAME_MESSAGE });
        return z.NEVER;
    }
    return username;
});

export const passwordSchema = z.unknown().transform((value, ctx) => {
    const invalid = validatePassword(value);
    if (invalid) {
        ctx.addIssue({ code: 'custom', message: invalid });
        return z.NEVER;
    }
    return value as string;
});

// สำหรับฟอร์มในหน้าเว็บ (ค่าเป็น string เสมอ) — กฎเดียวกับด้านบน
export const usernameFieldSchema = z.string().refine((value) => isValidUsername(normalizeUsername(value)), USERNAME_MESSAGE);
export const passwordFieldSchema = z.string().superRefine((value, ctx) => {
    const invalid = validatePassword(value);
    if (invalid) ctx.addIssue({ code: 'custom', message: invalid });
});

export const loginSchema = z.object({
    username: z.string({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' }).min(1, 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'),
    password: z.string({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' }).min(1, 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'),
});
export type LoginInput = z.infer<typeof loginSchema>;

// API ตรวจรหัสผ่านปัจจุบันก่อนแล้วค่อยตรวจรหัสใหม่ (validatePassword) — จึงรับค่าดิบไว้ก่อน
export const changePasswordSchema = z.object({
    currentPassword: z.unknown(),
    newPassword: z.unknown(),
});
export interface ChangePasswordInput {
    currentPassword: string;
    newPassword: string;
}

// ข้อมูลผู้ใช้ที่ส่งออกไปหน้าเว็บได้ (ไม่มี passwordHash / tokenVersion)
export interface PublicUser {
    id: number;
    username: string | null;
    displayName: string;
    avatarUrl: string | null;
    role: UserRole;
    isActive: boolean;
    discordId: string | null;
    discordUsername: string | null;
    hasPassword: boolean;
    lockedUntil: string | null;
    lastLoginAt: string | null;
    createdAt: string;
}

export interface MeResponse {
    user: PublicUser;
    discordEnabled: boolean;
}

export interface AuthProviders {
    password: boolean;
    discord: boolean;
}

export interface LoginResponse {
    success: true;
    user: PublicUser;
}

// รหัส error ที่ API ส่งมาตอน session ใช้ไม่ได้ (หน้าเว็บใช้ตัดสินใจว่าจะ refresh หรือพาไปหน้า login)
export const AUTH_ERROR_CODES = {
    unauthenticated: 'UNAUTHENTICATED',
    forbidden: 'FORBIDDEN',
    noSession: 'NO_SESSION',
    tokenRotated: 'TOKEN_ROTATED',
    sessionRevoked: 'SESSION_REVOKED',
    badOrigin: 'BAD_ORIGIN',
} as const;

// ข้อความ error ที่ส่งกลับมาจาก Discord OAuth (/login?error=...)
export const LOGIN_ERRORS: Record<string, string> = {
    discord_denied: 'คุณยกเลิกการเข้าสู่ระบบด้วย Discord',
    discord_state: 'ลิงก์เข้าสู่ระบบหมดอายุหรือไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง',
    discord_failed: 'ติดต่อ Discord ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
    discord_disabled: 'ระบบยังไม่ได้เปิดใช้การเข้าสู่ระบบด้วย Discord',
    account_disabled: 'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ',
};

// ข้อความ error ตอนผูกบัญชี Discord (/account?discord_error=...)
export const DISCORD_LINK_ERRORS: Record<string, string> = {
    discord_denied: 'คุณยกเลิกการเชื่อมต่อที่หน้า Discord',
    discord_state: 'ลิงก์เชื่อมต่อหมดอายุหรือไม่ถูกต้อง กรุณาลองใหม่',
    discord_failed: 'ติดต่อ Discord ไม่สำเร็จ กรุณาลองใหม่',
    discord_taken: 'บัญชี Discord นี้ถูกผูกกับผู้ใช้อื่นในระบบแล้ว',
    discord_disabled: 'ระบบยังไม่ได้เปิดใช้การเชื่อมต่อ Discord',
    account_disabled: 'บัญชีนี้ถูกปิดใช้งาน',
};
