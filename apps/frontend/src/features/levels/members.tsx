import { tr, byLang } from '../../lib/i18n';
import { xpMemberMutationSchema, type XpMemberMutation, type XpMemberMutationResult, type XpResetGuildResult } from '@notstack/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { xpApi, xpHistoryQuery, xpKey } from '@/api/levels';
import { useConfirm } from '@/components/confirm-dialog';
import { XpHistoryTableSkeleton } from '@/components/skeleton/levels';
import { ErrorState } from '@/components/states';
import { UserPicker, type PickedUser } from '@/components/user-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { NumberField } from './settings';

const ACTIONS = byLang((): Record<XpMemberMutation['action'], string> => ({
    add: tr('levels.addXpCreateMember'),
    subtract: tr('levels.takeXp'),
    set: tr('levels.setXp'),
    reset: tr('levels.resetTo0'),
    delete: tr('levels.removeMemberFromLeaderboard'),
}));
type CompletedChange = { kind: 'member'; data: XpMemberMutationResult; username: string } | { kind: 'guild'; data: XpResetGuildResult };

export function XpMembersPanel({ guildId }: { guildId: string }) {
    const [completed, setCompleted] = useState<CompletedChange | null>(null);
    const [user, setUser] = useState<PickedUser | null>(null);
    const [action, setAction] = useState<XpMemberMutation['action']>('add');
    const [amount, setAmount] = useState(100);
    const [reason, setReason] = useState('');
    const [resetText, setResetText] = useState('');
    const [resetReason, setResetReason] = useState('');
    const confirm = useConfirm(),
        client = useQueryClient();
    const input = { userId: user?.userId ?? '', action, amount: ['reset', 'delete'].includes(action) ? 0 : amount, reason };
    const mutation = useMutation({
        mutationFn: (request: { input: XpMemberMutation; username: string }) => xpApi.member(guildId, request.input),
        onSuccess: (data, request) => {
            void client.invalidateQueries({ queryKey: xpKey(guildId) });
            setReason('');
            setCompleted({ kind: 'member', data, username: request.username });
        },
        onError: (err) => toast.error(errorMessage(err)),
    });
    const reset = useMutation({
        mutationFn: (request: { reason: string; confirmation: string }) => xpApi.reset(guildId, request.reason, request.confirmation),
        onSuccess: (data) => {
            void client.invalidateQueries({ queryKey: xpKey(guildId) });
            setResetText('');
            setResetReason('');
            setCompleted({ kind: 'guild', data });
        },
        onError: (err) => toast.error(errorMessage(err)),
    });
    return (
        <div className="grid gap-5 lg:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle>{tr('levels.manageMemberXp')}</CardTitle>
                    <CardDescription>{tr('levels.levelsAreCalculatedFromXpAutomatically')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <form
                        className="space-y-4"
                        onSubmit={async (e) => {
                            e.preventDefault();
                            const parsed = xpMemberMutationSchema.safeParse(input);
                            if (!parsed.success || !user || mutation.isPending || reset.isPending) return;
                            const request = { input: parsed.data, username: user.username };
                            if (
                                await confirm({
                                    title: `${ACTIONS()[request.input.action]}: ${request.username}?`,
                                    description: tr('levels.reason', { 0: request.input.reason }),
                                    destructive: request.input.action !== 'add',
                                })
                            )
                                mutation.mutate(request);
                        }}
                    >
                        <fieldset disabled={mutation.isPending || reset.isPending} className="space-y-4">
                            <UserPicker value={user} onSelect={setUser} onClear={() => setUser(null)} />
                            <label className="grid gap-1.5 text-sm">
                                {tr('levels.action')}
                                <select
                                    className="h-9 rounded-md border bg-background px-3"
                                    value={action}
                                    onChange={(e) => setAction(e.target.value as XpMemberMutation['action'])}
                                >
                                    {Object.entries(ACTIONS()).map(([key, label]) => (
                                        <option value={key} key={key}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            {!['reset', 'delete'].includes(action) && (
                                <NumberField label={tr('common.xpAmount')} value={amount} max={2000000000} onChange={setAmount} />
                            )}
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
                            <Button type="submit" disabled={!xpMemberMutationSchema.safeParse(input).success || mutation.isPending}>
                                {tr('levels.confirmChange')}
                            </Button>
                        </fieldset>
                    </form>
                    <p className="mt-3 text-xs text-muted-foreground">{tr('levels.resetRemoveKeepsTodaysCooldownAnd')}</p>
                </CardContent>
            </Card>
            <Card className="border-destructive/40">
                <CardHeader>
                    <CardTitle>{tr('levels.resetTheWholeServer')}</CardTitle>
                    <CardDescription>{tr('levels.deletesEveryonesXpAndRanksBut')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <form
                        className="space-y-4"
                        onSubmit={async (e) => {
                            e.preventDefault();
                            if (resetText !== 'RESET XP' || !resetReason.trim() || mutation.isPending || reset.isPending) return;
                            const request = { reason: resetReason, confirmation: resetText };
                            if (
                                await confirm({
                                    title: tr('levels.resetXpForEveryMember'),
                                    description: tr('levels.allXpAndRanksWillBe'),
                                    confirmText: tr('levels.resetEveryone'),
                                    destructive: true,
                                })
                            )
                                reset.mutate(request);
                        }}
                    >
                        <fieldset disabled={reset.isPending || mutation.isPending} className="space-y-4">
                            <label className="grid gap-1.5 text-sm">
                                {tr('common.reason')}
                                <Input required maxLength={300} value={resetReason} onChange={(e) => setResetReason(e.target.value)} />
                            </label>
                            <label className="grid gap-1.5 text-sm">
                                {tr('levels.typeResetXpToConfirm')}
                                <Input value={resetText} onChange={(e) => setResetText(e.target.value)} autoComplete="off" />
                            </label>
                            <Button type="submit" variant="destructive" disabled={resetText !== 'RESET XP' || !resetReason.trim() || reset.isPending}>
                                {tr('levels.resetServerXp')}
                            </Button>
                        </fieldset>
                    </form>
                </CardContent>
            </Card>
            <Dialog
                open={completed !== null}
                onOpenChange={(open) => {
                    if (!open) setCompleted(null);
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{tr('levels.done')}</DialogTitle>
                        <DialogDescription>
                            {completed?.kind === 'member'
                                ? `${ACTIONS()[completed.data.action]} · ${completed.username}`
                                : tr('levels.serverXpResetPeople', { 0: completed?.data.affectedMembers.toLocaleString() ?? 0 })}
                        </DialogDescription>
                    </DialogHeader>
                    {completed && (
                        <>
                            {completed.kind === 'member' && <p className="break-all text-xs text-muted-foreground">Discord ID: {completed.data.userId}</p>}
                            <dl className="space-y-3 rounded-lg border p-4 text-sm">
                                <div className="flex flex-wrap justify-between gap-2">
                                    <dt>{completed.kind === 'guild' ? tr('levels.previousTotalXp') : tr('levels.previousXp')}</dt>
                                    <dd className="font-semibold tabular-nums">{completed.data.beforeXp.toLocaleString()} XP</dd>
                                </div>
                                <div className="flex flex-wrap justify-between gap-2">
                                    <dt>{tr('levels.change')}</dt>
                                    <dd
                                        className={`font-semibold tabular-nums ${completed.data.delta < 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'}`}
                                    >
                                        {completed.data.delta > 0 ? '+' : ''}
                                        {completed.data.delta.toLocaleString()} XP
                                    </dd>
                                </div>
                                <div className="flex flex-wrap justify-between gap-2 border-t pt-3">
                                    <dt>{completed.kind === 'guild' ? tr('levels.totalXpAfter') : tr('levels.xpAfter')}</dt>
                                    <dd className="text-lg font-bold tabular-nums">{completed.data.afterXp.toLocaleString()} XP</dd>
                                </div>
                            </dl>
                            {completed.kind === 'member' && completed.data.action === 'delete' && (
                                <p className="text-sm text-muted-foreground">{tr('levels.memberRemovedFromTheLeaderboardThey')}</p>
                            )}
                            <p className="text-xs text-muted-foreground">{tr('levels.valuesAsOfWhenTheAction')}</p>
                        </>
                    )}
                    <DialogFooter>
                        <Button type="button" onClick={() => setCompleted(null)}>
                            {tr('common.close')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export function XpHistoryPanel({ guildId }: { guildId: string }) {
    const [user, setUser] = useState<PickedUser | null>(null);
    const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
    const query = useQuery(xpHistoryQuery(guildId, user?.userId, cursors.at(-1)));
    const pick = (next: PickedUser | null) => {
        setUser(next);
        setCursors([undefined]);
    };
    return (
        <Card>
            <CardHeader>
                <CardTitle>{tr('levels.xpHistory')}</CardTitle>
                <CardDescription>{tr('levels.keptFor90DaysBothActivity')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="max-w-md">
                    <UserPicker value={user} onSelect={pick} onClear={() => pick(null)} placeholder={tr('levels.filterHistoryByMember')} />
                </div>
                {query.isLoading ? (
                    <XpHistoryTableSkeleton />
                ) : query.error ? (
                    <ErrorState error={query.error} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b text-muted-foreground">
                                    {[
                                        tr('common.time'),
                                        tr('common.members'),
                                        tr('levels.activityReason'),
                                        tr('levels.change'),
                                        tr('levels.xpAfter'),
                                        tr('levels.adminId'),
                                    ].map((label) => (
                                        <th key={label} className="p-3">
                                            {label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {query.data?.items.map((row) => (
                                    <tr className="border-b" key={row.id}>
                                        <td className="whitespace-nowrap p-3">{formatDateTime(row.createdAt)}</td>
                                        <td className="p-3 font-mono text-xs">{row.userId}</td>
                                        <td className="p-3">
                                            <p>{row.reason}</p>
                                            <p className="text-xs text-muted-foreground">{row.source}</p>
                                        </td>
                                        <td className={`p-3 font-semibold ${row.delta >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}`}>
                                            {row.delta > 0 ? '+' : ''}
                                            {row.delta.toLocaleString()}
                                        </td>
                                        <td className="p-3">{row.balance.toLocaleString()}</td>
                                        <td className="p-3">{row.actorId ?? tr('common.auto')}</td>
                                    </tr>
                                ))}
                                {!query.data?.items.length && (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                                            {tr('levels.noHistoryYet')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
                <div className="flex gap-2">
                    <Button variant="outline" disabled={cursors.length === 1 || query.isFetching} onClick={() => setCursors((old) => old.slice(0, -1))}>
                        {tr('levels.previous')}
                    </Button>
                    <Button
                        variant="outline"
                        disabled={!query.data?.nextCursor || query.isFetching}
                        onClick={() => setCursors((old) => [...old, query.data!.nextCursor!])}
                    >
                        {tr('levels.next')}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
