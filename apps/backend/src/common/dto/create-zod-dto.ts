import type { z, ZodType } from 'zod';

// ==========================================
// 🧾 DTO จาก zod schema — schema ตัวเดียวกับที่หน้าเว็บใช้ (@notstack/shared)
//   export class LoginDto extends createZodDto(loginSchema) {}
//   login(@Body() body: LoginDto)
// ZodValidationPipe (global) อ่าน static schema ของคลาสแล้วตรวจ body / query ให้เอง
// ==========================================
export interface ZodDto<T extends ZodType = ZodType> {
    new (): z.output<T>;
    readonly schema: T;
}

export function createZodDto<T extends ZodType>(schema: T): ZodDto<T> {
    class ZodDtoClass {
        static readonly schema = schema;
    }
    return ZodDtoClass as unknown as ZodDto<T>;
}

export const isZodDto = (metatype: unknown): metatype is ZodDto =>
    typeof metatype === 'function' && typeof (metatype as { schema?: { safeParse?: unknown } }).schema?.safeParse === 'function';
