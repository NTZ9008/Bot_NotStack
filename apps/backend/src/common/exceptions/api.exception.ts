import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiErrorBody } from '@notstack/shared';

/**
 * error ที่ตั้งใจส่งกลับให้ผู้ใช้อ่าน — ตอบเป็น { error, code?, ...extra } เหมือน API เดิม
 * (หน้าเว็บแสดง error เป็นข้อความได้เลย)
 */
export class ApiException extends HttpException {
    constructor(status: HttpStatus | number, message: string, code?: string, extra: Record<string, unknown> = {}) {
        const body: ApiErrorBody = { error: message, ...(code ? { code } : {}), ...extra };
        super(body, status);
        // HttpException ตั้ง message จาก body.message เท่านั้น (ไม่มีก็ได้ชื่อคลาส "Api Exception") — โค้ดที่ log / บันทึก err.message จะได้ข้อความจริง
        this.message = message;
    }
}

export const badRequest = (message: string) => new ApiException(HttpStatus.BAD_REQUEST, message);
export const forbidden = (message: string) => new ApiException(HttpStatus.FORBIDDEN, message);
export const notFound = (message: string) => new ApiException(HttpStatus.NOT_FOUND, message);
export const conflict = (message: string) => new ApiException(HttpStatus.CONFLICT, message);
export const serviceUnavailable = (message: string) => new ApiException(HttpStatus.SERVICE_UNAVAILABLE, message);

// Prisma: unique constraint ชน
export const isUniqueViolation = (err: unknown): boolean =>
    typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';
