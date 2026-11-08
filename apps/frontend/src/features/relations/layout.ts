// จัดวางการ์ดบนกระดานครั้งแรก + เก็บตำแหน่งที่ลากเองไว้ในเบราว์เซอร์ (ไฟล์นี้ไม่พึ่ง React เพื่อให้ทดสอบได้)
export const CARD_WIDTH = 124;
export const CARD_HEIGHT = 178;

export interface Point {
    x: number;
    y: number;
}

export interface LayoutEdge {
    a: string;
    b: string;
    tier: number;
}

export interface BoardView {
    x: number;
    y: number;
    k: number;
}

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 2.5;

const IDEAL_DISTANCE = 250;
const ITERATIONS = 220;
const GRAVITY = 0.02;
const GAP = 38; // เว้นที่ให้หัวหมุดที่โผล่พ้นขอบการ์ด

// force-directed แบบกำหนดผลได้ — คนเดิมกับเส้นเดิมต้องได้ตำแหน่งเดิมทุกครั้ง
export function computeLayout(ids: readonly string[], edges: readonly LayoutEdge[]): Map<string, Point> {
    const index = new Map(ids.map((id, i) => [id, i]));
    const xs = ids.map((_, i) => IDEAL_DISTANCE * 0.8 * Math.sqrt(i) * Math.cos(i * 2.39996));
    const ys = ids.map((_, i) => IDEAL_DISTANCE * 0.8 * Math.sqrt(i) * Math.sin(i * 2.39996));
    const links = edges.flatMap((edge) => {
        const a = index.get(edge.a);
        const b = index.get(edge.b);
        return a === undefined || b === undefined ? [] : [{ a, b, pull: 0.5 + edge.tier * 0.35 }];
    });

    let temperature = IDEAL_DISTANCE * 1.5;
    const cooling = temperature / (ITERATIONS + 1);
    for (let step = 0; step < ITERATIONS; step++) {
        const dx = new Array<number>(ids.length).fill(0);
        const dy = new Array<number>(ids.length).fill(0);
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const rx = xs[i]! - xs[j]! || 0.01;
                const ry = ys[i]! - ys[j]! || 0.01;
                const distSq = rx * rx + ry * ry;
                const force = (IDEAL_DISTANCE * IDEAL_DISTANCE) / distSq;
                dx[i]! += rx * force;
                dy[i]! += ry * force;
                dx[j]! -= rx * force;
                dy[j]! -= ry * force;
            }
        }
        for (const { a, b, pull } of links) {
            const rx = xs[a]! - xs[b]!;
            const ry = ys[a]! - ys[b]!;
            const force = (Math.hypot(rx, ry) / IDEAL_DISTANCE) * pull;
            dx[a]! -= rx * force;
            dy[a]! -= ry * force;
            dx[b]! += rx * force;
            dy[b]! += ry * force;
        }
        for (let i = 0; i < ids.length; i++) {
            dx[i]! -= xs[i]! * GRAVITY;
            dy[i]! -= ys[i]! * GRAVITY;
            const length = Math.hypot(dx[i]!, dy[i]!) || 1;
            const move = Math.min(length, temperature);
            xs[i]! += (dx[i]! / length) * move;
            ys[i]! += (dy[i]! / length) * move;
        }
        temperature -= cooling;
    }

    // ดันการ์ดที่ยังทับกันออกจากกัน ให้เห็นหน้าครบทุกคน
    for (let pass = 0; pass < 60; pass++) {
        let moved = false;
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const overlapX = CARD_WIDTH + GAP - Math.abs(xs[i]! - xs[j]!);
                const overlapY = CARD_HEIGHT + GAP - Math.abs(ys[i]! - ys[j]!);
                if (overlapX <= 0 || overlapY <= 0) continue;
                moved = true;
                if (overlapX < overlapY) {
                    const shift = (overlapX / 2) * (xs[i]! < xs[j]! ? -1 : 1);
                    xs[i]! += shift;
                    xs[j]! -= shift;
                } else {
                    const shift = (overlapY / 2) * (ys[i]! < ys[j]! ? -1 : 1);
                    ys[i]! += shift;
                    ys[j]! -= shift;
                }
            }
        }
        if (!moved) break;
    }

    return new Map(ids.map((id, i) => [id, { x: Math.round(xs[i]!), y: Math.round(ys[i]!) }]));
}

// เส้นด้ายหย่อนลงเล็กน้อยตามความยาว เหมือนขึงจริงระหว่างหมุด
export function stringPath(a: Point, b: Point): string {
    const sag = Math.min(70, Math.hypot(a.x - b.x, a.y - b.y) * 0.1);
    return `M${a.x} ${a.y}Q${(a.x + b.x) / 2} ${(a.y + b.y) / 2 + sag} ${b.x} ${b.y}`;
}

export const clampZoom = (k: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));

// ซูมโดยให้จุดใต้เคอร์เซอร์อยู่ที่เดิม
export function zoomAt(view: BoardView, nextK: number, cx: number, cy: number): BoardView {
    const k = clampZoom(nextK);
    return { k, x: cx - ((cx - view.x) / view.k) * k, y: cy - ((cy - view.y) / view.k) * k };
}

export function fitView(points: Iterable<Point>, width: number, height: number, padding = 48): BoardView {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const { x, y } of points) {
        minX = Math.min(minX, x - CARD_WIDTH / 2);
        maxX = Math.max(maxX, x + CARD_WIDTH / 2);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y + CARD_HEIGHT);
    }
    if (minX === Infinity) return { x: width / 2, y: height / 2, k: 1 };
    const k = clampZoom(Math.min(1.1, (width - padding * 2) / Math.max(1, maxX - minX), (height - padding * 2) / Math.max(1, maxY - minY)));
    return { k, x: width / 2 - ((minX + maxX) / 2) * k, y: height / 2 - ((minY + maxY) / 2) * k };
}

const storageKey = (guildId: string) => `notstack:relation-board:${guildId}`;

export function loadPins(guildId: string): Record<string, [number, number]> {
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(storageKey(guildId)) ?? '{}');
        if (!parsed || typeof parsed !== 'object') return {};
        return Object.fromEntries(
            Object.entries(parsed).filter((entry): entry is [string, [number, number]] => {
                const value = entry[1] as unknown;
                return Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === 'number' && Number.isFinite(n));
            }),
        );
    } catch {
        return {};
    }
}

export function savePin(guildId: string, userId: string, point: Point): void {
    try {
        localStorage.setItem(storageKey(guildId), JSON.stringify({ ...loadPins(guildId), [userId]: [Math.round(point.x), Math.round(point.y)] }));
    } catch {
        // โหมดส่วนตัว / พื้นที่เต็ม — ตำแหน่งยังใช้ได้จนกว่าจะปิดหน้า
    }
}

export function clearPins(guildId: string): void {
    try {
        localStorage.removeItem(storageKey(guildId));
    } catch {
        // ไม่มีอะไรต้องทำ
    }
}
