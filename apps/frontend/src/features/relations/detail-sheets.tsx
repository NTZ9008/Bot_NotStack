import {
    RELATION_CHAT_WINDOW_MINUTES,
    RELATION_KIND_LABELS,
    RELATION_STATUS_LABELS,
    type RelationKind,
    type RelationLink,
    type RelationPerson,
    type RelationTimelineItem,
} from '@notstack/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { MessagesSquare, Mic, ShieldAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { relationHistoryQuery, relationLinkQuery } from '@/api/relations';
import { EmptyState, ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { fallbackAvatar, formatDateTime, formatMinutes } from '@/lib/format';

const KIND_ICON: Record<RelationKind, LucideIcon> = { voice: Mic, chat: MessagesSquare, mod: ShieldAlert };
const KIND_TEXT: Record<RelationKind, string> = { voice: 'text-sky-400', chat: 'text-amber-400', mod: 'text-rose-400' };
const TIER_LABELS = ['', 'เบาบาง', 'พอรู้จัก', 'สนิท', 'แน่นแฟ้นมาก'];

export function Avatar({ person, userId, className }: { person?: RelationPerson; userId: string; className?: string }) {
    return <img src={person?.avatarUrl ?? fallbackAvatar(userId)} alt="" className={`shrink-0 rounded-full object-cover ${className ?? 'size-9'}`} />;
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="rounded-lg border bg-muted/40 p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-0.5 text-lg font-semibold">{value}</div>
        </div>
    );
}

function StatusBadge({ person }: { person: RelationPerson }) {
    if (person.status === 'member') return <Badge variant="secondary">อยู่ในเซิร์ฟเวอร์</Badge>;
    return <Badge variant="destructive">{RELATION_STATUS_LABELS[person.status]}</Badge>;
}

function ListSkeleton() {
    return (
        <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((row) => (
                <Skeleton key={row} className="h-14 w-full" />
            ))}
        </div>
    );
}

