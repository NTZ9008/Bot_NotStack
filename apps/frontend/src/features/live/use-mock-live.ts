import { LIVE_KINDS, type LiveEvent, type LiveHub, type LiveKind } from '@notstack/shared';
import { useCallback, useEffect, useRef } from 'react';

type Listener = (events: LiveEvent[]) => void;

// ==========================================
// 🎬 ข้อมูลจำลองของลูกโลกในหน้า landing — สร้างในเบราว์เซอร์ทั้งหมด ไม่เรียก API
// หน้าสาธารณะจึงไม่เปิดเผยกิจกรรมจริงของเซิร์ฟเวอร์ใดเลย (ของจริงดูได้ใน Dashboard หลัง login)
// ==========================================

// เมืองสมมติ (weight = ความคึกคัก) — เน้นไทย มีต่างประเทศนิดหน่อยให้เส้นโค้งข้ามทวีป
const CITIES = [
    { key: 'bkk', lat: 13.75, lon: 100.5, weight: 6 },
    { key: 'cnx', lat: 18.79, lon: 98.98, weight: 2 },
    { key: 'kkc', lat: 16.43, lon: 102.83, weight: 1.5 },
    { key: 'hkt', lat: 7.88, lon: 98.39, weight: 1 },
    { key: 'sin', lat: 1.35, lon: 103.82, weight: 1 },
    { key: 'tyo', lat: 35.68, lon: 139.69, weight: 1 },
];
const MOCK_HUBS: LiveHub[] = CITIES.map(({ key, lat, lon }) => ({ key, lat, lon, guildId: key, name: '', iconUrl: null }));

const GITHUB = { lat: 37.78, lon: -122.39 };

// สัดส่วนชนิดเหตุการณ์คร่าวๆ ให้ดูเหมือนเซิร์ฟเวอร์จริง (ข้อความเยอะสุด)
const KIND_WEIGHTS: Record<LiveKind, number> = { message: 10, voice: 3, member: 1.5, command: 2, pr: 0.6, moderation: 0.8, other: 0.5 };
const KIND_KEY: Record<LiveKind, string> = {
    message: 'messageSent',
    voice: 'voiceJoin',
    member: 'memberJoin',
    command: 'commandUsed',
    pr: 'prMerged',
    moderation: 'autoModAction',
    other: 'channelUpdate',
};

function weighted<T>(items: T[], weight: (item: T) => number): T {
    const total = items.reduce((sum, item) => sum + weight(item), 0);
    let roll = Math.random() * total;
    for (const item of items) {
        roll -= weight(item);
        if (roll <= 0) return item;
    }
    return items[items.length - 1]!;
}

let nextId = 1;

function mockEvent(): LiveEvent {
    const kind = weighted([...LIVE_KINDS], (k) => KIND_WEIGHTS[k]);
    const hub = weighted(CITIES, (city) => city.weight);
    const angle = Math.random() * Math.PI * 2;
    const distance = 0.8 + Math.random() * 4;
    const from = kind === 'pr' ? GITHUB : { lat: hub.lat + Math.sin(angle) * distance, lon: hub.lon + Math.cos(angle) * distance };
    return {
        id: nextId++,
        kind,
        eventKey: KIND_KEY[kind],
        at: new Date().toISOString(),
        from,
        hub: hub.key,
        guildId: hub.key,
        userName: null,
        channelName: null,
        summary: null,
    };
}

export function useMockLive(enabled = true): { hubs: LiveHub[]; subscribe: (listener: Listener) => () => void } {
    const listeners = useRef(new Set<Listener>());
    const subscribe = useCallback((listener: Listener) => {
        listeners.current.add(listener);
        return () => void listeners.current.delete(listener);
    }, []);

    useEffect(() => {
        if (!enabled) return;
        let timer: ReturnType<typeof setTimeout>;
        // จังหวะไม่สม่ำเสมอ (บางช่วงถี่ บางช่วงเงียบ) ให้ดูเป็นธรรมชาติ
        const tick = () => {
            const burst = Math.random() < 0.15 ? 2 + Math.floor(Math.random() * 3) : 1;
            const events = Array.from({ length: burst }, mockEvent);
            for (const listener of listeners.current) listener(events);
            timer = setTimeout(tick, 250 + Math.random() * 650);
        };
        timer = setTimeout(tick, 600);
        return () => clearTimeout(timer);
    }, [enabled]);

    return { hubs: MOCK_HUBS, subscribe };
}
