import { notFound } from '../exceptions/api.exception';

// id จาก path (/users/:id) — ค่าที่ไม่ใช่เลขบวกถือว่าไม่พบ
export function parseId(value: unknown): number | null {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

export function requireId(value: unknown, message: string): number {
    const id = parseId(value);
    if (!id) throw notFound(message);
    return id;
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// วันเวลาแบบไทยที่ใช้ในไฟล์ log เดิม
export const thaiTimestamp = (date = new Date()) => date.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

// วันที่ตามเวลาไทย (YYYY-MM-DD) — ใช้เป็นชื่อไฟล์ log รายวัน / ตัดรอบโควตาต่อวัน
export const bangkokDay = (date = new Date()): string => new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 10);
