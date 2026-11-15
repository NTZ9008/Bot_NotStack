import {
    relationKind,
    relationScore,
    relationTier,
    type RelationActivityKind,
    type RelationCounts,
    type RelationLink,
    type RelationPersonStatus,
    type RelationPresence,
} from '@notstack/shared';
import { ActivityType } from 'discord.js';

const MAX_VOICE_SESSION_MS = 12 * 60 * 60 * 1000; // บอทดับระหว่างทางทำให้ไม่เห็นตอนออก — ไม่ให้ session เดียวยาวเกินจริง
const MIN_VOICE_OVERLAP_MS = 60 * 1000; // แวะเข้ามาแป๊บเดียวไม่นับว่าอยู่ด้วยกัน

const VOICE_OPENERS = new Set(['voiceJoin', 'voiceSwitch', 'voiceMoved']);

export interface VoiceEvent {
    eventKey: string;
    userId: string;
    channelId: string;
    channelName: string | null;
    at: number;
}

export interface VoiceSession {
    userId: string;
    channelId: string;
    channelName: string | null;
    start: number;
    end: number;
}

export interface VoiceOverlap {
    a: string;
    b: string;
    channelName: string | null;
    start: number;
    end: number;
}

export const pairKey = (a: string, b: string): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

// ต่อเหตุการณ์ของแต่ละคนเป็นช่วงที่อยู่ในห้องเสียง — เหตุการณ์ถัดไปของคนเดียวกันคือจุดจบของช่วงก่อนหน้าเสมอ
export function buildVoiceSessions(events: readonly VoiceEvent[], rangeEnd: number): VoiceSession[] {
    const open = new Map<string, Omit<VoiceSession, 'end'>>();
    const sessions: VoiceSession[] = [];
    const close = (session: Omit<VoiceSession, 'end'>, end: number) => {
        const capped = Math.min(end, session.start + MAX_VOICE_SESSION_MS);
        if (capped > session.start) sessions.push({ ...session, end: capped });
    };
    for (const event of [...events].sort((x, y) => x.at - y.at)) {
        const current = open.get(event.userId);
        if (current) close(current, event.at);
        open.delete(event.userId);
        if (VOICE_OPENERS.has(event.eventKey)) {
            open.set(event.userId, { userId: event.userId, channelId: event.channelId, channelName: event.channelName, start: event.at });
        }
    }
    for (const session of open.values()) close(session, rangeEnd);
    return sessions;
}

export function forEachVoiceOverlap(sessions: readonly VoiceSession[], visit: (overlap: VoiceOverlap) => void): void {
    const channels = new Map<string, VoiceSession[]>();
    for (const session of sessions) {
        const list = channels.get(session.channelId);
        if (list) list.push(session);
        else channels.set(session.channelId, [session]);
    }
    for (const list of channels.values()) {
        list.sort((x, y) => x.start - y.start);
        let active: VoiceSession[] = [];
        for (const session of list) {
            active = active.filter((other) => other.end > session.start);
            for (const other of active) {
                const end = Math.min(other.end, session.end);
                if (other.userId === session.userId || end - session.start < MIN_VOICE_OVERLAP_MS) continue;
                visit({ a: other.userId, b: session.userId, channelName: session.channelName ?? other.channelName, start: session.start, end });
            }
            active.push(session);
        }
    }
}

export function createLink(a: string, b: string, counts: RelationCounts): RelationLink {
    const score = relationScore(counts);
    const [first, second] = a < b ? [a, b] : [b, a];
    return { id: `${first}:${second}`, a: first, b: second, ...counts, score, kind: relationKind(counts), tier: relationTier(score) };
}

export interface MembershipEvent {
    eventKey: string;
    at: Date;
}

export interface Departure {
    status: Exclude<RelationPersonStatus, 'member'>;
    at: Date;
}

