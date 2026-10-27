import { ACTIVITY_ONLY_EVENTS, LOG_EVENT_MAP } from './log-manager';

// ==========================================
// 🌏 LIVE ACTIVITY — เหตุการณ์สดสำหรับลูกโลก 3D (Server-Sent Events)
// GET /api/live (ต้อง login — เฉพาะเซิร์ฟเวอร์ที่ผู้ใช้จัดการได้) ; หน้า landing ใช้ข้อมูลจำลองที่สร้างฝั่งหน้าเว็บ ไม่ต่อ API
// ตำแหน่งบนลูกโลกเป็นของ "เซิร์ฟเวอร์" (สถานที่ในหน้ารายงานอากาศ หรือภาษาหลักของเซิร์ฟเวอร์) ไม่ใช่ตำแหน่งจริงของสมาชิก
// ==========================================

// ชนิดเหตุการณ์ที่ลูกโลกแยกสี
export const LIVE_KINDS = ['message', 'voice', 'member', 'command', 'pr', 'moderation', 'other'] as const;
export type LiveKind = (typeof LIVE_KINDS)[number];

export const LIVE_KIND_META: Record<LiveKind, { label: string; color: string }> = {
    message: { label: 'ข้อความ', color: '#818cf8' },
    voice: { label: 'ห้องเสียง', color: '#38bdf8' },
    member: { label: 'สมาชิก', color: '#34d399' },
    command: { label: 'คำสั่งบอท', color: '#fbbf24' },
    pr: { label: 'Pull Request', color: '#e879f9' },
    moderation: { label: 'ดูแลเซิร์ฟเวอร์', color: '#f87171' },
    other: { label: 'อื่นๆ', color: '#94a3b8' },
};

export interface LivePoint {
    lat: number;
    lon: number;
}

// จุดศูนย์กลางของเซิร์ฟเวอร์บนลูกโลก
export interface LiveHub extends LivePoint {
    key: string;
    guildId: string;
    name: string;
    iconUrl: string | null;
}

export interface LiveEvent {
    id: number;
    kind: LiveKind;
    eventKey: string;
    at: string;
    // จุดที่เกิด (กระจายรอบเซิร์ฟเวอร์ตามผู้ใช้) → วิ่งเป็นเส้นโค้งไปหา hub
    from: LivePoint;
    hub: string;
    guildId: string;
    guildName?: string;
    userName: string | null;
    channelName: string | null;
    summary: string | null;
}

export interface LiveStats {
    // จำนวนเหตุการณ์ใน 60 วินาทีล่าสุด แยกตามชนิด
    perMinute: Record<LiveKind, number>;
    total: number;
}

// event แรกหลังต่อสำเร็จ — ของที่ต้องใช้วาดลูกโลกทันทีโดยไม่ต้องรอเหตุการณ์ใหม่
export interface LiveHello {
    hubs: LiveHub[];
    recent: LiveEvent[];
    stats: LiveStats;
}

// event ที่ส่งเป็นชุด (รวมทุก ~0.5 วินาที) + สถิติล่าสุด
export interface LiveBatch {
    events: LiveEvent[];
    stats: LiveStats;
    // จำนวนที่ตัดทิ้งเพราะเยอะเกินจะวาดทัน (ยังนับใน stats)
    dropped: number;
}

// eventKey ของ Log Manager → ชนิดบนลูกโลก
export function liveKindOf(eventKey: string): LiveKind {
    if (eventKey === 'messageSent' || eventKey.startsWith('message')) return 'message';
    if (eventKey === 'commandUsed') return 'command';
    if (eventKey.startsWith('voice')) return 'voice';
    if (eventKey.startsWith('pr')) return 'pr';
    if (/ban|kick|timeout|automod|filterUsed/i.test(eventKey)) return 'moderation';
    if (eventKey.startsWith('member')) return 'member';
    return 'other';
}

export function emptyLiveStats(): LiveStats {
    return { perMinute: Object.fromEntries(LIVE_KINDS.map((kind) => [kind, 0])) as Record<LiveKind, number>, total: 0 };
}

const PR_LABELS: Record<string, string> = { prOpened: 'เปิด Pull Request', prMerged: 'Merge Pull Request' };

// ชื่อเหตุการณ์ภาษาไทยสำหรับรายการสด
export function liveEventLabel(eventKey: string): string {
    return (
        PR_LABELS[eventKey] ??
        ACTIVITY_ONLY_EVENTS[eventKey as keyof typeof ACTIVITY_ONLY_EVENTS]?.label ??
        LOG_EVENT_MAP.get(eventKey)?.label ??
        LIVE_KIND_META[liveKindOf(eventKey)].label
    );
}
