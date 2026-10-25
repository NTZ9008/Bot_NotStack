import { emptyLiveStats, type LiveBatch, type LiveEvent, type LiveHello, type LiveHub, type LiveStats } from '@notstack/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { openEventStream, type StreamStatus } from '@/lib/sse';

const FEED_SIZE = 30;

type Listener = (events: LiveEvent[]) => void;

export interface LiveStream {
    status: StreamStatus;
    hubs: LiveHub[];
    stats: LiveStats;
    // ล่าสุดอยู่หน้าสุด
    feed: LiveEvent[];
    // ลูกโลกรับ event ใหม่ตรงนี้ (ไม่ผ่าน state ของ React — วาดเส้นได้ทันทีโดยไม่ต้อง re-render)
    subscribe: (listener: Listener) => () => void;
}

// ==========================================
// 🌏 ต่อ /api/live (ต้อง login) แล้วเก็บ hub / สถิติ / รายการล่าสุด
// guildId = ดูเฉพาะเซิร์ฟเวอร์เดียว (API กรองให้ สถิติจึงเป็นของเซิร์ฟเวอร์นั้นจริงๆ)
// ==========================================
export function useLiveStream({ enabled = true, guildId }: { enabled?: boolean; guildId?: string } = {}): LiveStream {
    const [status, setStatus] = useState<StreamStatus>('connecting');
    const [hubs, setHubs] = useState<LiveHub[]>([]);
    const [stats, setStats] = useState<LiveStats>(emptyLiveStats);
    const [feed, setFeed] = useState<LiveEvent[]>([]);
    const listeners = useRef(new Set<Listener>());

    const subscribe = useCallback((listener: Listener) => {
        listeners.current.add(listener);
        return () => void listeners.current.delete(listener);
    }, []);

    useEffect(() => {
        if (!enabled) return;
        const controller = new AbortController();
        // ต่อใหม่แล้ว hello ส่งรายการล่าสุดซ้ำ — ลูกโลกไม่ต้องวาดของที่วาดไปแล้ว
        let lastId = 0;
        const fresh = (events: LiveEvent[]) => {
            const newest = events.reduce((max, event) => Math.max(max, event.id), 0);
            if (newest < lastId) lastId = 0; // id เริ่มนับใหม่ = backend รีสตาร์ท
            const result = events.filter((event) => event.id > lastId);
            lastId = Math.max(lastId, newest);
            return result;
        };
        const push = (events: LiveEvent[]) => {
            events = fresh(events);
            if (!events.length) return;
            setFeed((prev) => [...[...events].reverse(), ...prev].slice(0, FEED_SIZE));
            for (const listener of listeners.current) listener(events);
        };

        void openEventStream({
            path: guildId ? `/live?guild=${guildId}` : '/live',
            signal: controller.signal,
            onStatus: setStatus,
            onMessage: ({ event, data }) => {
                try {
                    if (event === 'hello') {
                        const hello = JSON.parse(data) as LiveHello;
                        setHubs(hello.hubs);
                        setStats(hello.stats);
                        setFeed([...hello.recent].reverse().slice(0, FEED_SIZE));
                        const events = fresh(hello.recent);
                        for (const listener of listeners.current) listener(events);
                    } else if (event === 'batch') {
                        const batch = JSON.parse(data) as LiveBatch;
                        setStats(batch.stats);
                        push(batch.events);
                    }
                } catch {
                    /* ข้อความเสีย — ข้ามไป รอชุดถัดไป */
                }
            },
        });
        return () => controller.abort();
    }, [enabled, guildId]);

    return { status, hubs, stats, feed, subscribe };
}
