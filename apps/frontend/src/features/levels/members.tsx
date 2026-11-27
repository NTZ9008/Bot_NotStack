import { tr, trText, byLang } from '../../lib/i18n';
import { xpAtLevel, xpForNextLevel, xpMemberMutationSchema, XP_SOURCE_LABELS, type XpMemberMutation, type XpMemberMutationResult } from '@notstack/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { levelsQuery } from '@/api/bot';
import { xpApi, xpHistoryQuery, xpKey } from '@/api/levels';
import { useConfirm } from '@/components/confirm-dialog';
import { Pagination } from '@/components/pagination';
import { XpHistoryTableSkeleton } from '@/components/skeleton/levels';
import { ErrorState } from '@/components/states';
import { UserPicker, type PickedUser } from '@/components/user-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Segmented } from '@/features/welcome/form-controls';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { NumberField } from './settings';
import { LevelBar, LevelChip } from './tiers';

const ACTIONS = byLang((): Record<XpMemberMutation['action'], string> => ({
    add: tr('levels.addXp'),
    subtract: tr('levels.takeXp'),
    set: tr('levels.setXp'),
    reset: tr('levels.resetTo0'),
    delete: tr('levels.removeMemberFromLeaderboard'),
}));
const DESTRUCTIVE: XpMemberMutation['action'][] = ['reset', 'delete'];
const SUBMIT = { add: 'levels.submitAdd', subtract: 'levels.submitSubtract', set: 'levels.submitSet' } as const;

// "admin.add" / "message" ในประวัติ → ชื่อที่คนอ่านเข้าใจ
function sourceLabel(source: string): string {
    if (source === 'admin.reset_all') return tr('levels.resetTheWholeServer');
    if (source.startsWith('admin.')) return ACTIONS()[source.slice(6) as XpMemberMutation['action']] ?? source;
    return source in XP_SOURCE_LABELS ? trText(XP_SOURCE_LABELS[source as keyof typeof XP_SOURCE_LABELS]) : source;
}
const rawLabel = (source: string) => (source in XP_SOURCE_LABELS ? XP_SOURCE_LABELS[source as keyof typeof XP_SOURCE_LABELS] : source);
const extraReason = (row: { reason: string; source: string }) =>
    row.reason && row.reason !== row.source && row.reason !== rawLabel(row.source) && row.reason !== sourceLabel(row.source) ? row.reason : null;
