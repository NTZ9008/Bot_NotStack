// รูปแบบวันที่/ตัวเลขแบบไทยที่ใช้ทั้งหน้าเว็บ
export function formatDateTime(value: string | number | Date | null | undefined): string {
    return value ? new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

export const formatNumber = (value: number | null | undefined): string => Number(value || 0).toLocaleString('th-TH');

export function formatMinutes(minutes: number): string {
    if (!minutes) return '0 นาที';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins} นาที`;
    return mins === 0 ? `${hours} ชม.` : `${hours} ชม. ${mins} นาที`;
}

export function formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// เวลาที่เหลือแบบ HH:MM:SS
export function formatCountdown(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

export const nowTimeLabel = () => `วันนี้ ${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`;

// ค่าสำหรับ <input type="datetime-local"> (เวลาท้องถิ่น)
export const toLocalInput = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export const DEFAULT_AVATAR = 'https://cdn.discordapp.com/embed/avatars/0.png';

export function fallbackAvatar(userId: string): string {
    return `https://cdn.discordapp.com/embed/avatars/${/^\d{5,25}$/.test(userId) ? Number(BigInt(userId) % 5n) : 0}.png`;
}
