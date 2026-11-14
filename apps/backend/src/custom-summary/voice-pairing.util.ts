// ==========================================
// 🔊 VOICE SESSION PAIRING ENGINE
// จับคู่เหตุการณ์ voiceJoin / voiceSwitch / voiceMoved / voiceLeave / voiceDisconnected
// ของแต่ละผู้ใช้ในแต่ละห้องอย่างแม่นยำ รวมถึงกรณีที่ผู้ใช้ยังอยู่ในห้องเสียง ณ เวลาตัดยอด (cutoff)
// ==========================================

export const VOICE_JOIN_EVENTS = new Set(['voiceJoin']);
export const VOICE_LEAVE_EVENTS = new Set(['voiceLeave', 'voiceDisconnected']);
export const VOICE_SWITCH_EVENTS = new Set(['voiceSwitch', 'voiceMoved']);
export const VOICE_LIFECYCLE_EVENTS = [
    ...VOICE_JOIN_EVENTS,
    ...VOICE_LEAVE_EVENTS,
    ...VOICE_SWITCH_EVENTS,
] as const;

const THAI_OFFSET_MS = 7 * 3_600_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const DEFAULT_MAX_UNCLOSED_MS = 24 * HOUR_MS;

export interface VoiceEventInput {
    id?: number;
    eventKey: string;
    userId: string | null;
    userName?: string | null;
    isBot?: boolean;
    channelId: string | null;
    channelName?: string | null;
    createdAt: Date | number | string;
}

export interface ActiveVoiceStateInput {
    userId: string;
    userName?: string | null;
    isBot?: boolean;
    channelId: string;
    channelName?: string | null;
}

export interface VoicePairingOptions {
    from: Date | number;
    to: Date | number;
    now?: Date | number;
    channelIds?: readonly string[];
    maxUnclosedMs?: number;
    activeVoiceStates?: readonly ActiveVoiceStateInput[];
}

export interface PairedVoiceSession {
    userId: string;
    userName: string;
    isBot: boolean;
    channelId: string;
    channelName: string;
    startMs: number;
    endMs: number;
    durationMs: number;
    ongoingAtCutoff: boolean;
}

export interface VoiceChannelAggregate {
    channelId: string;
    channelName: string;
    totalMs: number;
    totalSeconds: number;
    totalMinutes: number;
    joins: number;
    leaves: number;
    switches: number;
    sessions: number;
    avgSessionMinutes: number;
    uniqueUsers: number;
    activeAtCutoffCount: number;
}

export interface VoiceUserAggregate {
    userId: string;
    userName: string;
    isBot: boolean;
    totalMs: number;
    totalSeconds: number;
    totalMinutes: number;
    joins: number;
    leaves: number;
    switches: number;
    sessions: number;
    ongoingAtCutoff: boolean;
}

export interface VoicePairingResult {
    cutoffMs: number;
    sessions: PairedVoiceSession[];
    totals: {
        totalMs: number;
        totalSeconds: number;
        totalMinutes: number;
        joins: number;
        leaves: number;
        switches: number;
        sessions: number;
        avgSessionMinutes: number;
        activeAtCutoffCount: number;
    };
    byChannel: VoiceChannelAggregate[];
    byUser: VoiceUserAggregate[];
    bucketMs: Map<string, number>;
}

interface OpenSession {
    userId: string;
    userName: string;
    isBot: boolean;
    channelId: string;
    channelName: string;
    startedAtMs: number;
}

function toTimestamp(value: Date | number | string): number {
    if (typeof value === 'number') return value;
    if (value instanceof Date) return value.getTime();
    return new Date(value).getTime();
}

