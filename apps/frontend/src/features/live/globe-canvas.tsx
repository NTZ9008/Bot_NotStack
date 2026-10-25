import { LIVE_KIND_META, type LiveEvent, type LiveHub } from '@notstack/shared';
import Globe, { type GlobeInstance } from 'globe.gl';
import { useEffect, useRef } from 'react';
import { Color, MeshPhongMaterial } from 'three';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import landUrl from 'world-atlas/land-110m.json?url';

// ==========================================
// 🌏 ลูกโลก WebGL (globe.gl / three.js) — โหลดแบบ lazy เพราะ three.js ใหญ่ ไม่ให้ถ่วงหน้าแรก
// แผ่นดินเป็นจุด (hex dots) / เซิร์ฟเวอร์เป็นหมุดเรืองแสง / ทุกเหตุการณ์เป็นเส้นโค้งวิ่งเข้าหาเซิร์ฟเวอร์ + วงคลื่น
// ==========================================

export interface GlobeCanvasProps {
    hubs: LiveHub[];
    subscribe: (listener: (events: LiveEvent[]) => void) => () => void;
    // ชื่อเซิร์ฟเวอร์บนหมุด (ฝั่ง private)
    showLabels?: boolean;
    reducedMotion?: boolean;
    // หมุนลูกโลกได้ด้วยเมาส์/นิ้ว (hero ของ landing ปิดไว้ ไม่ให้ไปแย่งการเลื่อนหน้าบนมือถือ)
    interactive?: boolean;
    // มุมมองเริ่มต้นเอียงไปทางขวา/ซ้าย — hero วางลูกโลกชิดขวา
    lngOffset?: number;
    altitude?: number;
    onError?: () => void;
}

interface ArcDatum {
    id: number;
    startLat: number;
    startLng: number;
    endLat: number;
    endLng: number;
    color: [string, string];
    stroke: number;
}

interface RingDatum {
    id: number;
    lat: number;
    lng: number;
    color: string;
    maxR: number;
}

interface HubDatum {
    key: string;
    lat: number;
    lng: number;
    name?: string;
    iconUrl?: string | null;
    heat: number;
}

const ARC_MS = 1600;
const RING_MS = 1400;
const MAX_ARCS = 70;
const MAX_QUEUE = 90;
const RELEASE_EVERY_MS = 110;
const HUB_COLOR = '#c7d2fe';

function supportsWebGL(): boolean {
    try {
        const canvas = document.createElement('canvas');
        return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
    } catch {
        return false;
    }
}

function alpha(hex: string, value: number): string {
    const color = new Color(hex);
    return `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},${value})`;
}

function hubElement(hub: HubDatum): HTMLElement {
    const el = document.createElement('div');
    el.className =
        'pointer-events-none flex -translate-y-full items-center gap-1.5 rounded-full border border-white/15 bg-slate-950/75 py-0.5 pr-2 pl-0.5 text-[11px] font-medium whitespace-nowrap text-white shadow-lg backdrop-blur';
    if (hub.iconUrl) {
        const img = document.createElement('img');
        img.src = hub.iconUrl;
        img.alt = '';
        img.className = 'size-4 rounded-full';
        el.append(img);
    } else {
        const dot = document.createElement('span');
        dot.className = 'ml-1 size-2 rounded-full bg-indigo-300';
        el.append(dot);
    }
    const name = document.createElement('span');
    name.textContent = hub.name ?? '';
    name.className = 'max-w-32 truncate';
    el.append(name);
    return el;
}

