import { ACTIVITY_ONLY_EVENTS, LOG_EVENT_MAP } from '@notstack/shared';

// ชื่อ + กลุ่มของเหตุการณ์ที่แสดงในหน้าเว็บ (event ที่ไม่รู้จักแสดงเป็น key ในกลุ่ม "อื่นๆ")
export function activityEventLabel(eventKey: string): { label: string; group: string } {
    const meta = LOG_EVENT_MAP.get(eventKey) ?? ACTIVITY_ONLY_EVENTS[eventKey as keyof typeof ACTIVITY_ONLY_EVENTS];
    return { label: meta?.label || eventKey, group: meta?.group || 'อื่นๆ' };
}

// ตัวช่วยหาชื่อจาก ID (คืน null ถ้าไม่อยู่ใน cache — จะแสดงเป็น ID แทน)
export interface MentionResolvers {
    user(id: string): string | null;
    role(id: string): string | null;
    channel(id: string): string | null;
}

// แปลง mention ของ Discord ให้อ่านออกในหน้าเว็บ (<@123> → @ชื่อ, <#123> → #ห้อง, <t:...> → วันเวลา)
export function humanizeMentions(text: unknown, resolve: MentionResolvers): string {
    if (!text) return '';
    return (
        String(text)
            // รูปแบบเก่าของ userLine() ("<@id>\n`tag`") — ยุบให้เหลือชื่อเดียว
            .replace(/<@!?(\d+)>\s*`[^`]*`/g, (_, id: string) => `@${resolve.user(id) || id}`)
            .replace(/<@!?(\d+)>/g, (_, id: string) => `@${resolve.user(id) || id}`)
            .replace(/<@&(\d+)>/g, (_, id: string) => `@${resolve.role(id) || id}`)
            .replace(/<#(\d+)>/g, (_, id: string) => `#${resolve.channel(id) || id}`)
            .replace(/<t:(\d+)(?::[tTdDfFR])?>/g, (_, sec: string) =>
                new Date(Number(sec) * 1000).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }),
            )
            .replace(/`/g, '')
            .replace(/\s*\n\s*/g, ' · ')
            .trim()
    );
}