export function bangkokBucketKey(ms: number, interval: 'hour' | 'day'): string {
    const bangkok = new Date(ms + THAI_OFFSET_MS);
    const yyyy = bangkok.getUTCFullYear();
    const mm = String(bangkok.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(bangkok.getUTCDate()).padStart(2, '0');
    const hh = interval === 'hour' ? String(bangkok.getUTCHours()).padStart(2, '0') : '00';
    return `${yyyy}-${mm}-${dd} ${hh}:00`;
}

export function bangkokBucketLabel(bucket: string, interval: 'hour' | 'day'): string {
    const [date = '', time = ''] = bucket.split(' ');
    const [, month = '', day = ''] = date.split('-');
    return interval === 'hour' ? `${day}/${month} ${time.slice(0, 2)}:00` : `${day}/${month}`;
}

export function buildBangkokBuckets(fromMs: number, toMs: number, interval: 'hour' | 'day', maxBuckets = 2000): string[] {
    const step = interval === 'hour' ? HOUR_MS : DAY_MS;
    const labels: string[] = [];
    const seen = new Set<string>();
    const push = (ms: number) => {
        const key = bangkokBucketKey(ms, interval);
        if (!seen.has(key)) {
            seen.add(key);
            labels.push(key);
        }
    };
    // Align iteration to Bangkok step boundaries so no bucket is skipped
    const alignedStart = Math.floor((fromMs + THAI_OFFSET_MS) / step) * step - THAI_OFFSET_MS;
    for (let t = alignedStart; t <= toMs && labels.length < maxBuckets; t += step) {
        push(Math.max(t, fromMs));
    }
    push(toMs);
    return labels;
}

export function distributeDurationAcrossBuckets(
    startMs: number,
    endMs: number,
    interval: 'hour' | 'day',
    bucketMs: Map<string, number>,
): void {
    if (endMs <= startMs) return;
    const step = interval === 'hour' ? HOUR_MS : DAY_MS;
    let cursor = startMs;
    while (cursor < endMs) {
        const bangkokCursor = cursor + THAI_OFFSET_MS;
        const nextBoundaryBangkok = (Math.floor(bangkokCursor / step) + 1) * step;
        const nextBoundary = nextBoundaryBangkok - THAI_OFFSET_MS;
        const sliceEnd = Math.min(endMs, nextBoundary);
        const key = bangkokBucketKey(cursor, interval);
        bucketMs.set(key, (bucketMs.get(key) ?? 0) + (sliceEnd - cursor));
        cursor = sliceEnd;
    }
}

export function pairVoiceSessions(
    events: readonly VoiceEventInput[],
    options: VoicePairingOptions,
    interval: 'hour' | 'day' = 'day',
): VoicePairingResult {
    const fromMs = toTimestamp(options.from);
    const toMs = toTimestamp(options.to);
    const nowMs = toTimestamp(options.now ?? Date.now());
    const cutoffMs = Math.min(toMs, nowMs);
    const maxUnclosedMs = options.maxUnclosedMs ?? DEFAULT_MAX_UNCLOSED_MS;
    const channelFilter = options.channelIds?.length ? new Set(options.channelIds) : null;

    if (!Number.isFinite(fromMs) || !Number.isFinite(cutoffMs) || cutoffMs <= fromMs) {
        return {
            cutoffMs: Number.isFinite(cutoffMs) ? cutoffMs : fromMs,
            sessions: [],
            totals: {
                totalMs: 0,
                totalSeconds: 0,
                totalMinutes: 0,
                joins: 0,
                leaves: 0,
                switches: 0,
                sessions: 0,
                avgSessionMinutes: 0,
                activeAtCutoffCount: 0,
            },
            byChannel: [],
            byUser: [],
            bucketMs: new Map(),
        };
    }

    const activeVoiceByUser = new Map<string, ActiveVoiceStateInput>();
    for (const state of options.activeVoiceStates ?? []) {
        activeVoiceByUser.set(state.userId, state);
    }

    const normalized = events
        .filter((ev) => Boolean(ev.userId) && VOICE_LIFECYCLE_EVENTS.includes(ev.eventKey as (typeof VOICE_LIFECYCLE_EVENTS)[number]))
        .map((ev, index) => ({
            id: ev.id ?? index,
            eventKey: ev.eventKey,
            userId: ev.userId!,
            userName: ev.userName || ev.userId!,
            isBot: Boolean(ev.isBot),
            channelId: ev.channelId,
            channelName: ev.channelName || ev.channelId || 'ไม่ทราบห้องเสียง',
            at: toTimestamp(ev.createdAt),
        }))
        .filter((ev) => Number.isFinite(ev.at) && ev.at <= cutoffMs)
        .sort((a, b) => a.at - b.at || a.id - b.id);

    const openByUser = new Map<string, OpenSession>();
    const rawSessions: PairedVoiceSession[] = [];

    // Per-channel and per-user event counts strictly inside [fromMs, cutoffMs]
    const channelEventCounts = new Map<string, { channelName: string; joins: number; leaves: number; switches: number }>();
    const userEventCounts = new Map<string, { userName: string; isBot: boolean; joins: number; leaves: number; switches: number }>();

    const bumpChannelCount = (channelId: string | null, channelName: string, field: 'joins' | 'leaves' | 'switches') => {
        if (!channelId) return;
        const entry = channelEventCounts.get(channelId) ?? { channelName, joins: 0, leaves: 0, switches: 0 };
        if (channelName && entry.channelName === channelId) entry.channelName = channelName;
        entry[field] += 1;
        channelEventCounts.set(channelId, entry);
    };

    const bumpUserCount = (userId: string, userName: string, isBot: boolean, field: 'joins' | 'leaves' | 'switches') => {
        const entry = userEventCounts.get(userId) ?? { userName, isBot, joins: 0, leaves: 0, switches: 0 };
        if (userName && entry.userName === userId) entry.userName = userName;
        entry.isBot ||= isBot;
        entry[field] += 1;
        userEventCounts.set(userId, entry);
    };

    const emitSession = (session: OpenSession, endMs: number, ongoingAtCutoff: boolean) => {
        const clippedStart = Math.max(session.startedAtMs, fromMs);
        const clippedEnd = Math.min(endMs, cutoffMs);
        if (clippedEnd <= clippedStart) return;
        rawSessions.push({
            userId: session.userId,
            userName: session.userName,
            isBot: session.isBot,
            channelId: session.channelId,
            channelName: session.channelName,
            startMs: clippedStart,
            endMs: clippedEnd,
            durationMs: clippedEnd - clippedStart,
            ongoingAtCutoff,
        });
    };

    for (const ev of normalized) {
        const inRange = ev.at >= fromMs && ev.at <= cutoffMs;
        const prev = openByUser.get(ev.userId);

        if (VOICE_LEAVE_EVENTS.has(ev.eventKey)) {
            if (prev) {
                const effectiveEnd = maxUnclosedMs < Infinity ? Math.min(ev.at, prev.startedAtMs + maxUnclosedMs) : ev.at;
                emitSession(prev, effectiveEnd, false);
                openByUser.delete(ev.userId);
                if (inRange) bumpChannelCount(prev.channelId, prev.channelName, 'leaves');
            } else if (inRange && ev.channelId) {
                bumpChannelCount(ev.channelId, ev.channelName, 'leaves');
            }
            if (inRange && (!channelFilter || (prev ? channelFilter.has(prev.channelId) : ev.channelId ? channelFilter.has(ev.channelId) : false))) {
                bumpUserCount(ev.userId, ev.userName, ev.isBot, 'leaves');
            }
            continue;
        }

        if (VOICE_SWITCH_EVENTS.has(ev.eventKey)) {
            if (prev) {
                const effectiveEnd = maxUnclosedMs < Infinity ? Math.min(ev.at, prev.startedAtMs + maxUnclosedMs) : ev.at;
                emitSession(prev, effectiveEnd, false);
            }
            if (ev.channelId) {
                openByUser.set(ev.userId, {
                    userId: ev.userId,
                    userName: ev.userName,
                    isBot: ev.isBot,
                    channelId: ev.channelId,
                    channelName: ev.channelName,
                    startedAtMs: ev.at,
                });
                if (inRange) bumpChannelCount(ev.channelId, ev.channelName, 'switches');
            } else {
                openByUser.delete(ev.userId);
            }
            if (inRange && (!channelFilter || (ev.channelId && channelFilter.has(ev.channelId)))) {
                bumpUserCount(ev.userId, ev.userName, ev.isBot, 'switches');
            }
            continue;
        }

        // VOICE_JOIN_EVENTS
        if (prev) {
            const effectiveEnd = maxUnclosedMs < Infinity ? Math.min(ev.at, prev.startedAtMs + maxUnclosedMs) : ev.at;
            emitSession(prev, effectiveEnd, false);
            openByUser.delete(ev.userId);
        }
        if (ev.channelId) {
            openByUser.set(ev.userId, {
                userId: ev.userId,
                userName: ev.userName,
                isBot: ev.isBot,
                channelId: ev.channelId,
                channelName: ev.channelName,
                startedAtMs: ev.at,
            });
            if (inRange) {
                bumpChannelCount(ev.channelId, ev.channelName, 'joins');
                if (!channelFilter || channelFilter.has(ev.channelId)) {
                    bumpUserCount(ev.userId, ev.userName, ev.isBot, 'joins');
                }
            }
        }
    }

    // ปิด session ที่ยังค้างอยู่ในห้องเสียง ณ เวลาตัดยอด (cutoff)
    for (const session of openByUser.values()) {
        const liveState = activeVoiceByUser.get(session.userId);
        const confirmedLiveSameChannel = Boolean(liveState && liveState.channelId === session.channelId && toMs >= nowMs - 120_000);
        const effectiveEnd = confirmedLiveSameChannel || maxUnclosedMs === Infinity ? cutoffMs : Math.min(cutoffMs, session.startedAtMs + maxUnclosedMs);
        emitSession(session, effectiveEnd, true);
    }

    // หากมีสมาชิกอยู่ในห้องเสียงตอนนี้ตั้งแต่ก่อนช่วง lookback (เช่น อยู่มานานกว่า 24 ชม. ก่อนหน้า)
    if (toMs >= nowMs - 120_000 && activeVoiceByUser.size > 0) {
        for (const live of activeVoiceByUser.values()) {
            if (openByUser.has(live.userId)) continue;
            // ถ้าไม่มี event ในช่วงเลย แต่บอทยืนยันว่าคนนี้อยู่ในห้องเสียงตลอดช่วงถึงตอนนี้
            const hadAnyEvent = normalized.some((ev) => ev.userId === live.userId);
            if (!hadAnyEvent) {
                emitSession(
                    {
                        userId: live.userId,
                        userName: live.userName || live.userId,
                        isBot: Boolean(live.isBot),
                        channelId: live.channelId,
                        channelName: live.channelName || live.channelId,
                        startedAtMs: fromMs,
                    },
                    cutoffMs,
                    true,
                );
            }
        }
    }

    // กรองตามห้องที่เลือก *หลัง* จับคู่ session เสร็จ เพื่อให้ voiceSwitch ข้ามห้องคำนวณเวลาได้แม่นยำ
    const sessions = channelFilter ? rawSessions.filter((s) => channelFilter.has(s.channelId)) : rawSessions;

    const byChannelMap = new Map<
        string,
        {
            channelName: string;
            totalMs: number;
            sessions: number;
            users: Set<string>;
            activeUsers: Set<string>;
        }
    >();
    const byUserMap = new Map<
        string,
        {
            userName: string;
            isBot: boolean;
            totalMs: number;
            sessions: number;
            ongoingAtCutoff: boolean;
        }
    >();
    const activeCutoffUsers = new Set<string>();
    const bucketMs = new Map<string, number>();

    for (const s of sessions) {
        distributeDurationAcrossBuckets(s.startMs, s.endMs, interval, bucketMs);
        if (s.ongoingAtCutoff) activeCutoffUsers.add(s.userId);

        const ch = byChannelMap.get(s.channelId) ?? {
            channelName: s.channelName,
            totalMs: 0,
            sessions: 0,
            users: new Set(),
            activeUsers: new Set(),
        };
        ch.totalMs += s.durationMs;
        ch.sessions += 1;
        ch.users.add(s.userId);
        if (s.ongoingAtCutoff) ch.activeUsers.add(s.userId);
        byChannelMap.set(s.channelId, ch);

        const usr = byUserMap.get(s.userId) ?? {
            userName: s.userName,
            isBot: s.isBot,
            totalMs: 0,
            sessions: 0,
            ongoingAtCutoff: false,
        };
        usr.totalMs += s.durationMs;
        usr.sessions += 1;
        usr.ongoingAtCutoff ||= s.ongoingAtCutoff;
        byUserMap.set(s.userId, usr);
    }

    const allChannelIds = new Set<string>([
        ...byChannelMap.keys(),
        ...[...channelEventCounts.keys()].filter((id) => !channelFilter || channelFilter.has(id)),
    ]);

    const byChannel: VoiceChannelAggregate[] = [...allChannelIds]
        .map((channelId) => {
            const agg = byChannelMap.get(channelId);
            const cnt = channelEventCounts.get(channelId);
            const totalMs = agg?.totalMs ?? 0;
            const totalSeconds = Math.round(totalMs / 1000);
            const totalMinutes = Math.round(totalMs / 60_000);
            const sessionCount = agg?.sessions ?? 0;
            return {
                channelId,
                channelName: agg?.channelName || cnt?.channelName || channelId,
                totalMs,
                totalSeconds,
                totalMinutes,
                joins: cnt?.joins ?? 0,
                leaves: cnt?.leaves ?? 0,
                switches: cnt?.switches ?? 0,
                sessions: sessionCount,
                avgSessionMinutes: sessionCount > 0 ? Math.round((totalMs / 60_000 / sessionCount) * 10) / 10 : 0,
                uniqueUsers: agg?.users.size ?? 0,
                activeAtCutoffCount: agg?.activeUsers.size ?? 0,
            };
        })
        .sort((a, b) => b.totalMs - a.totalMs || b.joins - a.joins);

    const allUserIds = new Set<string>([...byUserMap.keys(), ...userEventCounts.keys()]);
    const byUser: VoiceUserAggregate[] = [...allUserIds]
        .map((userId) => {
            const agg = byUserMap.get(userId);
            const cnt = userEventCounts.get(userId);
            const totalMs = agg?.totalMs ?? 0;
            return {
                userId,
                userName: agg?.userName || cnt?.userName || userId,
                isBot: agg?.isBot ?? cnt?.isBot ?? false,
                totalMs,
                totalSeconds: Math.round(totalMs / 1000),
                totalMinutes: Math.round(totalMs / 60_000),
                joins: cnt?.joins ?? 0,
                leaves: cnt?.leaves ?? 0,
                switches: cnt?.switches ?? 0,
                sessions: agg?.sessions ?? 0,
                ongoingAtCutoff: agg?.ongoingAtCutoff ?? false,
            };
        })
        .sort((a, b) => b.totalMs - a.totalMs || b.joins - a.joins);

    const totalMs = sessions.reduce((sum, s) => sum + s.durationMs, 0);
    const totalSeconds = Math.round(totalMs / 1000);
    const totalMinutes = Math.round(totalMs / 60_000);
    const joins = byChannel.reduce((sum, ch) => sum + ch.joins, 0);
    const leaves = byChannel.reduce((sum, ch) => sum + ch.leaves, 0);
    const switches = byChannel.reduce((sum, ch) => sum + ch.switches, 0);
    const sessionCount = sessions.length;

    return {
        cutoffMs,
        sessions,
        totals: {
            totalMs,
            totalSeconds,
            totalMinutes,
            joins,
            leaves,
            switches,
            sessions: sessionCount,
            avgSessionMinutes: sessionCount > 0 ? Math.round((totalMs / 60_000 / sessionCount) * 10) / 10 : 0,
            activeAtCutoffCount: activeCutoffUsers.size,
        },
        byChannel,
        byUser,
        bucketMs,
    };
}
