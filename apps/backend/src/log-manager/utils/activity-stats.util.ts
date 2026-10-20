import type { ActivityStats } from '@notstack/shared';

// จัดกลุ่มเหตุการณ์สำหรับกราฟหน้า Overview
export const SERVER_JOIN_KEYS = ['memberJoin'];
export const SERVER_LEAVE_KEYS = ['memberLeave', 'memberKick', 'memberBan', 'memberPrune'];
export const VOICE_JOIN_KEYS = ['voiceJoin'];
export const VOICE_LEAVE_KEYS = ['voiceLeave', 'voiceDisconnected'];
// ย้ายห้อง = ออกจากห้องเดิมแล้วเข้าห้องใหม่ทันที (ใช้ตอนคำนวณเวลาอยู่ในห้องเสียง)
export const VOICE_SWITCH_KEYS = ['voiceSwitch', 'voiceMoved'];
export const VOICE_KEYS = [...VOICE_JOIN_KEYS, ...VOICE_LEAVE_KEYS, ...VOICE_SWITCH_KEYS];

const MAX_BUCKETS = 2000;

// ชื่อช่วงเวลาในรูปแบบเดียวกับที่ SQL คืนมา ('YYYY-MM-DD HH:00' ตามโซนเวลาที่เลือก)
export function formatBucket(date: Date, timeZone: string, interval: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
    })
        .formatToParts(date)
        .reduce<Record<string, string>>((acc, part) => {
            acc[part.type] = part.value;
            return acc;
        }, {});
    return `${parts.year}-${parts.month}-${parts.day} ${interval === 'hour' ? parts.hour : '00'}:00`;
}

// เติมช่วงเวลาที่ไม่มีเหตุการณ์ให้ครบ เพื่อให้เส้นกราฟไม่ขาดช่วง
export function bucketLabels(from: Date, to: Date, interval: string, timeZone: string): string[] {
    const step = interval === 'hour' ? 3600000 : 86400000;
    const labels: string[] = [];
    const seen = new Set<string>();
    const push = (date: Date) => {
        const label = formatBucket(date, timeZone, interval);
        if (seen.has(label)) return;
        seen.add(label);
        labels.push(label);
    };
    for (let t = from.getTime(); t <= to.getTime() && labels.length < MAX_BUCKETS; t += step) push(new Date(t));
    push(to); // ช่องสุดท้ายต้องครอบคลุมเวลาสิ้นสุดเสมอ
    return labels;
}

// รวมยอดรายช่วงเวลา (จาก SQL) เป็นชุดข้อมูลกราฟแต่ละเส้น เรียงตาม labels
export function buildDatasets(labels: string[], series: { bucket: string; eventKey: string; total: number }[]): ActivityStats['datasets'] {
    const index = new Map(labels.map((label, i) => [label, i]));
    const emptySeries = () => new Array<number>(labels.length).fill(0);
    const datasets = {
        serverJoin: emptySeries(),
        serverLeave: emptySeries(),
        voiceJoin: emptySeries(),
        voiceLeave: emptySeries(),
        total: emptySeries(),
    };

    for (const point of series) {
        const i = index.get(point.bucket);
        if (i === undefined) continue;
        datasets.total[i]! += point.total;
        if (SERVER_JOIN_KEYS.includes(point.eventKey)) datasets.serverJoin[i]! += point.total;
        else if (SERVER_LEAVE_KEYS.includes(point.eventKey)) datasets.serverLeave[i]! += point.total;
        if (VOICE_JOIN_KEYS.includes(point.eventKey)) datasets.voiceJoin[i]! += point.total;
        else if (VOICE_LEAVE_KEYS.includes(point.eventKey)) datasets.voiceLeave[i]! += point.total;
    }
    return datasets;
}

// ยอดรวมของแต่ละชนิดเหตุการณ์ทั้งช่วง (มากไปน้อย, เท่ากันเรียงตามชื่อ key)
export function breakdownFromSeries(series: { eventKey: string; total: number }[]): { eventKey: string; total: number }[] {
    const totals = new Map<string, number>();
    for (const point of series) totals.set(point.eventKey, (totals.get(point.eventKey) ?? 0) + point.total);
    return [...totals.entries()].map(([eventKey, total]) => ({ eventKey, total })).sort((a, b) => b.total - a.total || a.eventKey.localeCompare(b.eventKey));
}

// ยอดเวลาในห้องเสียงต่อ (คน, ห้อง) ที่ SQL รวมมาแล้ว — ms = เวลารวมของ session ที่ยาวกว่า 0
export interface VoicePair {
    userId: string;
    userName: string | null;
    channelId: string | null;
    channelName: string | null;
    ms: number;
    sessions: number;
}

// รวมเป็นอันดับเวลาในห้องเสียงต่อคนและต่อห้อง (นาที ปัดเศษจากยอดรวม ms ของแต่ละคน/ห้อง)
export function summarizeVoiceTime(pairs: VoicePair[]) {
    const perUser = new Map<string, { userName: string | null; ms: number; sessions: number }>();
    const perChannel = new Map<string, { channelName: string | null; ms: number }>();
    for (const pair of pairs) {
        const ms = Number(pair.ms) || 0;
        const user = perUser.get(pair.userId) ?? { userName: null, ms: 0, sessions: 0 };
        user.userName ||= pair.userName;
        user.ms += ms;
        user.sessions += Number(pair.sessions) || 0;
        perUser.set(pair.userId, user);
        if (pair.channelId && ms > 0) {
            const channel = perChannel.get(pair.channelId) ?? { channelName: null, ms: 0 };
            channel.channelName ||= pair.channelName;
            channel.ms += ms;
            perChannel.set(pair.channelId, channel);
        }
    }

    const users = [...perUser.entries()]
        .map(([userId, v]) => ({ userId, userName: v.userName || userId, minutes: Math.round(v.ms / 60000), sessions: v.sessions }))
        .filter((u) => u.minutes > 0)
        .sort((a, b) => b.minutes - a.minutes);

    const channels = [...perChannel.entries()]
        .map(([channelId, v]) => ({ channelId, channelName: v.channelName || channelId, minutes: Math.round(v.ms / 60000) }))
        .filter((c) => c.minutes > 0)
        .sort((a, b) => b.minutes - a.minutes);

    return { users, channels };
}
