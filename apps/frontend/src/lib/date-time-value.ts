// ค่าของช่องวัน/เวลา (string แบบเดียวกับ <input type="date|datetime-local|time">) — ไม่พึ่ง lib อื่น จึงทดสอบด้วย Node ได้
export type DateTimeMode = 'date' | 'datetime' | 'time';

export const pad = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function parseDateTimeValue(value: string, mode: DateTimeMode): { date?: Date; time?: string } {
    const [datePart, timePart] = mode === 'time' ? ['', value] : value.split('T');
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart ?? '');
    const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
    const time = /^\d{2}:\d{2}/.test(timePart ?? '') ? timePart!.slice(0, 5) : undefined;
    return { date, time };
}

export function buildDateTimeValue(mode: DateTimeMode, date: Date | undefined, time: string | undefined): string {
    if (mode === 'time') return time ?? '';
    if (!date) return '';
    return mode === 'date' ? toDateStr(date) : `${toDateStr(date)}T${time ?? '00:00'}`;
}