// สถานะล่าสุดจาก log — เข้าใหม่/ปลดแบนล้างสถานะเดิม, แบนและเตะมักมี memberLeave ตามมาจึงให้น้ำหนักมากกว่าการออกเอง
export function departureFromEvents(events: readonly MembershipEvent[]): Departure | null {
    let result = null as Departure | null;
    for (const event of [...events].sort((x, y) => x.at.getTime() - y.at.getTime())) {
        if (event.eventKey === 'memberJoin' || event.eventKey === 'memberUnban') result = null;
        else if (event.eventKey === 'memberBan') result = { status: 'banned', at: event.at };
        else if (event.eventKey === 'memberKick') result = result?.status === 'banned' ? result : { status: 'kicked', at: event.at };
        else if (event.eventKey === 'memberLeave') result ??= { status: 'left', at: event.at };
    }
    return result;
}

// isMember = null คือเช็คกับ Discord ไม่สำเร็จ — เชื่อ log แทน และไม่กากบาทคนที่ไม่มีหลักฐานว่าออกไปแล้ว
export function resolveStatus(isMember: boolean | null, events: readonly MembershipEvent[]): { status: RelationPersonStatus; leftAt: string | null } {
    if (isMember) return { status: 'member', leftAt: null };
    const departure = departureFromEvents(events);
    if (departure) return { status: departure.status, leftAt: departure.at.toISOString() };
    return { status: isMember === false ? 'left' : 'member', leftAt: null };
}

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' });

export interface ChatExchangeRow {
    at: Date;
    channelId: string;
    channelName: string | null;
}

// รวมการคุยกันเป็นรายวันต่อห้อง (เวลาไทย) ไม่ให้ timeline ยาวเป็นพันบรรทัด
export function groupChatExchanges(rows: readonly ChatExchangeRow[]): { at: Date; exchanges: number; channelName: string | null }[] {
    const groups = new Map<string, { at: Date; exchanges: number; channelName: string | null }>();
    for (const row of rows) {
        const key = `${dayFormat.format(row.at)}:${row.channelId}`;
        const group = groups.get(key);
        if (!group) groups.set(key, { at: row.at, exchanges: 1, channelName: row.channelName });
        else {
            group.exchanges += 1;
            if (row.at > group.at) group.at = row.at;
            group.channelName ||= row.channelName;
        }
    }
    return [...groups.values()];
}

const PRESENCE_TEXT_MAX = 128;
const clip = (text: string | null | undefined): string | null => text?.slice(0, PRESENCE_TEXT_MAX) || null;

const ACTIVITY_KINDS = new Map<number, RelationActivityKind>([
    [ActivityType.Playing, 'playing'],
    [ActivityType.Streaming, 'streaming'],
    [ActivityType.Listening, 'listening'],
    [ActivityType.Watching, 'watching'],
    [ActivityType.Competing, 'competing'],
]);

export interface PresenceLike {
    status: string;
    activities: readonly {
        type: number;
        name: string;
        details?: string | null;
        state?: string | null;
        emoji?: { id?: string | null; name?: string | null } | null;
    }[];
}

export function toRelationPresence(presence: PresenceLike): RelationPresence {
    const custom = presence.activities.find((activity) => activity.type === ActivityType.Custom);
    const main = presence.activities.find((activity) => ACTIVITY_KINDS.has(activity.type));
    // อีโมจิของเซิร์ฟเวอร์เป็นรูป แสดงเป็นข้อความไม่ได้ จึงเก็บเฉพาะอีโมจิมาตรฐาน
    const emoji = custom?.emoji && !custom.emoji.id ? custom.emoji.name : null;
    return {
        status: presence.status === 'online' || presence.status === 'idle' || presence.status === 'dnd' ? presence.status : 'offline',
        activity: main ? { kind: ACTIVITY_KINDS.get(main.type)!, name: clip(main.name) ?? '', detail: clip(main.details ?? main.state) } : null,
        customStatus: clip([emoji, custom?.state].filter(Boolean).join(' ')),
    };
}
