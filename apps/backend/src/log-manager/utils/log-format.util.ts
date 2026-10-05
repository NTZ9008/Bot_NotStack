import type { LogField, UserLike } from '../interfaces/log-payload.interface';

// ตัดข้อความให้ไม่เกินลิมิตของ Discord (field 1024 / description 4096)
export function trim(text: unknown, max = 1024): string {
    const str = String(text ?? '').trim();
    if (!str) return '';
    return str.length > max ? `${str.slice(0, max - 3)}...` : str;
}

export function field(name: string, value: unknown, inline = true): LogField | null {
    const trimmed = trim(value);
    if (!trimmed) return null;
    return { name, value: trimmed, inline };
}

export function userLine(user: UserLike | null | undefined): string {
    if (!user) return 'ไม่ทราบ';
    return `<@${user.id}>`;
}

export function executorLine(info: { executor?: { id: string } | null; entry?: { executorId?: string | null } } | null | undefined): string {
    const id = info?.executor?.id || info?.entry?.executorId;
    return id ? `<@${id}>` : 'ไม่ทราบ';
}

export const unixSeconds = (ms: number) => Math.floor(ms / 1000);
