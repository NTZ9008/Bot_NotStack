import { z } from 'zod';

// Discord ID (snowflake) และสีแบบ #RRGGBB — ใช้ตรวจค่าทั้งฝั่ง API และฟอร์มในหน้าเว็บ
export const SNOWFLAKE_RE = /^\d{5,25}$/;
export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export const isSnowflake = (value: unknown): value is string => typeof value === 'string' && SNOWFLAKE_RE.test(value);

// รูปแบบ error ที่ API ตอบกลับทุกครั้ง (ข้อความภาษาไทยให้หน้าเว็บแสดงได้เลย)
export interface ApiErrorBody {
    error: string;
    code?: string;
    [key: string]: unknown;
}

export interface SuccessResponse {
    success: true;
    message?: string;
}

// แบ่งหน้าด้วย cursor = id ตัวสุดท้ายของหน้าก่อน
export interface CursorPage<T> {
    items: T[];
    nextCursor: number | null;
}

// หมายเหตุ zod 4: key ที่ใช้ .transform() ต้องปิดท้ายด้วย .optional() ไม่งั้นจะถือว่าต้องส่งมาเสมอ

// ค่าที่มาจาก query string เป็นข้อความเสมอ — แปลงเป็นเลข id บวก (ค่าที่ใช้ไม่ได้กลายเป็น undefined)
export const optionalId = z
    .unknown()
    .transform((value) => {
        const id = Number(value);
        return Number.isInteger(id) && id > 0 ? id : undefined;
    })
    .optional();

// วันที่จาก query string (ค่าที่ไม่ถูกต้องกลายเป็น undefined แทนการตอบ 400)
export const optionalDate = z
    .unknown()
    .transform((value) => {
        const date = typeof value === 'string' && value ? new Date(value) : null;
        return date && !Number.isNaN(date.getTime()) ? date : undefined;
    })
    .optional();

// true/false จาก query string ('true' | 'false' | ไม่ระบุ)
export const optionalBoolean = z
    .unknown()
    .transform((value) => (value === 'true' ? true : value === 'false' ? false : undefined))
    .optional();

export const optionalText = (max: number) =>
    z
        .unknown()
        .transform((value) => (typeof value === 'string' ? value.trim().slice(0, max) || undefined : undefined))
        .optional();
