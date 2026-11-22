import { tr, dateLocale, byLang, trText } from '../../lib/i18n';
import {
    RELATION_CHAT_WINDOW_MINUTES,
    RELATION_KIND_LABELS,
    RELATION_ACTIVITY_LABELS,
    RELATION_STATUS_LABELS,
    RELATION_STATUS_TEXT,
    type RelationKind,
    type RelationLink,
    type RelationPerson,
    type RelationPresence,
    type RelationPresenceStatus,
    type RelationTimelineItem,
} from '@notstack/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { MessagesSquare, Mic, ShieldAlert, type LucideIcon } from '@/components/icons';
import type { ReactNode } from 'react';
import { relationHistoryQuery, relationLinkQuery } from '@/api/relations';
import { EmptyState, ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { fallbackAvatar, formatDateTime, formatMinutes } from '@/lib/format';

const KIND_ICON: Record<RelationKind, LucideIcon> = { voice: Mic, chat: MessagesSquare, mod: ShieldAlert };
const KIND_TEXT: Record<RelationKind, string> = {
    voice: 'text-sky-700 dark:text-sky-400',
    chat: 'text-amber-700 dark:text-amber-400',
    mod: 'text-rose-700 dark:text-rose-400',
};
const TIER_LABELS = byLang(() => ['', tr('relations.faint'), tr('relations.acquainted'), tr('relations.close'), tr('relations.veryClose')]);

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

function VoiceStat({ label, minutes, days }: { label: string; minutes: number; days?: number }) {
    return (
        <div className="flex items-center gap-3 rounded-lg border border-sky-400/40 bg-sky-400/10 p-3">
            <Mic className="size-5 shrink-0 text-sky-700 dark:text-sky-400" aria-hidden="true" />
            <div className="min-w-0">
                <div className="text-xs text-muted-foreground">
                    {label}
                    {days ? tr('relations.lastDays', { 0: days }) : ''}
                </div>
                <div className="text-xl font-bold text-sky-700 dark:text-sky-300">{formatMinutes(minutes)}</div>
            </div>
        </div>
    );
}

function StatusBadge({ person }: { person: RelationPerson }) {
    if (person.status === 'member') return <Badge variant="secondary">{tr('relations.inTheServer')}</Badge>;
    return <Badge variant="destructive">{trText(RELATION_STATUS_LABELS[person.status])}</Badge>;
}

const STATUS_DOT: Record<RelationPresenceStatus, string> = {
    online: 'bg-success',
    idle: 'bg-warning',
    dnd: 'bg-destructive',
    offline: 'bg-neutral-500',
};

function PresenceBlock({ presence }: { presence: RelationPresence }) {
    const { activity, customStatus, status } = presence;
    return (
        <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium">
                <span className={`size-2.5 rounded-full ${STATUS_DOT[status]}`} aria-hidden="true" />
                {trText(RELATION_STATUS_TEXT[status])}
            </div>
            {activity && (
                <p className="break-words">
                    {trText(RELATION_ACTIVITY_LABELS[activity.kind])} <span className="font-medium">{activity.name}</span>
                    {activity.detail && <span className="text-muted-foreground"> · {activity.detail}</span>}
                </p>
            )}
            {customStatus && <p className="break-words text-muted-foreground">“{customStatus}”</p>}
        </div>
    );
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
    presence,
    days,
    links,
    peopleById,
    onClose,
    onSelectLink,
}: {
    guildId: string;
    person: RelationPerson | null;
    presence: RelationPresence | null;
    days: number;
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
                                        {person.isBot && <Badge variant="outline">{tr('relations.bot')}</Badge>}
                                    </SheetDescription>
                                </div>
                            </div>
                        </SheetHeader>
                        <div className="space-y-5 px-4 pb-6">
                            {presence && <PresenceBlock presence={presence} />}
                            {person.leftAt && (
                                <p className="text-sm text-muted-foreground">
                                    {tr('relations.leftTheServerOn')} {formatDateTime(person.leftAt)}
                                </p>
                            )}
                            <VoiceStat label={tr('common.totalVoiceTime')} minutes={person.voiceMinutes} days={days} />
                            <div className="grid grid-cols-2 gap-2">
                                <Stat label={tr('relations.eventsInThisPeriod')} value={person.events.toLocaleString(dateLocale())} />
                                <Stat label={tr('relations.relatedPeople')} value={connections.length.toLocaleString(dateLocale())} />
                            </div>
                            <section className="space-y-2">
                                <h3 className="text-sm font-semibold">{tr('relations.relationship')}</h3>
                                {connections.length === 0 && <EmptyState>{tr('relations.noConnectionsInThisPeriodYet')}</EmptyState>}
                                <ul className="space-y-1">
                                    {connections.slice(0, 12).map((link) => {
                                        const otherId = link.a === person.userId ? link.b : link.a;
                                        const other = peopleById.get(otherId);
                                        const Icon = KIND_ICON[link.kind];
                                        return (
                                            <li key={link.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => onSelectLink(link)}
                                                    className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-accent"
                                                >
                                                    <Avatar person={other} userId={otherId} />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-sm font-medium">{other?.name ?? otherId}</span>
                                                        <span className="block text-xs text-muted-foreground">
                                                            {TIER_LABELS()[link.tier]} · {trText(RELATION_KIND_LABELS[link.kind])}
                                                            {link.voiceMinutes > 0 && (
                                                                <span className="text-sky-700 dark:text-sky-400">
                                                                    {' '}
                                                                    {tr('relations.voice2')} {formatMinutes(link.voiceMinutes)}
                                                                </span>
                                                            )}
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
            <h3 className="text-sm font-semibold">{tr('relations.fullHistory')}</h3>
            {history.isPending && <ListSkeleton />}
            {history.isError && <ErrorState error={history.error} />}
            {history.isSuccess && items.length === 0 && <EmptyState>{tr('relations.noEventsForThisPersonIn')}</EmptyState>}
            <ol className="space-y-2">
                {items.map((item) => (
                    <li key={item.id} className="rounded-lg border p-3">
                        <div className="flex items-baseline justify-between gap-3">
                            <span className="text-sm font-medium">{item.label}</span>
                            <time className="shrink-0 text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</time>
                        </div>
                        {item.summary && <p className="mt-1 text-sm break-words text-muted-foreground">{item.summary}</p>}
                        {item.executorName && item.executorId !== userId && (
                            <p className="mt-1 text-xs text-muted-foreground">
                                {tr('relations.by')} {item.executorName}
                            </p>
                        )}
                        {item.executorId === userId && item.userName && item.userId !== userId && (
                            <p className="mt-1 text-xs text-muted-foreground">
                                {tr('relations.actedOn2')} {item.userName}
                            </p>
                        )}
                    </li>
                ))}
            </ol>
            {history.hasNextPage && (
                <Button variant="outline" className="w-full" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
                    {history.isFetchingNextPage ? tr('relations.loading') : tr('common.loadMore')}
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
        title = (
            <>
                {tr('relations.inVoiceTogether')} <span className="text-sky-700 dark:text-sky-400">{formatMinutes(item.minutes)}</span>
            </>
        );
        detail = item.channelName ? tr('relations.channel', { 0: item.channelName }) : null;
    } else if (item.type === 'chat') {
        title = tr('relations.talkedTimes2', { 0: item.exchanges.toLocaleString(dateLocale()) });
        detail = item.channelName ? tr('relations.channel2', { 0: item.channelName }) : null;
    } else {
        title = item.label;
        detail = tr('relations.actedOn', { 0: item.actorName ?? item.actorId, 1: item.targetName ?? tr('relations.theOtherPerson') });
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
                                {first?.name ?? link.a} {tr('relations.with')} {second?.name ?? link.b}
                            </SheetTitle>
                            <SheetDescription>
                                {TIER_LABELS()[link.tier]} {tr('relations.mostly')}
                                {trText(RELATION_KIND_LABELS[link.kind])} {tr('relations.over')} {days} {tr('relations.recentDays')}
                            </SheetDescription>
                        </SheetHeader>
                        <div className="space-y-5 px-4 pb-6">
                            <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant="outline" onClick={() => onSelectPerson(link.a)}>
                                    {tr('relations.viewHistory2')} {first?.name ?? link.a}
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => onSelectPerson(link.b)}>
                                    {tr('relations.viewHistory2')} {second?.name ?? link.b}
                                </Button>
                            </div>
                            <VoiceStat label={tr('relations.inVoiceTogether')} minutes={link.voiceMinutes} />
                            <div className="grid grid-cols-2 gap-2">
                                <Stat
                                    label={tr('relations.talked')}
                                    value={tr('relations.timesCount', { 0: link.chatExchanges.toLocaleString(dateLocale()) })}
                                />
                                <Stat
                                    label={tr('relations.adminActions')}
                                    value={tr('relations.timesCount', { 0: link.modActions.toLocaleString(dateLocale()) })}
                                />
                            </div>
                            <p className="text-xs leading-relaxed text-muted-foreground">
                                {tr('relations.talkedCountsWhenTwoPeopleMessage')} {RELATION_CHAT_WINDOW_MINUTES}{' '}
                                {tr('relations.minutesAnEstimateFromLogsMessage')}
                            </p>
                            <section className="space-y-2">
                                <h3 className="text-sm font-semibold">{tr('relations.timeline')}</h3>
                                {detail.isPending && <ListSkeleton />}
                                {detail.isError && <ErrorState error={detail.error} />}
                                {detail.isSuccess && detail.data.timeline.length === 0 && <EmptyState>{tr('relations.noEntriesInThisPeriod')}</EmptyState>}
                                <ol className="space-y-2">
                                    {detail.data?.timeline.map((item, index) => (
                                        <TimelineRow key={`${item.type}:${item.at}:${index}`} item={item} />
                                    ))}
                                </ol>
                                {detail.data?.truncated && <p className="text-xs text-muted-foreground">{tr('relations.showingOnlyTheLatestEntriesThe')}</p>}
                            </section>
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}