export default function GlobeCanvas({
    hubs,
    subscribe,
    showLabels = false,
    reducedMotion = false,
    interactive = true,
    lngOffset = 0,
    altitude = 2.1,
    onError,
}: GlobeCanvasProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const globeRef = useRef<GlobeInstance | null>(null);
    const hubsRef = useRef(new Map<string, HubDatum>());
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    // ==========================================
    // สร้างลูกโลกครั้งเดียว
    // ==========================================
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        if (!supportsWebGL()) {
            onErrorRef.current?.();
            return;
        }

        let globe: GlobeInstance;
        try {
            globe = new Globe(container, { animateIn: !reducedMotion, rendererConfig: { antialias: true, alpha: true, powerPreference: 'low-power' } });
        } catch {
            onErrorRef.current?.();
            return;
        }
        globeRef.current = globe;

        globe
            .width(container.clientWidth)
            .height(container.clientHeight)
            .backgroundColor('rgba(0,0,0,0)')
            .showAtmosphere(true)
            .atmosphereColor('#6366f1')
            .atmosphereAltitude(0.2)
            .globeMaterial(new MeshPhongMaterial({ color: '#0b1022', emissive: '#0c1236', emissiveIntensity: 0.55, shininess: 0.8 }))
            // แผ่นดินเป็นจุด
            .hexPolygonResolution(3)
            .hexPolygonMargin(0.55)
            .hexPolygonUseDots(true)
            .hexPolygonColor(() => 'rgba(165,180,252,0.42)')
            // เส้นโค้ง: เส้นประยาวครึ่งหนึ่งวิ่งรอบเดียวแล้วหายไป
            .arcStartLat('startLat')
            .arcStartLng('startLng')
            .arcEndLat('endLat')
            .arcEndLng('endLng')
            .arcColor('color')
            .arcStroke('stroke')
            .arcAltitudeAutoScale(0.42)
            .arcDashLength(0.45)
            .arcDashGap(2)
            .arcDashInitialGap(1)
            .arcDashAnimateTime(reducedMotion ? 0 : ARC_MS)
            .arcsTransitionDuration(0)
            // วงคลื่นตรงจุดที่เกิด / ตอนเส้นถึงเซิร์ฟเวอร์
            .ringColor((d: object) => (t: number) => alpha((d as RingDatum).color, Math.max(0, 1 - t)))
            .ringMaxRadius('maxR')
            .ringPropagationSpeed(3.2)
            .ringRepeatPeriod(RING_MS * 2)
            // หมุดเซิร์ฟเวอร์ — ยิ่งคึกคักยิ่งสูง
            .pointLat('lat')
            .pointLng('lng')
            .pointColor(() => HUB_COLOR)
            .pointAltitude((d: object) => 0.012 + Math.min(0.12, (d as HubDatum).heat * 0.008))
            .pointRadius(0.32)
            .pointsTransitionDuration(400)
            .htmlLat('lat')
            .htmlLng('lng')
            .htmlAltitude(0.02)
            .htmlElement((d: object) => hubElement(d as HubDatum))
            .enablePointerInteraction(false);

        const controls = globe.controls();
        controls.enableZoom = false;
        controls.enablePan = false;
        controls.enableRotate = interactive;
        controls.autoRotate = !reducedMotion;
        controls.autoRotateSpeed = 0.45;
        controls.enableDamping = true;
        // ลากหมุนแล้วหยุดหมุนเองชั่วคราว
        let resumeTimer: ReturnType<typeof setTimeout> | undefined;
        const onStart = () => {
            clearTimeout(resumeTimer);
            controls.autoRotate = false;
        };
        const onEnd = () => {
            clearTimeout(resumeTimer);
            if (!reducedMotion) resumeTimer = setTimeout(() => (controls.autoRotate = true), 3500);
        };
        controls.addEventListener('start', onStart);
        controls.addEventListener('end', onEnd);

        // แผ่นดิน — ไฟล์ JSON แยก (cache ได้นาน) ไม่ฝังใน JS
        const land = new AbortController();
        void fetch(landUrl, { signal: land.signal })
            .then((res) => res.json() as Promise<Topology<{ land: GeometryCollection }>>)
            .then((topology) => {
                const geo = feature(topology, topology.objects.land);
                globe.hexPolygonsData('features' in geo ? geo.features : [geo]);
            })
            .catch(() => undefined);

        // ขนาด + หยุดวาดตอนไม่อยู่ในจอ / แท็บถูกซ่อน (ประหยัดแบต)
        const resize = new ResizeObserver(() => globe.width(container.clientWidth).height(container.clientHeight));
        resize.observe(container);
        let onScreen = true;
        const sync = () => (onScreen && !document.hidden ? globe.resumeAnimation() : globe.pauseAnimation());
        const visibility = new IntersectionObserver(([entry]) => {
            onScreen = Boolean(entry?.isIntersecting);
            sync();
        });
        visibility.observe(container);
        document.addEventListener('visibilitychange', sync);

        return () => {
            land.abort();
            clearTimeout(resumeTimer);
            controls.removeEventListener('start', onStart);
            controls.removeEventListener('end', onEnd);
            resize.disconnect();
            visibility.disconnect();
            document.removeEventListener('visibilitychange', sync);
            globe.pauseAnimation();
            globe.renderer().dispose();
            globe._destructor();
            globeRef.current = null;
            container.replaceChildren();
        };
        // สร้างใหม่เฉพาะเมื่อโหมดเคลื่อนไหว/การโต้ตอบเปลี่ยน
    }, [reducedMotion, interactive]);

    // ==========================================
    // หมุด + มุมกล้อง
    // ==========================================
    useEffect(() => {
        const globe = globeRef.current;
        const map = hubsRef.current;
        const next = new Map<string, HubDatum>();
        for (const hub of hubs)
            next.set(hub.key, { key: hub.key, lat: hub.lat, lng: hub.lon, name: hub.name, iconUrl: hub.iconUrl, heat: map.get(hub.key)?.heat ?? 0 });
        hubsRef.current = next;
        if (!globe) return;
        const data = [...next.values()];
        globe.pointsData(data);
        globe.htmlElementsData(showLabels && data.length <= 12 ? data : []);
        // หันไปหาเซิร์ฟเวอร์ (ค่าเฉลี่ย) — ไม่มีเลยหันไปเอเชียตะวันออกเฉียงใต้
        const lat = data.length ? data.reduce((sum, hub) => sum + hub.lat, 0) / data.length : 13.7;
        const lng = data.length ? data.reduce((sum, hub) => sum + hub.lng, 0) / data.length : 100.5;
        globe.pointOfView({ lat: lat * 0.6, lng: lng + lngOffset, altitude }, reducedMotion ? 0 : 1200);
    }, [hubs, showLabels, lngOffset, altitude, reducedMotion, interactive]);

    // ==========================================
    // เหตุการณ์ → เส้นโค้ง + วงคลื่น (ปล่อยทีละนิดให้ไหลต่อเนื่อง ไม่พุ่งมาเป็นก้อน)
    // ==========================================
    useEffect(() => {
        const queue: LiveEvent[] = [];
        let arcs: ArcDatum[] = [];
        let rings: RingDatum[] = [];
        let seq = 0;
        const timers = new Set<ReturnType<typeof setTimeout>>();
        const later = (fn: () => void, ms: number) => {
            const timer = setTimeout(() => {
                timers.delete(timer);
                fn();
            }, ms);
            timers.add(timer);
        };

        const draw = (event: LiveEvent) => {
            const globe = globeRef.current;
            const hub = hubsRef.current.get(event.hub);
            if (!globe || !hub) return;
            const color = LIVE_KIND_META[event.kind].color;
            const arc: ArcDatum = {
                id: ++seq,
                startLat: event.from.lat,
                startLng: event.from.lon,
                endLat: hub.lat,
                endLng: hub.lng,
                color: [alpha(color, 0.15), color],
                stroke: event.kind === 'pr' ? 0.9 : 0.45,
            };
            arcs = [...arcs.slice(-(MAX_ARCS - 1)), arc];
            globe.arcsData(arcs);
            const start: RingDatum = { id: ++seq, lat: event.from.lat, lng: event.from.lon, color, maxR: 1.6 };
            rings = [...rings, start];
            globe.ringsData(rings);

            later(
                () => {
                    arcs = arcs.filter((a) => a !== arc);
                    globeRef.current?.arcsData(arcs);
                },
                reducedMotion ? 900 : ARC_MS + 100,
            );
            later(() => {
                rings = rings.filter((r) => r !== start);
                globeRef.current?.ringsData(rings);
            }, RING_MS);
            // เส้นถึงเซิร์ฟเวอร์: วงคลื่นใหญ่ + หมุดสูงขึ้นชั่วคราว
            later(
                () => {
                    const end: RingDatum = { id: ++seq, lat: hub.lat, lng: hub.lng, color, maxR: event.kind === 'pr' ? 5 : 3 };
                    rings = [...rings, end];
                    hub.heat = Math.min(15, hub.heat + 1);
                    const g = globeRef.current;
                    g?.ringsData(rings).pointsData([...hubsRef.current.values()]);
                    later(() => {
                        rings = rings.filter((r) => r !== end);
                        globeRef.current?.ringsData(rings);
                    }, RING_MS);
                },
                reducedMotion ? 0 : ARC_MS * 0.9,
            );
        };

        const release = setInterval(() => {
            // ปล่อยเร็วขึ้นถ้าคิวยาว
            const count = queue.length > 30 ? 3 : 1;
            for (let i = 0; i < count && queue.length; i++) draw(queue.shift()!);
        }, RELEASE_EVERY_MS);

        // หมุดค่อยๆ ยุบกลับเมื่อเงียบ
        const cool = setInterval(() => {
            let changed = false;
            for (const hub of hubsRef.current.values()) {
                if (hub.heat > 0) {
                    hub.heat = Math.max(0, hub.heat - 1);
                    changed = true;
                }
            }
            if (changed) globeRef.current?.pointsData([...hubsRef.current.values()]);
        }, 2500);

        const unsubscribe = subscribe((events) => {
            queue.push(...events);
            if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
        });

        return () => {
            unsubscribe();
            clearInterval(release);
            clearInterval(cool);
            for (const timer of timers) clearTimeout(timer);
        };
    }, [subscribe, reducedMotion]);

    return <div ref={containerRef} className="size-full [&_canvas]:outline-none" />;
}