const signed = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString()}`;

export interface XpMember {
    userId: string;
    username: string;
}

// แผงด้านข้างของสมาชิกหนึ่งคน: สถานะ → ปรับ XP → ประวัติของคนนั้น อยู่ที่เดียวกัน ไม่ต้องสลับแท็บไปค้นหาซ้ำ
// member = 'pick' → ยังไม่ได้เลือกใคร (ปุ่ม "ปรับ XP สมาชิก" ใช้กับคนที่ยังไม่อยู่ในอันดับได้)
export function MemberXpSheet({ guildId, member, onClose }: { guildId: string; member: XpMember | 'pick' | null; onClose: () => void }) {
    const [picked, setPicked] = useState<XpMember | null>(null);
    const current = member === 'pick' ? picked : member;
    return (
        <Sheet
            open={member !== null}
            onOpenChange={(open) => {
                if (open) return;
                setPicked(null);
                onClose();
            }}
        >
            <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
                <SheetHeader className="border-b">
                    <SheetTitle className="truncate pr-8">{current ? current.username : tr('levels.adjustMemberXp')}</SheetTitle>
                    <SheetDescription className="font-mono text-xs">{current ? current.userId : tr('levels.pickAMemberFirst')}</SheetDescription>
                </SheetHeader>
                <div className="space-y-6 p-4">
                    {member === 'pick' && (
                        <UserPicker
                            value={picked && { userId: picked.userId, username: picked.username, tag: '', avatar: '', nickname: null }}
                            onSelect={(user: PickedUser) => setPicked({ userId: user.userId, username: user.nickname || user.username })}
                            onClear={() => setPicked(null)}
                        />
                    )}
                    {current && <MemberXpBody key={current.userId} guildId={guildId} member={current} />}
                </div>
            </SheetContent>
        </Sheet>
    );
}

function MemberXpBody({ guildId, member }: { guildId: string; member: XpMember }) {
    const client = useQueryClient(),
        confirm = useConfirm();
    const status = useQuery(levelsQuery(guildId, { userId: member.userId, page: 1, pageSize: 1 }));
    const row = status.data?.items[0];
    const [action, setAction] = useState<XpMemberMutation['action']>('add');
    const [amount, setAmount] = useState(100);
    const [reason, setReason] = useState('');
    const destructive = DESTRUCTIVE.includes(action);
    const input = { userId: member.userId, action, amount: destructive ? 0 : amount, reason };
    const valid = xpMemberMutationSchema.safeParse(input).success;
    const mutation = useMutation({
        mutationFn: (request: XpMemberMutation) => xpApi.member(guildId, request),
        onSuccess: (data: XpMemberMutationResult) => {
            void client.invalidateQueries({ queryKey: xpKey(guildId) });
            setReason('');
            toast.success(`${ACTIONS()[data.action]} · ${member.username}`, {
                description: `${data.beforeXp.toLocaleString()} → ${data.afterXp.toLocaleString()} XP (${signed(data.delta)})`,
            });
        },
        onError: (err) => toast.error(errorMessage(err)),
    });
    const settings = status.data?.settings;
    const percent =
        row && settings
            ? Math.max(
                  0,
                  Math.min(100, ((row.xp - xpAtLevel(row.level, settings)) / (xpForNextLevel(row.level, settings) - xpAtLevel(row.level, settings))) * 100),
              )
            : 0;
    return (
        <>
            <section aria-label={tr('levels.currentStatus')} className="grid grid-cols-3 gap-2">
                {status.isLoading ? (
                    <p className="col-span-3 text-sm text-muted-foreground">{tr('common.loadingData2')}</p>
                ) : row ? (
                    <>
                        <Stat label={tr('common.rank')} value={`#${row.rank.toLocaleString()}`} />
                        <Stat label={tr('levels.level')} value={row.level.toLocaleString()} />
                        <Stat label="XP" value={row.xp.toLocaleString()} />
                        <div className="col-span-3 flex items-center gap-3">
                            <LevelChip level={row.level} />
                            <LevelBar className="flex-1" level={row.level} percent={percent} label={tr('levels.levelProgressOf', { 0: member.username })} />
                        </div>
                    </>
                ) : (
                    <p className="col-span-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">{tr('levels.noXpYetAddToStart')}</p>
                )}
            </section>

            <form
                className="space-y-4"
                onSubmit={async (e) => {
                    e.preventDefault();
                    const parsed = xpMemberMutationSchema.safeParse(input);
                    if (!parsed.success || mutation.isPending) return;
                    if (
                        parsed.data.action !== 'add' &&
                        !(await confirm({
                            title: `${ACTIONS()[parsed.data.action]}: ${member.username}?`,
                            description: tr('levels.reason', { 0: parsed.data.reason }),
                            destructive: true,
                        }))
                    )
                        return;
                    mutation.mutate(parsed.data);
                }}
            >
                <h3 className="font-semibold">{tr('levels.adjustXp')}</h3>
                <fieldset disabled={mutation.isPending} className="space-y-4">
                    <Segmented value={action} options={ACTIONS()} onChange={setAction} />
                    {!destructive && <NumberField label={tr('common.xpAmount')} value={amount} max={2000000000} onChange={setAmount} />}
                    {destructive && <p className="text-sm text-muted-foreground">{tr('levels.resetRemoveKeepsTodaysCooldownAnd')}</p>}
                    <label className="grid gap-1.5 text-sm">
                        {tr('levels.reasonKeptInHistory')}
                        <Input
                            required
                            maxLength={300}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder={tr('levels.eGWeeklyEventReward')}
                        />
                    </label>
                    <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={!valid || mutation.isPending}>
                        {destructive
                            ? ACTIONS()[action]
                            : tr(SUBMIT[action as keyof typeof SUBMIT], { xp: (Number.isNaN(amount) ? 0 : amount).toLocaleString() })}
                    </Button>
                </fieldset>
            </form>

            <section className="space-y-2">
                <h3 className="font-semibold">{tr('levels.historyOfThisMember')}</h3>
                <XpHistoryTable guildId={guildId} userId={member.userId} />
            </section>
        </>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-md bg-muted p-3 text-center">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold tabular-nums">{value}</p>
        </div>
    );
}

