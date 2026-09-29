import { xpMemberMutationSchema, type XpMemberMutation, type XpMemberMutationResult, type XpResetGuildResult } from '@notstack/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { xpApi, xpHistoryQuery, xpKey } from '@/api/levels';
import { useConfirm } from '@/components/confirm-dialog';
import { ErrorState, LoadingState } from '@/components/states';
import { UserPicker, type PickedUser } from '@/components/user-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { NumberField } from './settings';

const ACTIONS: Record<XpMemberMutation['action'], string> = {
    add: 'เพิ่ม XP / สร้างสมาชิก',
    subtract: 'ลด XP',
    set: 'กำหนด XP ใหม่',
    reset: 'รีเซ็ตเป็น 0',
    delete: 'ลบสมาชิกจากอันดับ',
};
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
                    <CardTitle>จัดการ XP สมาชิก</CardTitle>
                    <CardDescription>เลเวลคำนวณจาก XP ให้อัตโนมัติ · การเพิ่มโดยผู้ดูแลไม่ติดเพดานกิจกรรมรายวัน</CardDescription>
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
                                    title: `${ACTIONS[request.input.action]}: ${request.username}?`,
                                    description: `เหตุผล: ${request.input.reason}`,
                                    destructive: request.input.action !== 'add',
                                })
                            )
                                mutation.mutate(request);
                        }}
                    >
                        <fieldset disabled={mutation.isPending || reset.isPending} className="space-y-4">
                            <UserPicker value={user} onSelect={setUser} onClear={() => setUser(null)} />
                            <label className="grid gap-1.5 text-sm">
                                การดำเนินการ
                                <select
                                    className="h-9 rounded-md border bg-background px-3"
                                    value={action}
                                    onChange={(e) => setAction(e.target.value as XpMemberMutation['action'])}
                                >
                                    {Object.entries(ACTIONS).map(([key, label]) => (
                                        <option value={key} key={key}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            {!['reset', 'delete'].includes(action) && (
                                <NumberField label="จำนวน XP" value={amount} max={2000000000} onChange={setAmount} />
                            )}
                            <label className="grid gap-1.5 text-sm">
                                เหตุผล (บันทึกในประวัติ)
                                <Input
                                    required
                                    maxLength={300}
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder="เช่น รางวัลกิจกรรมประจำสัปดาห์"
                                />
                            </label>
                            <Button type="submit" disabled={!xpMemberMutationSchema.safeParse(input).success || mutation.isPending}>
                                ยืนยันการเปลี่ยนแปลง
                            </Button>
                        </fieldset>
                    </form>
                    <p className="mt-3 text-xs text-muted-foreground">
                        การรีเซ็ต/ลบคง cooldown และโควตาของวันนี้ไว้ สมาชิกที่ถูกลบจะกลับมาในอันดับเมื่อได้ XP ครั้งใหม่
                    </p>
                </CardContent>
            </Card>
            <Card className="border-destructive/40">
                <CardHeader>
                    <CardTitle>รีเซ็ตทั้งเซิร์ฟเวอร์</CardTitle>
                    <CardDescription>ลบ XP และอันดับของทุกคน โดยเก็บกฎและประวัติไว้ การดำเนินการนี้ย้อนกลับจากหน้านี้ไม่ได้</CardDescription>
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
                                    title: 'รีเซ็ต XP ของสมาชิกทุกคน?',
                                    description: 'XP และอันดับทั้งหมดจะถูกลบถาวร ตรวจสอบว่าเลือกเซิร์ฟเวอร์ถูกต้อง',
                                    confirmText: 'รีเซ็ตทุกคน',
                                    destructive: true,
                                })
                            )
                                reset.mutate(request);
                        }}
                    >
                        <fieldset disabled={reset.isPending || mutation.isPending} className="space-y-4">
                            <label className="grid gap-1.5 text-sm">
                                เหตุผล
                                <Input required maxLength={300} value={resetReason} onChange={(e) => setResetReason(e.target.value)} />
                            </label>
                            <label className="grid gap-1.5 text-sm">
                                พิมพ์ RESET XP เพื่อยืนยัน
                                <Input value={resetText} onChange={(e) => setResetText(e.target.value)} autoComplete="off" />
                            </label>
                            <Button type="submit" variant="destructive" disabled={resetText !== 'RESET XP' || !resetReason.trim() || reset.isPending}>
                                รีเซ็ต XP ทั้งเซิร์ฟเวอร์
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
                        <DialogTitle>ดำเนินการสำเร็จ</DialogTitle>
                        <DialogDescription>
                            {completed?.kind === 'member'
                                ? `${ACTIONS[completed.data.action]} · ${completed.username}`
                                : `รีเซ็ต XP ทั้งเซิร์ฟเวอร์ · ${completed?.data.affectedMembers.toLocaleString() ?? 0} คน`}
                        </DialogDescription>
                    </DialogHeader>
                    {completed && (
                        <>
                            {completed.kind === 'member' && (
                                <p className="break-all text-xs text-muted-foreground">Discord ID: {completed.data.userId}</p>
                            )}
                            <dl className="space-y-3 rounded-lg border p-4 text-sm">
                                <div className="flex flex-wrap justify-between gap-2">
                                    <dt>{completed.kind === 'guild' ? 'XP รวมเดิม' : 'XP เดิม'}</dt>
                                    <dd className="font-semibold tabular-nums">{completed.data.beforeXp.toLocaleString()} XP</dd>
                                </div>
                                <div className="flex flex-wrap justify-between gap-2">
                                    <dt>เปลี่ยนแปลง</dt>
                                    <dd
                                        className={`font-semibold tabular-nums ${completed.data.delta < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}
                                    >
                                        {completed.data.delta > 0 ? '+' : ''}
                                        {completed.data.delta.toLocaleString()} XP
                                    </dd>
                                </div>
                                <div className="flex flex-wrap justify-between gap-2 border-t pt-3">
                                    <dt>{completed.kind === 'guild' ? 'XP รวมหลังทำรายการ' : 'XP หลังทำรายการ'}</dt>
                                    <dd className="text-lg font-bold tabular-nums">{completed.data.afterXp.toLocaleString()} XP</dd>
                                </div>
                            </dl>
                            {completed.kind === 'member' && completed.data.action === 'delete' && (
                                <p className="text-sm text-muted-foreground">ลบสมาชิกออกจากอันดับแล้ว สมาชิกจะกลับมาเมื่อได้รับ XP ครั้งใหม่</p>
                            )}
                            <p className="text-xs text-muted-foreground">ยอด ณ เวลาที่ทำรายการสำเร็จ กิจกรรมหลังจากนี้อาจเปลี่ยนยอดได้</p>
                        </>
                    )}
                    <DialogFooter>
                        <Button type="button" onClick={() => setCompleted(null)}>
                            ปิด
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
                <CardTitle>ประวัติ XP</CardTitle>
                <CardDescription>เก็บย้อนหลัง 90 วัน ทั้งกิจกรรมและการแก้ไขโดยผู้ดูแล</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="max-w-md">
                    <UserPicker value={user} onSelect={pick} onClear={() => pick(null)} placeholder="กรองประวัติของสมาชิก..." />
                </div>
                {query.isLoading ? (
                    <LoadingState />
                ) : query.error ? (
                    <ErrorState error={query.error} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b text-muted-foreground">
                                    {['เวลา', 'สมาชิก', 'กิจกรรม / เหตุผล', 'เปลี่ยนแปลง', 'XP หลังทำรายการ', 'ผู้ดูแล (ID)'].map((label) => (
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
                                        <td className={`p-3 font-semibold ${row.delta >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                                            {row.delta > 0 ? '+' : ''}
                                            {row.delta.toLocaleString()}
                                        </td>
                                        <td className="p-3">{row.balance.toLocaleString()}</td>
                                        <td className="p-3">{row.actorId ?? 'อัตโนมัติ'}</td>
                                    </tr>
                                ))}
                                {!query.data?.items.length && (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                                            ยังไม่มีประวัติ
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        disabled={cursors.length === 1 || query.isFetching}
                        onClick={() => setCursors((old) => old.slice(0, -1))}
                    >
                        ก่อนหน้า
                    </Button>
                    <Button
                        variant="outline"
                        disabled={!query.data?.nextCursor || query.isFetching}
                        onClick={() => setCursors((old) => [...old, query.data!.nextCursor!])}
                    >
                        ถัดไป
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
