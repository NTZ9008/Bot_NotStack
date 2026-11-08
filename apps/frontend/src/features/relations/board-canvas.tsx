import { RELATION_STATUS_LABELS, type RelationLink, type RelationPerson } from '@notstack/shared';
import {
    memo,
    useCallback,
    useEffect,
    useImperativeHandle,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type KeyboardEvent,
    type PointerEvent,
    type Ref,
} from 'react';
import { fallbackAvatar } from '@/lib/format';
import {
    CARD_HEIGHT,
    CARD_WIDTH,
    clearPins,
    computeGroupedLayout,
    computeLayout,
    fitView,
    loadPins,
    savePin,
    stringPath,
    zoneRect,
    zoomAt,
    type BoardGroup,
    type BoardView,
    type Point,
    type ZoneRect,
} from './layout';
import './relations.css';

export interface BoardHandle {
    fit: () => void;
    zoom: (factor: number) => void;
    resetLayout: () => void;
    focusPerson: (userId: string) => void;
}

export type BoardSelection = { type: 'person'; userId: string } | { type: 'link'; link: RelationLink } | null;

interface BoardCanvasProps {
    ref: Ref<BoardHandle>;
    guildId: string;
    people: RelationPerson[];
    links: RelationLink[];
    layoutLinks: RelationLink[];
    // null = ไม่แบ่งกลุ่ม
    groups: BoardGroup[] | null;
    pinScope: string;
    selection: BoardSelection;
    onSelectPerson: (userId: string) => void;
    onSelectLink: (link: RelationLink) => void;
}

type Gesture =
    | { type: 'pan'; lastX: number; lastY: number }
    | { type: 'card'; userId: string; offsetX: number; offsetY: number; startX: number; startY: number; moved: boolean }
    | { type: 'link'; linkId: string; startX: number; startY: number; moved: boolean }
    | { type: 'pinch'; distance: number };

const CLICK_TOLERANCE = 5;
const NUDGE = 24;
const FIT_PADDING_GROUPED = 28;

// เอียงการ์ดคนละนิดตาม id — ตำแหน่งเอียงต้องเดิมทุกครั้งที่เปิดหน้า
function tiltOf(userId: string): number {
    let hash = 0;
    for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) | 0;
    return (Math.abs(hash) % 5) - 2;
}

function placeZone(el: HTMLElement, zone: ZoneRect): void {
    el.style.transform = `translate(${zone.x}px, ${zone.y}px)`;
    el.style.width = `${zone.width}px`;
    el.style.height = `${zone.height}px`;
}

const cardTransform = (point: Point, tilt: number) => `translate(${point.x - CARD_WIDTH / 2}px, ${point.y}px) rotate(${tilt}deg)`;

const PersonCard = memo(function PersonCard({
    person,
    point,
    selected,
    register,
}: {
    person: RelationPerson;
    point: Point;
    selected: boolean;
    register: (id: string, el: HTMLElement | null) => void;
}) {
    const gone = person.status !== 'member';
    const tag = gone ? RELATION_STATUS_LABELS[person.status as keyof typeof RELATION_STATUS_LABELS] : person.isBot ? 'บอท' : '';
    return (
        <button
            type="button"
            ref={(el) => register(person.userId, el)}
            className="rb-card"
            data-person={person.userId}
            data-gone={gone || undefined}
            data-selected={selected || undefined}
            aria-label={`${person.name}${tag ? ` (${tag})` : ''} ดูประวัติ`}
            style={{ transform: cardTransform(point, tiltOf(person.userId)) }}
        >
            <span className="rb-pin" />
            <span className="rb-photo">
                <img
                    src={person.avatarUrl ?? fallbackAvatar(person.userId)}
                    alt=""
                    draggable={false}
                    loading="lazy"
                    decoding="async"
                    onError={(event) => {
                        const fallback = fallbackAvatar(person.userId);
                        if (event.currentTarget.src !== fallback) event.currentTarget.src = fallback;
                    }}
                />
                {gone && (
                    <svg className="rb-cross" viewBox="0 0 100 100" aria-hidden="true">
                        <path
                            d="M9 12 C34 37 63 66 92 90 M90 10 C63 36 35 63 10 91"
                            fill="none"
                            stroke="var(--destructive)"
                            strokeWidth="9"
                            strokeLinecap="round"
                        />
                    </svg>
                )}
            </span>
            <span className="rb-name">{person.name}</span>
            {tag && <span className="rb-tag">{tag}</span>}
        </button>
    );
});

