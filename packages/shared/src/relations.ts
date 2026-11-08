import { z } from 'zod';
import type { ActivityPage } from './admin';

// ==========================================
// 🕵️ RELATION BOARD — กระดานความสัมพันธ์ของสมาชิก คำนวณจากตาราง activity_events ล้วนๆ
// voice = อยู่ห้องเสียงเดียวกัน, chat = ส่งข้อความต่อกันในห้องเดียวกัน, mod = แอดมินลงมือกับอีกคน
// ==========================================
export type RelationKind = 'voice' | 'chat' | 'mod';
export type RelationTier = 1 | 2 | 3 | 4;
export type RelationPersonStatus = 'member' | 'left' | 'kicked' | 'banned';

export interface RelationCounts {
    voiceMinutes: number;
    chatExchanges: number;
    modActions: number;
}

// ส่งข้อความต่อกันภายในเวลานี้ถึงจะนับว่า "คุยกัน"
export const RELATION_CHAT_WINDOW_MINUTES = 3;

// 1 นาทีในห้องเสียง = 1 คะแนน
const RELATION_WEIGHT = { voice: 1, chat: 2, mod: 15 } as const;
// คะแนนขั้นต่ำของเส้นระดับ 2 / 3 / 4 (ต่ำกว่านี้เป็นเส้นด้ายธรรมดา ไม่มีสี)
export const RELATION_TIER_SCORES = [30, 120, 480] as const;

const parts = ({ voiceMinutes, chatExchanges, modActions }: RelationCounts) =>
    [
        ['voice', voiceMinutes * RELATION_WEIGHT.voice],
        ['chat', chatExchanges * RELATION_WEIGHT.chat],
        ['mod', modActions * RELATION_WEIGHT.mod],
    ] as const;

export function relationScore(counts: RelationCounts): number {
    return parts(counts).reduce((total, [, value]) => total + value, 0);
}

// ความสัมพันธ์แบบไหนให้คะแนนมากสุด — เท่ากันให้ลำดับ voice ก่อน chat ก่อน mod
export function relationKind(counts: RelationCounts): RelationKind {
    return parts(counts).reduce((best, part) => (part[1] > best[1] ? part : best))[0];
}

export function relationTier(score: number): RelationTier {
    return (1 + RELATION_TIER_SCORES.filter((min) => score >= min).length) as RelationTier;
}

export const RELATION_KIND_LABELS: Record<RelationKind, string> = {
    voice: 'อยู่ห้องเสียงด้วยกัน',
    chat: 'คุยกันในแชท',
    mod: 'แอดมินลงมือ',
};

export const RELATION_STATUS_LABELS: Record<Exclude<RelationPersonStatus, 'member'>, string> = {
    left: 'ออกจากเซิร์ฟเวอร์',
    kicked: 'ถูกเตะ',
    banned: 'ถูกแบน',
};

export const relationBoardQuerySchema = z.object({
    days: z.coerce.number().int().min(1).max(365).catch(30),
    includeBots: z
        .unknown()
        .transform((value) => value === 'true')
        .optional(),
});
export type RelationBoardQuery = z.output<typeof relationBoardQuerySchema>;

export const relationHistoryQuerySchema = z.object({
    cursor: z.coerce.number().int().positive().optional().catch(undefined),
});

export interface RelationPerson {
    userId: string;
    name: string;
    avatarUrl: string | null;
    isBot: boolean;
    status: RelationPersonStatus;
    leftAt: string | null;
    events: number;
    lastSeen: string | null;
}

export interface RelationLink extends RelationCounts {
    id: string;
    a: string;
    b: string;
    score: number;
    kind: RelationKind;
    tier: RelationTier;
}

export interface RelationBoard {
    from: string;
    to: string;
    people: RelationPerson[];
    links: RelationLink[];
    // จำนวนคนที่ไม่ได้ขึ้นกระดาน (เกินจำนวนสูงสุด เลือกคนที่มีความสัมพันธ์มากสุดก่อน)
    hiddenPeople: number;
}

export type RelationTimelineItem =
    | { type: 'voice'; at: string; endAt: string; minutes: number; channelName: string | null }
    | { type: 'chat'; at: string; exchanges: number; channelName: string | null }
    | { type: 'mod'; at: string; label: string; actorId: string; actorName: string | null; targetName: string | null; summary: string | null };

export interface RelationLinkDetail extends RelationCounts {
    a: string;
    b: string;
    score: number;
    kind: RelationKind;
    tier: RelationTier;
    timeline: RelationTimelineItem[];
    // ตัดรายการเก่าออกจาก timeline หรือไม่ (ตัวเลขสรุปยังนับครบ)
    truncated: boolean;
}

export type RelationHistoryPage = ActivityPage;
