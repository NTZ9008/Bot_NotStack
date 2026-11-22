import { tr, dateLocale, byLang, trText } from '../../lib/i18n';
import {
    RELATION_KIND_LABELS,
    RELATION_STATUS_TEXT,
    type RelationKind,
    type RelationLink,
    type RelationPresence,
    type RelationPresenceStatus,
    type RelationRole,
} from '@notstack/shared';
import { useQuery } from '@tanstack/react-query';
import { ListFilter, Maximize, Minus, Plus, RotateCcw } from '@/components/icons';
import { useMemo, useRef, useState } from 'react';
import { relationBoardQuery, relationPresenceQuery } from '@/api/relations';
import { useConfirm } from '@/components/confirm-dialog';
import { SearchInput } from '@/components/search-input';
import { EmptyState, ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Avatar, LinkSheet, PersonSheet } from './detail-sheets';
import { BoardCanvas, type BoardHandle, type BoardSelection } from './board-canvas';
import { assignGroups } from './layout';

const RANGES = byLang(() => [
    { days: 7, label: tr('common.last7Days') },
    { days: 30, label: tr('common.last30Days') },
    { days: 90, label: tr('common.last90Days') },
    { days: 365, label: tr('relations.everythingStored') },
]);

const LINE_FILTERS = byLang(() => [
    { tier: 1, label: tr('relations.showAllLinks') },
    { tier: 2, label: tr('relations.coloredLinksOnly') },
    { tier: 3, label: tr('relations.closeFriendsOnly') },
]);

const LEGEND = byLang((): { kind: RelationKind; color: string; unit: string }[] => [
    { kind: 'voice', color: 'var(--chart-2)', unit: tr('common.hour') },
    { kind: 'chat', color: 'var(--chart-4)', unit: tr('common.count') },
    { kind: 'mod', color: 'var(--chart-5)', unit: tr('common.count') },
]);

function RolePicker({ roles, excluded, onChange }: { roles: RelationRole[]; excluded: ReadonlySet<string>; onChange: (next: Set<string>) => void }) {
    const toggle = (roleId: string, checked: boolean) => {
        const next = new Set(excluded);
        if (checked) next.delete(roleId);
        else next.add(roleId);
        onChange(next);
    };
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline">
                    <ListFilter />
                    {tr('relations.pickRoles')}
                    {roles.length - roles.filter((role) => excluded.has(role.id)).length}/{roles.length})
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-2">
                <p className="px-1 pb-2 text-xs text-muted-foreground">{tr('relations.sortedFromTheHighestRolePeople')}</p>
                <div className="flex gap-1 px-1 pb-2">
                    <Button size="sm" variant="secondary" onClick={() => onChange(new Set())}>
                        {tr('relations.selectAll')}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => onChange(new Set(roles.map((role) => role.id)))}>
                        {tr('relations.selectNone')}
                    </Button>
                </div>
                <ul className="max-h-72 space-y-0.5 overflow-y-auto">
                    {roles.map((role) => (
                        <li key={role.id}>
                            <Label className="flex items-center gap-2 rounded-md p-1.5 font-normal hover:bg-accent">
                                <Checkbox checked={!excluded.has(role.id)} onCheckedChange={(checked) => toggle(role.id, checked === true)} />
                                <span
                                    className="size-2.5 shrink-0 rounded-full bg-muted-foreground"
                                    style={role.color ? { background: role.color } : undefined}
                                />
                                <span className="truncate">{role.name}</span>
                            </Label>
                        </li>
                    ))}
                </ul>
            </PopoverContent>
        </Popover>
    );
}

const NO_PRESENCES: Record<string, RelationPresence> = {};
const PRESENCE_LEGEND: { status: RelationPresenceStatus; className: string }[] = [
    { status: 'online', className: 'bg-success' },
    { status: 'idle', className: 'bg-warning' },
    { status: 'dnd', className: 'bg-destructive' },
    { status: 'offline', className: 'bg-neutral-500' },
];