// ==========================================
// 🧷 พื้นกระดาน — ตำแหน่งระหว่างลากแก้ DOM ตรงๆ เพราะ re-render การ์ดและเส้นหลายร้อยชิ้นทุกการขยับจะกระตุก
// ==========================================
export function BoardCanvas({ ref, guildId, people, links, layoutLinks, groups, pinScope, selection, onSelectPerson, onSelectLink }: BoardCanvasProps) {
    const boardRef = useRef<HTMLDivElement>(null);
    const worldRef = useRef<HTMLDivElement>(null);
    const view = useRef<BoardView>({ x: 0, y: 0, k: 1 });
    const cards = useRef(new Map<string, HTMLElement>());
    const strings = useRef(new Map<string, { line: SVGPathElement; hit: SVGPathElement }>());
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const gesture = useRef<Gesture | null>(null);
    const hover = useRef<BoardSelection>(null);
    const fitted = useRef<string | null>(null);
    const zones = useRef(new Map<string, HTMLElement>());
    const [layoutVersion, setLayoutVersion] = useState(0);

    const peopleKey = people.map((person) => person.userId).join(',');
    const linksKey = layoutLinks.map((link) => `${link.id}:${link.tier}`).join(',');
    const groupsKey = groups?.map((group) => `${group.id}=${group.members.join('+')}`).join('|') ?? '';
    const positions = useMemo(() => {
        const edges = layoutLinks.map((link) => ({ a: link.a, b: link.b, tier: link.tier }));
        const layout = groups ? computeGroupedLayout(groups, edges) : computeLayout(peopleKey ? peopleKey.split(',') : [], edges);
        const pins = loadPins(guildId, pinScope);
        for (const id of layout.keys()) {
            const pin = pins[id];
            if (pin) layout.set(id, { x: pin[0], y: pin[1] });
        }
        return layout;
        // peopleKey/linksKey แทนเนื้อหาของ array — refetch ที่ได้ข้อมูลเดิมต้องไม่จัดกระดานใหม่
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [guildId, peopleKey, linksKey, layoutVersion, groupsKey, pinScope]);

    const groupByUser = useMemo(() => new Map((groups ?? []).flatMap((group) => group.members.map((id) => [id, group] as const))), [groups]);
    const zoneOf = useCallback((group: BoardGroup) => zoneRect(group.members.map((id) => positions.get(id) ?? { x: 0, y: 0 })), [positions]);

    const linksByPerson = useMemo(() => {
        const map = new Map<string, RelationLink[]>();
        for (const link of links) {
            for (const id of [link.a, link.b]) {
                const list = map.get(id);
                if (list) list.push(link);
                else map.set(id, [link]);
            }
        }
        return map;
    }, [links]);

    const applyView = useCallback(() => {
        const { x, y, k } = view.current;
        if (worldRef.current) worldRef.current.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
        if (boardRef.current) boardRef.current.style.backgroundPosition = `${x}px ${y}px`;
    }, []);

    const fit = useCallback(() => {
        const board = boardRef.current;
        if (!board) return;
        // มีกลุ่ม: ต้องเห็นทั้งกรอบ fitView บวกขนาดการ์ดให้เอง จึงส่งมุมกรอบที่หักขนาดการ์ดออกแล้ว
        const points = groups
            ? groups.flatMap((group) => {
                  const zone = zoneOf(group);
                  return [
                      { x: zone.x + CARD_WIDTH / 2, y: zone.y },
                      { x: zone.x + zone.width - CARD_WIDTH / 2, y: zone.y + zone.height - CARD_HEIGHT },
                  ];
              })
            : positions.values();
        view.current = fitView(points, board.clientWidth, board.clientHeight, groups ? FIT_PADDING_GROUPED : undefined);
        applyView();
    }, [positions, applyView, groups, zoneOf]);

    const zoomBy = useCallback(
        (factor: number, cx?: number, cy?: number) => {
            const board = boardRef.current;
            if (!board) return;
            view.current = zoomAt(view.current, view.current.k * factor, cx ?? board.clientWidth / 2, cy ?? board.clientHeight / 2);
            applyView();
        },
        [applyView],
    );

    // ไฮไลต์คน/เส้นที่กำลังชี้อยู่ ไม่อย่างนั้นใช้ตัวที่เลือกค้างไว้
    const applyFocus = useCallback(() => {
        const world = worldRef.current;
        if (!world) return;
        const target = hover.current ?? selection;
        const litCards = new Set<string>();
        const litLinks = new Set<string>();
        if (target?.type === 'person') {
            litCards.add(target.userId);
            for (const link of linksByPerson.get(target.userId) ?? []) {
                litLinks.add(link.id);
                litCards.add(link.a);
                litCards.add(link.b);
            }
        } else if (target?.type === 'link') {
            litLinks.add(target.link.id);
            litCards.add(target.link.a);
            litCards.add(target.link.b);
        }
        if (target) world.dataset.focus = '1';
        else delete world.dataset.focus;
        for (const [id, el] of cards.current) {
            if (litCards.has(id)) el.dataset.lit = '1';
            else delete el.dataset.lit;
        }
        for (const [id, { line }] of strings.current) {
            if (litLinks.has(id)) line.dataset.lit = '1';
            else delete line.dataset.lit;
        }
    }, [selection, linksByPerson]);

    useEffect(applyFocus, [applyFocus, links]);

    useLayoutEffect(() => {
        applyView();
    }, [applyView]);

    // จัดกระดานใหม่ (เปลี่ยนชุดคน/กดจัดใหม่) ต้องอัปเดตการ์ดและเส้นที่ React ไม่ได้ render ซ้ำ
    useLayoutEffect(() => {
        for (const [id, point] of positions) {
            const card = cards.current.get(id);
            if (card) card.style.transform = cardTransform(point, tiltOf(id));
        }
        for (const link of links) {
            const a = positions.get(link.a);
            const b = positions.get(link.b);
            const string = strings.current.get(link.id);
            if (!a || !b || !string) continue;
            const path = stringPath(a, b);
            string.line.setAttribute('d', path);
            string.hit.setAttribute('d', path);
        }
        for (const group of groups ?? []) {
            const el = zones.current.get(group.id);
            if (el) placeZone(el, zoneOf(group));
        }
    }, [positions, links, groups, zoneOf]);

    useLayoutEffect(() => {
        if (fitted.current === pinScope || positions.size === 0) return;
        fitted.current = pinScope;
        fit();
    }, [positions, fit, pinScope]);

    useEffect(() => {
        const board = boardRef.current;
        if (!board) return;
        // ต้องเป็น non-passive ถึงจะกันไม่ให้ทั้งหน้าเลื่อนตอนซูมกระดาน
        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            const rect = board.getBoundingClientRect();
            zoomBy(Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top);
        };
        board.addEventListener('wheel', onWheel, { passive: false });
        return () => board.removeEventListener('wheel', onWheel);
    }, [zoomBy]);

    useImperativeHandle(
        ref,
        () => ({
            fit,
            zoom: (factor) => zoomBy(factor),
            resetLayout: () => {
                clearPins(guildId, pinScope);
                fitted.current = null;
                setLayoutVersion((version) => version + 1);
            },
            focusPerson: (userId) => {
                const board = boardRef.current;
                const point = positions.get(userId);
                if (!board || !point) return;
                const k = Math.max(view.current.k, 0.9);
                view.current = { k, x: board.clientWidth / 2 - point.x * k, y: board.clientHeight / 2 - (point.y + 70) * k };
                applyView();
            },
        }),
        [fit, zoomBy, guildId, pinScope, positions, applyView],
    );

    const moveCard = (userId: string, point: Point) => {
        positions.set(userId, point);
        const card = cards.current.get(userId);
        if (card) card.style.transform = cardTransform(point, tiltOf(userId));
        for (const link of linksByPerson.get(userId) ?? []) {
            const a = positions.get(link.a);
            const b = positions.get(link.b);
            const string = strings.current.get(link.id);
            if (!a || !b || !string) continue;
            const path = stringPath(a, b);
            string.line.setAttribute('d', path);
            string.hit.setAttribute('d', path);
        }
        const group = groupByUser.get(userId);
        const zone = group && zones.current.get(group.id);
        if (group && zone) placeZone(zone, zoneOf(group));
    };

    const localPoint = (event: PointerEvent<HTMLDivElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const toWorld = ({ x, y }: Point): Point => ({ x: (x - view.current.x) / view.current.k, y: (y - view.current.y) / view.current.k });
    const pinchDistance = () => {
        const [first, second] = [...pointers.current.values()];
        return first && second ? Math.hypot(first.x - second.x, first.y - second.y) : 0;
    };

    const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        const local = localPoint(event);
        pointers.current.set(event.pointerId, local);
        event.currentTarget.setPointerCapture(event.pointerId);

        if (pointers.current.size === 2) {
            gesture.current = { type: 'pinch', distance: pinchDistance() };
            return;
        }
        const target = event.target as Element;
        const cardEl = target.closest<HTMLElement>('[data-person]');
        const linkId = target.closest<SVGElement>('[data-link]')?.dataset.link;
        if (cardEl) {
            const userId = cardEl.dataset.person!;
            const world = toWorld(local);
            const point = positions.get(userId)!;
            gesture.current = { type: 'card', userId, offsetX: world.x - point.x, offsetY: world.y - point.y, startX: local.x, startY: local.y, moved: false };
        } else if (linkId) {
            gesture.current = { type: 'link', linkId, startX: local.x, startY: local.y, moved: false };
        } else {
            gesture.current = { type: 'pan', lastX: local.x, lastY: local.y };
            event.currentTarget.dataset.panning = '1';
        }
    };

    const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
        const local = localPoint(event);
        const current = gesture.current;
        if (!current) {
            const target = event.target as Element;
            const userId = target.closest<HTMLElement>('[data-person]')?.dataset.person;
            const linkId = target.closest<SVGElement>('[data-link]')?.dataset.link;
            const link = linkId ? links.find((item) => item.id === linkId) : undefined;
            const next: BoardSelection = userId ? { type: 'person', userId } : link ? { type: 'link', link } : null;
            const previous = hover.current;
            const same =
                (previous?.type === 'person' && next?.type === 'person' && previous.userId === next.userId) ||
                (previous?.type === 'link' && next?.type === 'link' && previous.link.id === next.link.id) ||
                (!previous && !next);
            if (!same) {
                hover.current = next;
                applyFocus();
            }
            return;
        }
        if (!pointers.current.has(event.pointerId)) return;
        pointers.current.set(event.pointerId, local);

        if (current.type === 'pinch') {
            const distance = pinchDistance();
            if (current.distance > 0 && distance > 0) {
                const [first, second] = [...pointers.current.values()];
                zoomBy(distance / current.distance, (first!.x + second!.x) / 2, (first!.y + second!.y) / 2);
                current.distance = distance;
            }
        } else if (current.type === 'pan') {
            view.current = { ...view.current, x: view.current.x + local.x - current.lastX, y: view.current.y + local.y - current.lastY };
            current.lastX = local.x;
            current.lastY = local.y;
            applyView();
        } else {
            if (!current.moved && Math.hypot(local.x - current.startX, local.y - current.startY) > CLICK_TOLERANCE) {
                current.moved = true;
                if (current.type === 'card') cards.current.get(current.userId)?.setAttribute('data-dragging', '1');
            }
            if (current.type === 'card' && current.moved) {
                const world = toWorld(local);
                moveCard(current.userId, { x: world.x - current.offsetX, y: world.y - current.offsetY });
            }
        }
    };

    const endPointer = (event: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
        pointers.current.delete(event.pointerId);
        const current = gesture.current;
        if (current?.type === 'pinch' && pointers.current.size > 0) return;
        gesture.current = null;
        delete event.currentTarget.dataset.panning;
        if (!current || current.type === 'pan' || current.type === 'pinch') return;
        if (current.type === 'card') {
            cards.current.get(current.userId)?.removeAttribute('data-dragging');
            if (current.moved) savePin(guildId, current.userId, positions.get(current.userId)!, pinScope);
            else if (!cancelled) onSelectPerson(current.userId);
        } else if (!current.moved && !cancelled) {
            const link = links.find((item) => item.id === current.linkId);
            if (link) onSelectLink(link);
        }
    };

    const onCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const userId = (event.target as Element).closest<HTMLElement>('[data-person]')?.dataset.person;
        if (!userId) return;
        const offsets: Record<string, [number, number]> = { ArrowLeft: [-NUDGE, 0], ArrowRight: [NUDGE, 0], ArrowUp: [0, -NUDGE], ArrowDown: [0, NUDGE] };
        const offset = offsets[event.key];
        if (offset) {
            event.preventDefault();
            const point = positions.get(userId)!;
            const next = { x: point.x + offset[0], y: point.y + offset[1] };
            moveCard(userId, next);
            savePin(guildId, userId, next, pinScope);
        } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelectPerson(userId);
        }
    };

    const registerCard = useCallback((id: string, el: HTMLElement | null) => {
        if (el) cards.current.set(id, el);
        else cards.current.delete(id);
    }, []);

    const selectedPerson = selection?.type === 'person' ? selection.userId : null;

    return (
        <div
            ref={boardRef}
            className="rb-board"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(event) => endPointer(event, false)}
            onPointerCancel={(event) => endPointer(event, true)}
            onPointerLeave={() => {
                if (!hover.current) return;
                hover.current = null;
                applyFocus();
            }}
            onKeyDown={onCardKeyDown}
        >
            <div ref={worldRef} className="rb-world">
                {groups?.map((group) => {
                    const zone = zoneOf(group);
                    return (
                        <div
                            key={group.id}
                            ref={(el) => {
                                if (el) zones.current.set(group.id, el);
                                else zones.current.delete(group.id);
                            }}
                            className="rb-zone"
                            style={
                                {
                                    '--zone': group.color ?? undefined,
                                    transform: `translate(${zone.x}px, ${zone.y}px)`,
                                    width: zone.width,
                                    height: zone.height,
                                } as CSSProperties
                            }
                        >
                            <div className="rb-zone-label">
                                <span className="rb-zone-dot" />
                                <span className="rb-zone-name">{group.name}</span>
                                <span className="rb-zone-count">{group.members.length.toLocaleString('th-TH')} คน</span>
                            </div>
                        </div>
                    );
                })}
                <svg className="rb-strings" aria-hidden="true">
                    {links.map((link) => {
                        const path = stringPath(positions.get(link.a) ?? { x: 0, y: 0 }, positions.get(link.b) ?? { x: 0, y: 0 });
                        const refs = (part: 'line' | 'hit') => (el: SVGPathElement | null) => {
                            const entry = strings.current.get(link.id) ?? ({} as { line: SVGPathElement; hit: SVGPathElement });
                            if (el) {
                                entry[part] = el;
                                strings.current.set(link.id, entry);
                            } else strings.current.delete(link.id);
                        };
                        return (
                            <g key={link.id}>
                                <path ref={refs('line')} className="rb-string" data-tier={link.tier} data-kind={link.kind} d={path} />
                                <path ref={refs('hit')} className="rb-string-hit" data-link={link.id} d={path} />
                            </g>
                        );
                    })}
                </svg>
                {people.map((person) => (
                    <PersonCard
                        key={person.userId}
                        person={person}
                        point={positions.get(person.userId) ?? { x: 0, y: 0 }}
                        selected={selectedPerson === person.userId}
                        register={registerCard}
                    />
                ))}
            </div>
        </div>
    );
}
