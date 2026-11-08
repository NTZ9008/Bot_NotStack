import type { RelationPerson, RelationRole } from '@notstack/shared';

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
// ในกลุ่มมักมีเส้นน้อย จึงต้องดึงเข้าหากลางแรงกว่าปกติ ไม่อย่างนั้นการ์ดกระจายไกลจนกรอบล้นจอ
const GROUP_FORCES = { distance: 120, gravity: 0.6 };
const ZONE_PADDING = 36;
const ZONE_HEADER = 96;
const ZONE_GAP = 72;
const GAP = 38; // เว้นที่ให้หัวหมุดที่โผล่พ้นขอบการ์ด

// force-directed แบบกำหนดผลได้ — คนเดิมกับเส้นเดิมต้องได้ตำแหน่งเดิมทุกครั้ง
export function computeLayout(ids: readonly string[], edges: readonly LayoutEdge[], { distance = IDEAL_DISTANCE, gravity = GRAVITY } = {}): Map<string, Point> {
    const index = new Map(ids.map((id, i) => [id, i]));
    const xs = ids.map((_, i) => distance * 0.8 * Math.sqrt(i) * Math.cos(i * 2.39996));
    const ys = ids.map((_, i) => distance * 0.8 * Math.sqrt(i) * Math.sin(i * 2.39996));
    const links = edges.flatMap((edge) => {
        const a = index.get(edge.a);
        const b = index.get(edge.b);
        return a === undefined || b === undefined ? [] : [{ a, b, pull: 0.5 + edge.tier * 0.35 }];
    });

    let temperature = distance * 1.5;
    const cooling = temperature / (ITERATIONS + 1);
    for (let step = 0; step < ITERATIONS; step++) {
        const dx = new Array<number>(ids.length).fill(0);
        const dy = new Array<number>(ids.length).fill(0);
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const rx = xs[i]! - xs[j]! || 0.01;
                const ry = ys[i]! - ys[j]! || 0.01;
                const distSq = rx * rx + ry * ry;
                const force = (distance * distance) / distSq;
                dx[i]! += rx * force;
                dy[i]! += ry * force;
                dx[j]! -= rx * force;
                dy[j]! -= ry * force;
            }
        }
        for (const { a, b, pull } of links) {
            const rx = xs[a]! - xs[b]!;
            const ry = ys[a]! - ys[b]!;
            const force = (Math.hypot(rx, ry) / distance) * pull;
            dx[a]! -= rx * force;
            dy[a]! -= ry * force;
            dx[b]! += rx * force;
            dy[b]! += ry * force;
        }
        for (let i = 0; i < ids.length; i++) {
            dx[i]! -= xs[i]! * gravity;
            dy[i]! -= ys[i]! * gravity;
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

export const NO_ROLE_GROUP = 'none';
export const GONE_GROUP = 'gone';

export interface BoardGroup {
    id: string;
    name: string;
    color: string | null;
    members: string[];
}

export interface ZoneRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

// แต่ละคนอยู่กลุ่มเดียว คือ role ที่สูงที่สุดในบรรดา role ที่เลือกไว้ (roleIds เรียงจากสูงไปต่ำอยู่แล้ว)
export function assignGroups(
    people: readonly Pick<RelationPerson, 'userId' | 'status' | 'roleIds'>[],
    roles: readonly RelationRole[],
    excludedRoles: ReadonlySet<string>,
): BoardGroup[] {
    const groups: BoardGroup[] = [
        ...roles.filter((role) => !excludedRoles.has(role.id)).map((role) => ({ id: role.id, name: role.name, color: role.color, members: [] as string[] })),
        { id: NO_ROLE_GROUP, name: 'ไม่มี role ที่เลือก', color: null, members: [] },
        { id: GONE_GROUP, name: 'ออกจากเซิร์ฟเวอร์แล้ว', color: 'var(--destructive)', members: [] },
    ];
    const byId = new Map(groups.map((group) => [group.id, group]));
    for (const person of people) {
        const groupId = person.status !== 'member' ? GONE_GROUP : (person.roleIds.find((id) => byId.has(id)) ?? NO_ROLE_GROUP);
        byId.get(groupId)!.members.push(person.userId);
    }
    return groups.filter((group) => group.members.length > 0);
}

// กรอบของกลุ่มครอบการ์ดทุกใบ และเว้นด้านบนไว้ให้ชื่อกลุ่มกับหัวหมุด
export function zoneRect(points: readonly Point[]): ZoneRect {
    const left = Math.min(...points.map((point) => point.x)) - CARD_WIDTH / 2 - ZONE_PADDING;
    const right = Math.max(...points.map((point) => point.x)) + CARD_WIDTH / 2 + ZONE_PADDING;
    const top = Math.min(...points.map((point) => point.y)) - ZONE_HEADER;
    const bottom = Math.max(...points.map((point) => point.y)) + CARD_HEIGHT + ZONE_PADDING;
    return { x: left, y: top, width: right - left, height: bottom - top };
}

// จัดคนภายในกลุ่มตามความสัมพันธ์ก่อน แล้ววางกลุ่มเรียงจาก role สูงไปต่ำเป็นแถว
export function computeGroupedLayout(groups: readonly BoardGroup[], edges: readonly LayoutEdge[]): Map<string, Point> {
    const placed = groups.map((group) => {
        const members = new Set(group.members);
        const inner = computeLayout(
            group.members,
            edges.filter((edge) => members.has(edge.a) && members.has(edge.b)),
            GROUP_FORCES,
        );
        return { inner, zone: zoneRect([...inner.values()]) };
    });
    const area = placed.reduce((total, { zone }) => total + (zone.width + ZONE_GAP) * (zone.height + ZONE_GAP), 0);
    const rowWidth = Math.max(Math.sqrt(area * 1.6), ...placed.map(({ zone }) => zone.width));
    const result = new Map<string, Point>();
    let x = 0;
    let y = 0;
    let rowHeight = 0;
    for (const { inner, zone } of placed) {
        if (x > 0 && x + zone.width > rowWidth) {
            x = 0;
            y += rowHeight + ZONE_GAP;
            rowHeight = 0;
        }
        for (const [id, point] of inner) result.set(id, { x: point.x + x - zone.x, y: point.y + y - zone.y });
        x += zone.width + ZONE_GAP;
        rowHeight = Math.max(rowHeight, zone.height);
    }
    return result;
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

// แต่ละวิธีจัดกลุ่มจำตำแหน่งแยกกัน เพราะตำแหน่งในกลุ่มหนึ่งไม่มีความหมายกับการจัดอีกแบบ
const storageKey = (guildId: string, scope: string) => `notstack:relation-board:${guildId}${scope ? `:${scope}` : ''}`;

export function loadPins(guildId: string, scope = ''): Record<string, [number, number]> {
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(storageKey(guildId, scope)) ?? '{}');
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

export function savePin(guildId: string, userId: string, point: Point, scope = ''): void {
    try {
        localStorage.setItem(storageKey(guildId, scope), JSON.stringify({ ...loadPins(guildId, scope), [userId]: [Math.round(point.x), Math.round(point.y)] }));
    } catch {
        // โหมดส่วนตัว / พื้นที่เต็ม — ตำแหน่งยังใช้ได้จนกว่าจะปิดหน้า
    }
}

export function clearPins(guildId: string, scope = ''): void {
    try {
        localStorage.removeItem(storageKey(guildId, scope));
    } catch {
        // ไม่มีอะไรต้องทำ
    }
}