// ==========================================
// 🧑 ประวัติของคนบนกระดาน — สถานะ / คนที่เกี่ยวข้อง / ทุกเหตุการณ์ใน log
// ==========================================
export function PersonSheet({
    guildId,
    person,
    links,
    peopleById,
    onClose,
    onSelectLink,
}: {
    guildId: string;
    person: RelationPerson | null;
    links: RelationLink[];
    peopleById: Map<string, RelationPerson>;
    onClose: () => void;
    onSelectLink: (link: RelationLink) => void;
}) {
    const connections = person ? links.filter((link) => link.a === person.userId || link.b === person.userId) : [];
    return (
        <Sheet open={person !== null} onOpenChange={(open) => !open && onClose()}>
            <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
                {person && (
                    <>
                        <SheetHeader>
                            <div className="flex items-center gap-3 pr-6">
                                <Avatar person={person} userId={person.userId} className={`size-14 ${person.status === 'member' ? '' : 'grayscale'}`} />
                                <div className="min-w-0 space-y-1">
                                    <SheetTitle className="truncate">{person.name}</SheetTitle>
                                    <SheetDescription className="flex flex-wrap items-center gap-1.5">
                                        <StatusBadge person={person} />
                                        {person.isBot && <Badge variant="outline">บอท</Badge>}
                                    </SheetDescription>
                                </div>
                            </div>
                        </SheetHeader>
                        <div className="space-y-5 px-4 pb-6">
                            {person.leftAt && <p className="text-sm text-muted-foreground">ออกจากเซิร์ฟเวอร์เมื่อ {formatDateTime(person.leftAt)}</p>}
                            <div className="grid grid-cols-2 gap-2">
                                <Stat label="เหตุการณ์ในช่วงนี้" value={person.events.toLocaleString('th-TH')} />
                                <Stat label="คนที่เกี่ยวข้อง" value={connections.length.toLocaleString('th-TH')} />
                            </div>
                            <section className="space-y-2">
                                <h3 className="text-sm font-semibold">ความสัมพันธ์</h3>
                                {connections.length === 0 && <EmptyState>ยังไม่มีเส้นเชื่อมกับใครในช่วงเวลานี้</EmptyState>}
                                <ul className="space-y-1">
                                    {connections.slice(0, 12).map((link) => {
                                        const otherId = link.a === person.userId ? link.b : link.a;
                                        const other = peopleById.get(otherId);
                                        const Icon = KIND_ICON[link.kind];
                                        return (
                                            <li key={link.id}>
                                                <button type="button" onClick={() => onSelectLink(link)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-accent">
                                                    <Avatar person={other} userId={otherId} />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-sm font-medium">{other?.name ?? otherId}</span>
                                                        <span className="block text-xs text-muted-foreground">
                                                            {TIER_LABELS[link.tier]} · {RELATION_KIND_LABELS[link.kind]}
                                                        </span>
                                                    </span>
                                                    <Icon className={`size-4 shrink-0 ${KIND_TEXT[link.kind]}`} aria-hidden="true" />
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                            <PersonHistory guildId={guildId} userId={person.userId} />
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}

function PersonHistory({ guildId, userId }: { guildId: string; userId: string }) {
    const history = useInfiniteQuery(relationHistoryQuery(guildId, userId));
    const items = history.data?.pages.flatMap((page) => page.items) ?? [];
    return (
        <section className="space-y-2">
            <h3 className="text-sm font-semibold">ประวัติทั้งหมด</h3>
            {history.isPending && <ListSkeleton />}
            {history.isError && <ErrorState error={history.error} />}
            {history.isSuccess && items.length === 0 && <EmptyState>ไม่พบเหตุการณ์ของคนนี้ใน log</EmptyState>}
            <ol className="space-y-2">
                {items.map((item) => (
                    <li key={item.id} className="rounded-lg border p-3">
                        <div className="flex items-baseline justify-between gap-3">
                            <span className="text-sm font-medium">{item.label}</span>
                            <time className="shrink-0 text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</time>
                        </div>
                        {item.summary && <p className="mt-1 text-sm break-words text-muted-foreground">{item.summary}</p>}
                        {item.executorName && item.executorId !== userId && <p className="mt-1 text-xs text-muted-foreground">โดย {item.executorName}</p>}
                        {item.executorId === userId && item.userName && item.userId !== userId && <p className="mt-1 text-xs text-muted-foreground">ลงมือกับ {item.userName}</p>}
                    </li>
                ))}
            </ol>
            {history.hasNextPage && (
                <Button variant="outline" className="w-full" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
                    {history.isFetchingNextPage ? 'กำลังโหลด...' : 'โหลดเพิ่ม'}
                </Button>
            )}
        </section>
    );
}

function TimelineRow({ item }: { item: RelationTimelineItem }) {
    const Icon = KIND_ICON[item.type];
    let title: ReactNode;
    let detail: ReactNode = null;
    if (item.type === 'voice') {
        title = `อยู่ห้องเสียงด้วยกัน ${formatMinutes(item.minutes)}`;
        detail = item.channelName ? `ห้อง ${item.channelName}` : null;
    } else if (item.type === 'chat') {
        title = `คุยกัน ${item.exchanges.toLocaleString('th-TH')} ครั้ง`;
        detail = item.channelName ? `ห้อง #${item.channelName}` : null;
    } else {
        title = item.label;
        detail = `${item.actorName ?? item.actorId} ลงมือกับ ${item.targetName ?? 'อีกฝ่าย'}`;
    }
    return (
        <li className="flex gap-3 rounded-lg border p-3">
            <Icon className={`mt-0.5 size-4 shrink-0 ${KIND_TEXT[item.type]}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium">{title}</span>
                    <time className="shrink-0 text-xs text-muted-foreground">{formatDateTime(item.at)}</time>
                </div>
                {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
                {item.type === 'mod' && item.summary && <p className="mt-1 text-sm break-words text-muted-foreground">{item.summary}</p>}
            </div>
        </li>
    );
}

// ==========================================
// 🧵 รายละเอียดเส้น — ทำไมสองคนนี้ถึงเชื่อมกัน
// ==========================================
export function LinkSheet({
    guildId,
    link,
    days,
    peopleById,
    onClose,
    onSelectPerson,
}: {
    guildId: string;
    link: RelationLink | null;
    days: number;
    peopleById: Map<string, RelationPerson>;
    onClose: () => void;
    onSelectPerson: (userId: string) => void;
}) {
    const detail = useQuery({ ...relationLinkQuery(guildId, link?.a ?? '', link?.b ?? '', days), enabled: link !== null });
    const first = link ? peopleById.get(link.a) : undefined;
    const second = link ? peopleById.get(link.b) : undefined;
    return (
        <Sheet open={link !== null} onOpenChange={(open) => !open && onClose()}>
            <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
                {link && (
                    <>
                        <SheetHeader>
                            <div className="flex -space-x-2 pr-6">
                                <Avatar person={first} userId={link.a} className="size-12 ring-2 ring-background" />
                                <Avatar person={second} userId={link.b} className="size-12 ring-2 ring-background" />
                            </div>
                            <SheetTitle>
                                {first?.name ?? link.a} กับ {second?.name ?? link.b}
                            </SheetTitle>
                            <SheetDescription>
                                {TIER_LABELS[link.tier]} · ส่วนใหญ่{RELATION_KIND_LABELS[link.kind]} · ช่วง {days} วันล่าสุด
                            </SheetDescription>
                        </SheetHeader>
                        <div className="space-y-5 px-4 pb-6">
                            <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant="outline" onClick={() => onSelectPerson(link.a)}>
                                    ดูประวัติ {first?.name ?? link.a}
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => onSelectPerson(link.b)}>
                                    ดูประวัติ {second?.name ?? link.b}
                                </Button>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <Stat label="ห้องเสียง" value={formatMinutes(link.voiceMinutes)} />
                                <Stat label="คุยกัน" value={`${link.chatExchanges.toLocaleString('th-TH')} ครั้ง`} />
                                <Stat label="แอดมินลงมือ" value={`${link.modActions.toLocaleString('th-TH')} ครั้ง`} />
                            </div>
                            <p className="text-xs leading-relaxed text-muted-foreground">
                                “คุยกัน” นับเมื่อสองคนส่งข้อความต่อกันในห้องเดียวกันภายใน {RELATION_CHAT_WINDOW_MINUTES} นาที เป็นการประมาณจาก log ไม่ได้อ่านเนื้อหาข้อความ
                            </p>
                            <section className="space-y-2">
                                <h3 className="text-sm font-semibold">ไทม์ไลน์</h3>
                                {detail.isPending && <ListSkeleton />}
                                {detail.isError && <ErrorState error={detail.error} />}
                                {detail.isSuccess && detail.data.timeline.length === 0 && <EmptyState>ไม่พบรายการในช่วงเวลานี้</EmptyState>}
                                <ol className="space-y-2">{detail.data?.timeline.map((item, index) => <TimelineRow key={`${item.type}:${item.at}:${index}`} item={item} />)}</ol>
                                {detail.data?.truncated && <p className="text-xs text-muted-foreground">แสดงเฉพาะรายการล่าสุด ตัวเลขสรุปด้านบนยังนับครบทุกรายการ</p>}
                            </section>
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}
