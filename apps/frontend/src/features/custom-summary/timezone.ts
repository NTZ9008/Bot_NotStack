const BANGKOK_TZ = 'Asia/Bangkok';
const INPUT_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** แปลง Date เป็นสตริง YYYY-MM-DDTHH:mm ตามเวลาไทย (Asia/Bangkok) เพื่อใส่ใน input datetime-local */
export function toBangkokInput(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: BANGKOK_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(date);

    const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '00';
    const hour = pick('hour') === '24' ? '00' : pick('hour');
    return `${pick('year')}-${pick('month')}-${pick('day')}T${hour}:${pick('minute')}`;
}

/** แปลงสตริง YYYY-MM-DDTHH:mm (เวลาไทย UTC+7) ให้เป็น Date/UTC จริง */
export function fromBangkokInput(input: string): Date | null {
    const match = INPUT_DATETIME_RE.exec(input.trim());
    if (!match) return null;
    const [, y, m, d, hh, mm] = match;
    const date = new Date(`${y}-${m}-${d}T${hh}:${mm}:00+07:00`);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function bangkokPresetInputs(hours: number, now = new Date()): { fromInput: string; toInput: string; fromIso: string; toIso: string } {
    const fromDate = new Date(now.getTime() - hours * 3_600_000);
    return {
        fromInput: toBangkokInput(fromDate),
        toInput: toBangkokInput(now),
        fromIso: fromDate.toISOString(),
        toIso: now.toISOString(),
    };
}

export function formatBangkokDateTime(value: string | Date): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return `${new Intl.DateTimeFormat('th-TH', {
        timeZone: BANGKOK_TZ,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(date)} น.`;
}

export function formatBangkokShortTime(value: string | Date): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return `${new Intl.DateTimeFormat('th-TH', {
        timeZone: BANGKOK_TZ,
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(date)} น.`;
}

export function formatThaiDuration(totalSeconds: number): string {
    const safe = Math.max(0, Math.round(totalSeconds));
    if (safe === 0) return '0 นาที';
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    if (hours === 0) return `${minutes} นาที`;
    return `${hours.toLocaleString('en-US')} ชม. ${minutes} นาที`;
}