function Legend({ showPresence }: { showPresence: boolean }) {
    return (
        <div className="pointer-events-none absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] rounded-lg border bg-neutral-900/90 px-3 py-2 text-xs text-neutral-100">
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {LEGEND().map(({ kind, color, unit }) => (
                    <li key={kind} className="flex items-center gap-1.5">
                        <span
                            className="h-1 w-8 rounded-full"
                            style={{ background: `linear-gradient(90deg, color-mix(in oklch, ${color} 18%, oklch(0.68 0 0)), ${color})` }}
                            aria-hidden="true"
                        />
                        {trText(RELATION_KIND_LABELS[kind])} ({unit})
                    </li>
                ))}
            </ul>
            {showPresence && (
                <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {PRESENCE_LEGEND.map(({ status, className }) => (
                        <li key={status} className="flex items-center gap-1.5">
                            <span className={`size-2.5 rounded-full ${className}`} aria-hidden="true" />
                            {trText(RELATION_STATUS_TEXT[status])}
                        </li>
                    ))}
                </ul>
            )}
            <p className="mt-1 text-neutral-400">{tr('relations.faintMeansFewTheMoreThe')}</p>
        </div>
    );
}

// ==========================================
// 🕵️ กระดานนักสืบ — ตัวกรอง + พื้นกระดาน + แผงรายละเอียด
// ==========================================
export function RelationBoardView({ guildId }: { guildId: string }) {
    const [days, setDays] = useState(30);
    const [includeBots, setIncludeBots] = useState(false);
    const [minTier, setMinTier] = useState(1);
    const [search, setSearch] = useState('');
    const [selection, setSelection] = useState<BoardSelection>(null);
    const [grouping, setGrouping] = useState<'none' | 'role'>('none');
    const [excludedRoles, setExcludedRoles] = useState<ReadonlySet<string>>(new Set());
    const confirm = useConfirm();
    const canvas = useRef<BoardHandle>(null);

    const board = useQuery(relationBoardQuery(guildId, { days, includeBots }));
    const people = useMemo(() => board.data?.people ?? [], [board.data]);
    const allLinks = useMemo(() => board.data?.links ?? [], [board.data]);
    const links = useMemo(() => allLinks.filter((link) => link.tier >= minTier), [allLinks, minTier]);
    const roles = useMemo(() => board.data?.roles ?? [], [board.data]);
    const groups = useMemo(() => (grouping === 'role' ? assignGroups(people, roles, excludedRoles) : null), [grouping, people, roles, excludedRoles]);
    const pinScope = grouping === 'role' ? `roles:${[...excludedRoles].sort((x, y) => x.localeCompare(y)).join(',')}` : '';
    const peopleById = useMemo(() => new Map(people.map((person) => [person.userId, person])), [people]);

    const memberIds = useMemo(() => people.filter((person) => person.status === 'member').map((person) => person.userId), [people]);
    const presence = useQuery({ ...relationPresenceQuery(guildId, memberIds), enabled: memberIds.length > 0 });
    const presences = presence.data?.presences ?? NO_PRESENCES;

    const query = search.trim().toLowerCase();
    const matches = query ? people.filter((person) => person.name.toLowerCase().includes(query) || person.userId === query).slice(0, 6) : [];
    const goneCount = people.filter((person) => person.status !== 'member').length;

    const selectPerson = (userId: string) => setSelection({ type: 'person', userId });
    const findPerson = (userId: string) => {
        setSearch('');
        canvas.current?.focusPerson(userId);
        selectPerson(userId);
    };
    const selectLink = (link: RelationLink) => setSelection({ type: 'link', link });
    const resetLayout = async () => {
        const accepted = await confirm({
            title: tr('relations.rearrangeTheBoard'),
            description: tr('relations.cardPositionsYouDraggedInThis'),
            confirmText: tr('relations.rearrange'),
        });
        if (accepted) canvas.current?.resetLayout();
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-52 flex-1 sm:max-w-xs">
                    <SearchInput value={search} onChange={setSearch} placeholder={tr('relations.searchPeopleOnTheBoard')} />
                    {matches.length > 0 && (
                        <ul className="absolute top-full z-20 mt-1 w-full rounded-lg border bg-popover p-1 shadow-lg">
                            {matches.map((person) => (
                                <li key={person.userId}>
                                    <button
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-md p-1.5 text-left text-sm hover:bg-accent"
                                        onClick={() => findPerson(person.userId)}
                                    >
                                        <Avatar person={person} userId={person.userId} className="size-6" />
                                        <span className="truncate">{person.name}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}>
                    <SelectTrigger className="w-40" aria-label={tr('relations.timeRange')}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {RANGES().map((range) => (
                            <SelectItem key={range.days} value={String(range.days)}>
                                {range.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={String(minTier)} onValueChange={(value) => setMinTier(Number(value))}>
                    <SelectTrigger className="w-40" aria-label={tr('relations.linksShown')}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {LINE_FILTERS().map((filter) => (
                            <SelectItem key={filter.tier} value={String(filter.tier)}>
                                {filter.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={grouping} onValueChange={(value) => setGrouping(value as 'none' | 'role')}>
                    <SelectTrigger className="w-44" aria-label={tr('relations.grouping')}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">{tr('relations.noGrouping')}</SelectItem>
                        <SelectItem value="role">{tr('relations.groupByHighestRole')}</SelectItem>
                    </SelectContent>
                </Select>
                {grouping === 'role' && roles.length > 0 && <RolePicker roles={roles} excluded={excludedRoles} onChange={setExcludedRoles} />}
                <div className="flex items-center gap-2 px-1">
                    <Switch id="relation-bots" checked={includeBots} onCheckedChange={setIncludeBots} />
                    <Label htmlFor="relation-bots">{tr('relations.showBots')}</Label>
                </div>
                {board.data && (
                    <p className="text-xs text-muted-foreground sm:ml-auto">
                        {people.length.toLocaleString(dateLocale())} {tr('relations.people')} {links.length.toLocaleString(dateLocale())}{' '}
                        {tr('relations.links')}
                        {goneCount > 0 && tr('relations.haveLeft', { 0: goneCount.toLocaleString(dateLocale()) })}
                    </p>
                )}
            </div>

            {board.isError && <ErrorState error={board.error} />}
            {board.isPending && <Skeleton className="h-[72svh] min-h-[480px] w-full rounded-xl" />}
            {board.isSuccess && people.length === 0 && <EmptyState>{tr('relations.noDataInThisPeriodYet')}</EmptyState>}
            {board.isSuccess && people.length > 0 && (
                <div className="relative h-[72svh] min-h-[480px] overflow-hidden rounded-xl border">
                    <BoardCanvas
                        ref={canvas}
                        guildId={guildId}
                        people={people}
                        links={links}
                        layoutLinks={allLinks}
                        groups={groups}
                        pinScope={pinScope}
                        presences={presences}
                        selection={selection}
                        onSelectPerson={selectPerson}
                        onSelectLink={selectLink}
                    />
                    <div className="absolute top-3 right-3 flex flex-col gap-1">
                        <Button size="icon" variant="secondary" aria-label={tr('relations.zoomIn')} onClick={() => canvas.current?.zoom(1.25)}>
                            <Plus />
                        </Button>
                        <Button size="icon" variant="secondary" aria-label={tr('relations.zoomOut')} onClick={() => canvas.current?.zoom(0.8)}>
                            <Minus />
                        </Button>
                        <Button size="icon" variant="secondary" aria-label={tr('relations.fitBoard')} onClick={() => canvas.current?.fit()}>
                            <Maximize />
                        </Button>
                        <Button size="icon" variant="secondary" aria-label={tr('relations.rearrangeBoard')} onClick={() => void resetLayout()}>
                            <RotateCcw />
                        </Button>
                    </div>
                    <Legend showPresence={presence.data?.available === true} />
                </div>
            )}
            {presence.data?.available === false && <p className="text-xs text-muted-foreground">{tr('relations.onlineStatusIsntAvailableYetThe')}</p>}
            {board.data && board.data.hiddenPeople > 0 && (
                <p className="text-xs text-muted-foreground">
                    {tr('relations.showingOnlyTheMostConnectedPeople')} {board.data.hiddenPeople.toLocaleString(dateLocale())}{' '}
                    {tr('relations.morePeopleNotOnTheBoard')}
                </p>
            )}

            <PersonSheet
                guildId={guildId}
                person={selection?.type === 'person' ? (peopleById.get(selection.userId) ?? null) : null}
                presence={selection?.type === 'person' ? (presences[selection.userId] ?? null) : null}
                days={days}
                links={allLinks}
                peopleById={peopleById}
                onClose={() => setSelection(null)}
                onSelectLink={selectLink}
            />
            <LinkSheet
                guildId={guildId}
                link={selection?.type === 'link' ? selection.link : null}
                days={days}
                peopleById={peopleById}
                onClose={() => setSelection(null)}
                onSelectPerson={selectPerson}
            />
        </div>
    );
}