export function XpHistoryPanel({ guildId }: { guildId: string }) {
    const [user, setUser] = useState<PickedUser | null>(null);
    return (
        <Card>
            <CardHeader>
                <CardTitle>{tr('levels.xpHistory')}</CardTitle>
                <CardDescription>{tr('levels.keptFor90DaysBothActivity')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="max-w-md">
                    <UserPicker value={user} onSelect={setUser} onClear={() => setUser(null)} placeholder={tr('levels.filterHistoryByMember')} />
                </div>
                <XpHistoryTable key={user?.userId ?? 'all'} guildId={guildId} userId={user?.userId} showMember={!user} />
            </CardContent>
        </Card>
    );
}

function XpHistoryTable({ guildId, userId, showMember = false }: { guildId: string; userId?: string; showMember?: boolean }) {
    const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
    const query = useQuery(xpHistoryQuery(guildId, userId, cursors.at(-1)));
    if (query.isLoading) return <XpHistoryTableSkeleton />;
    if (query.error) return <ErrorState error={query.error} />;
    const items = query.data?.items ?? [];
    const pager = (cursors.length > 1 || query.data?.nextCursor) && (
        <Pagination
            page={cursors.length}
            pageCount={cursors.length}
            hasMore={Boolean(query.data?.nextCursor)}
            busy={query.isFetching}
            onPageChange={(page) => setCursors((old) => (page > old.length ? [...old, query.data!.nextCursor!] : old.slice(0, Math.max(1, page))))}
        />
    );
    if (userId && !showMember)
        return (
            <>
                <ul className="divide-y rounded-lg border">
                    {items.map((row) => (
                        <li key={row.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                            <div className="min-w-0">
                                <p className="font-medium">{sourceLabel(row.source)}</p>
                                {extraReason(row) && <p className="break-words text-muted-foreground">{extraReason(row)}</p>}
                                <p className="text-xs text-muted-foreground">
                                    {formatDateTime(row.createdAt)} · {tr('levels.by')}{' '}
                                    {row.actorId === null ? tr('common.auto') : (row.actorName ?? `#${row.actorId}`)}
                                </p>
                            </div>
                            <div className="shrink-0 text-right tabular-nums">
                                <p className={`font-semibold ${row.delta >= 0 ? 'text-success' : 'text-destructive'}`}>{signed(row.delta)}</p>
                                <p className="text-xs text-muted-foreground">= {row.balance.toLocaleString()}</p>
                            </div>
                        </li>
                    ))}
                    {!items.length && <li className="p-6 text-center text-muted-foreground">{tr('levels.noHistoryYet')}</li>}
                </ul>
                {pager}
            </>
        );
    const headers = [
        tr('common.time'),
        ...(showMember ? [tr('common.members')] : []),
        tr('levels.activityReason'),
        tr('levels.change'),
        tr('levels.xpAfter'),
        tr('levels.by'),
    ];
    return (
        <>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="border-b text-muted-foreground">
                            {headers.map((label) => (
                                <th key={label} className="p-2 font-medium">
                                    {label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {query.data?.items.map((row) => (
                            <tr className="border-b" key={row.id}>
                                <td className="whitespace-nowrap p-2 text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</td>
                                {showMember && (
                                    <td className="p-2">
                                        <p className="font-medium">{row.username ?? row.userId}</p>
                                        {row.username && <p className="font-mono text-xs text-muted-foreground">{row.userId}</p>}
                                    </td>
                                )}
                                <td className="p-2">
                                    <p>{sourceLabel(row.source)}</p>
                                    {extraReason(row) && <p className="text-xs text-muted-foreground">{extraReason(row)}</p>}
                                </td>
                                <td className={`whitespace-nowrap p-2 font-semibold tabular-nums ${row.delta >= 0 ? 'text-success' : 'text-destructive'}`}>
                                    {signed(row.delta)}
                                </td>
                                <td className="p-2 tabular-nums">{row.balance.toLocaleString()}</td>
                                <td className="p-2">{row.actorId === null ? tr('common.auto') : (row.actorName ?? `#${row.actorId}`)}</td>
                            </tr>
                        ))}
                        {!query.data?.items.length && (
                            <tr>
                                <td colSpan={headers.length} className="p-8 text-center text-muted-foreground">
                                    {tr('levels.noHistoryYet')}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            {pager}
        </>
    );
}

// โซนอันตราย — แยกออกจากงานประจำวัน ต้องพิมพ์ยืนยันและกดยืนยันอีกชั้น
export function ResetServerPanel({ guildId }: { guildId: string }) {
    const [resetText, setResetText] = useState('');
    const [resetReason, setResetReason] = useState('');
    const confirm = useConfirm(),
        client = useQueryClient();
    const reset = useMutation({
        mutationFn: (request: { reason: string; confirmation: string }) => xpApi.reset(guildId, request.reason, request.confirmation),
        onSuccess: (data) => {
            void client.invalidateQueries({ queryKey: xpKey(guildId) });
            setResetText('');
            setResetReason('');
            toast.success(tr('levels.serverXpResetPeople', { 0: data.affectedMembers.toLocaleString() }), {
                description: `${data.beforeXp.toLocaleString()} → ${data.afterXp.toLocaleString()} XP`,
            });
        },
        onError: (err) => toast.error(errorMessage(err)),
    });
    const ready = resetText === 'RESET XP' && resetReason.trim() !== '';
    return (
        <Card className="border-destructive/40">
            <CardHeader>
                <CardTitle>{tr('levels.resetTheWholeServer')}</CardTitle>
                <CardDescription>{tr('levels.deletesEveryonesXpAndRanksBut')}</CardDescription>
            </CardHeader>
            <CardContent>
                <form
                    className="max-w-md space-y-4"
                    onSubmit={async (e) => {
                        e.preventDefault();
                        if (!ready || reset.isPending) return;
                        if (
                            await confirm({
                                title: tr('levels.resetXpForEveryMember'),
                                description: tr('levels.allXpAndRanksWillBe'),
                                confirmText: tr('levels.resetEveryone'),
                                destructive: true,
                            })
                        )
                            reset.mutate({ reason: resetReason, confirmation: resetText });
                    }}
                >
                    <fieldset disabled={reset.isPending} className="space-y-4">
                        <label className="grid gap-1.5 text-sm">
                            {tr('common.reason')}
                            <Input required maxLength={300} value={resetReason} onChange={(e) => setResetReason(e.target.value)} />
                        </label>
                        <label className="grid gap-1.5 text-sm">
                            {tr('levels.typeResetXpToConfirm')}
                            <Input value={resetText} onChange={(e) => setResetText(e.target.value)} autoComplete="off" />
                        </label>
                        <Button type="submit" variant="destructive" disabled={!ready || reset.isPending}>
                            {tr('levels.resetServerXp')}
                        </Button>
                    </fieldset>
                </form>
            </CardContent>
        </Card>
    );
}
