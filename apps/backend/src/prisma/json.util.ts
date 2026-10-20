import type { Prisma } from '../generated/prisma/client';

// ค่าที่เก็บลงคอลัมน์ JSON (ตั้งค่า / ดีไซน์ / ประวัติ) — type ของเราไม่มี index signature จึงต้อง cast ที่จุดเดียวตรงนี้
export const toJsonValue = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
