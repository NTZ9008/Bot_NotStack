import type { RelationLink, RelationPerson, RelationPresence } from '@notstack/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowUpRight, Waypoints } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { relationBoardQuery, relationPresenceQuery } from '@/api/relations';
import { LiveFeedPanel, LiveStatus, useNow } from '@/features/live/live-globe';
import { useLiveStream } from '@/features/live/use-live-stream';
import { cn } from '@/lib/utils';
import { BoardCanvas, type BoardHandle } from './board-canvas';

// ใช้ตัวกรองเดียวกับค่าเริ่มต้นของหน้ากระดานเต็ม — แชร์ cache กัน เปิดอีกหน้าไม่ต้องโหลดใหม่
const FILTERS = { days: 30, includeBots: false };
const MAX_PEOPLE = 16;
const NO_PRESENCES: Record<string, RelationPresence> = {};

// เลือกคนที่ผูกกับคนอื่นมากที่สุด (เฉพาะคนที่ยังอยู่ในเซิร์ฟเวอร์) แล้วเก็บเฉพาะเส้นระหว่างคนกลุ่มนี้
function pickTop(people: RelationPerson[], links: RelationLink[]): { people: RelationPerson[]; links: RelationLink[] } {
    const members = new Map(people.filter((person) => person.status === 'member').map((person) => [person.userId, person]));
    const weight = new Map<string, number>();
    for (const link of links) {
        if (!members.has(link.a) || !members.has(link.b)) continue;
        weight.set(link.a, (weight.get(link.a) ?? 0) + link.score);
        weight.set(link.b, (weight.get(link.b) ?? 0) + link.score);
    }
    const top = [...weight.entries()]
        .sort((x, y) => y[1] - x[1])
        .slice(0, MAX_PEOPLE)
        .map(([id]) => members.get(id)!);
    const ids = new Set(top.map((person) => person.userId));
    const inside = links.filter((link) => ids.has(link.a) && ids.has(link.b));
    // กระดานเล็ก — ซ่อนเส้นจางๆ ถ้ายังมีเส้นสีให้ดู
    const strong = inside.filter((link) => link.tier >= 2);
    return { people: top, links: strong.length >= Math.min(4, inside.length) ? strong : inside };
}

function BoardMessage({ children, pulse }: { children?: React.ReactNode; pulse?: boolean }) {
    return (
        <div
            className={cn(
                'flex size-full items-center justify-center px-6 text-center text-sm text-slate-400',
                pulse && 'animate-pulse motion-reduce:animate-none',
            )}
        >
            {children}
        </div>
    );
}

// ==========================================
// 🕸️ กระดานความสัมพันธ์ย่อในหน้าภาพรวม — แทนลูกโลก ด้านขวายังเป็นกิจกรรมล่าสุดแบบสด
// ==========================================
export function MiniRelationBoard({ guildId, className }: { guildId: string; className?: string }) {
    const navigate = useNavigate();
    const canvas = useRef<BoardHandle>(null);
    const live = useLiveStream({ guildId });
    const now = useNow();

    const board = useQuery(relationBoardQuery(guildId, FILTERS));
    const top = useMemo(() => pickTop(board.data?.people ?? [], board.data?.links ?? []), [board.data]);
    const memberIds = useMemo(() => top.people.map((person) => person.userId), [top]);
    const presence = useQuery({ ...relationPresenceQuery(guildId, memberIds), enabled: memberIds.length > 0 });
    const presences = presence.data?.presences ?? NO_PRESENCES;

    const openFullBoard = () => void navigate({ to: '/servers/$guildId/relations', params: { guildId } });

    return (
        <section
            className={cn(
                'relative isolate overflow-hidden rounded-xl border border-white/10 bg-[#05060a] text-slate-100 shadow-sm dark:border-white/10',
                className,
            )}
        >
            <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem]">
                <div className="relative h-[22rem] sm:h-[26rem]">
                    {board.isPending ? (
                        <BoardMessage pulse>กำลังโหลดกระดาน…</BoardMessage>
                    ) : board.isError ? (
                        <BoardMessage>โหลดกระดานความสัมพันธ์ไม่สำเร็จ</BoardMessage>
                    ) : top.people.length === 0 ? (
                        <BoardMessage>ยังไม่มีความสัมพันธ์ใน 30 วันที่ผ่านมา — เปิด “บันทึกกิจกรรม” ในหน้าตั้งค่าบันทึกเหตุการณ์ก่อน</BoardMessage>
                    ) : (
                        <BoardCanvas
                            ref={canvas}
                            guildId={guildId}
                            people={top.people}
                            links={top.links}
                            layoutLinks={top.links}
                            groups={null}
                            pinScope="mini"
                            presences={presences}
                            selection={null}
                            onSelectPerson={openFullBoard}
                            onSelectLink={openFullBoard}
                            wheelZoom={false}
                        />
                    )}
                    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-[#05060a]/90 to-transparent p-4 pb-8">
                        <div>
                            <p className="flex items-center gap-2 text-sm font-semibold">
                                <Waypoints className="size-4 text-indigo-300" /> กระดานความสัมพันธ์
                            </p>
                            <p className="mt-0.5 text-xs text-slate-400">
                                {top.people.length > 0
                                    ? `${top.people.length.toLocaleString('th-TH')} คนที่ผูกกันมากที่สุด · 30 วันล่าสุด · ลากการ์ดได้`
                                    : '30 วันล่าสุด'}
                            </p>
                        </div>
                        <Link
                            to="/servers/$guildId/relations"
                            params={{ guildId }}
                            className="pointer-events-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-slate-200 transition-colors hover:border-indigo-400/50 hover:bg-indigo-400/10"
                        >
                            ดูกระดานเต็ม <ArrowUpRight className="size-3.5" />
                        </Link>
                    </div>
                </div>
                <LiveFeedPanel live={live} now={now} header={<LiveStatus status={live.status} />} />
            </div>
        </section>
    );
}
