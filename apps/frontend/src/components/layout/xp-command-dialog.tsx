import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { levelsQuery } from '@/api/bot';
import { xpApi, xpKey } from '@/api/levels';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { errorMessage } from '@/lib/api';
import { describeXpCommand, MAX_COMMAND_XP, previewXp, XP_ACTION_LABEL, type XpCommandAction } from '@/lib/command-parser';
import { DEFAULT_AVATAR, formatNumber } from '@/lib/format';

export interface XpCommandTarget {
    userId: string;
    username: string;
    avatar?: string | null;
}

export interface XpCommandRequest {
    member: XpCommandTarget;
    action: XpCommandAction;
    amount: number;
    reason?: string;
}

const DEFAULT_REASON = 'ปรับผ่าน Command Palette';

// ==========================================
// ✅ ยืนยันก่อนแก้ XP จากช่อง ⌘K — เห็น XP ตอนนี้ → หลังแก้ แก้จำนวน / เหตุผลได้ก่อนกด
// บันทึกผ่าน API เดียวกับหน้า "จัดการสมาชิก" (ลง xp_history + audit log พร้อมเหตุผล)
// ==========================================
export function XpCommandDialog({ guildId, request, onClose }: { guildId: string; request: XpCommandRequest; onClose: () => void }) {
    const [action, setAction] = useState<XpCommandAction>(request.action);
    const [amount, setAmount] = useState(String(request.amount || ''));
    const [reason, setReason] = useState(request.reason ?? DEFAULT_REASON);
    const client = useQueryClient();
    const { member } = request;

    const current = useQuery(levelsQuery(guildId, { userId: member.userId, page: 1, pageSize: 1 }));
    const row = current.data?.items.find((item) => item.userId === member.userId);
    const currentXp = row?.xp ?? 0;
    const value = action === 'reset' ? 0 : Number(amount);
    const valid = action === 'reset' || (Number.isInteger(value) && value >= 0 && value <= MAX_COMMAND_XP && (value > 0 || action === 'set'));
    const after = valid ? previewXp(action, currentXp, value) : null;

    const mutation = useMutation({
        mutationFn: () => xpApi.member(guildId, { userId: member.userId, action, amount: value, reason: reason.trim() }),
        onSuccess: (data) => {
            void client.invalidateQueries({ queryKey: xpKey(guildId) });
            toast.success(`${describeXpCommand(action, value)} — ${member.username}`, {
                description: `${formatNumber(data.beforeXp)} → ${formatNumber(data.afterXp)} XP`,
            });
            onClose();
        },
        onError: (err) => toast.error(errorMessage(err)),
    });

    return (
        <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{describeXpCommand(action, value || 0)}</DialogTitle>
                    <DialogDescription>ตรวจสอบก่อนบันทึก — การแก้ XP ถูกเก็บในประวัติ XP และประวัติการตั้งค่าพร้อมเหตุผล</DialogDescription>
                </DialogHeader>
                <form
                    className="space-y-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (valid && reason.trim() && !mutation.isPending) mutation.mutate();
                    }}
                >
                    <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                        <Avatar className="size-10">
                            <AvatarImage src={member.avatar ?? DEFAULT_AVATAR} alt="" />
                            <AvatarFallback>{member.username.slice(0, 1)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{member.username}</p>
                            <p className="truncate font-mono text-xs text-muted-foreground">{member.userId}</p>
                        </div>
                        <div className="flex items-center gap-2 font-mono text-sm tabular-nums">
                            {current.isLoading ? (
                                <Loader2 className="size-4 animate-spin text-muted-foreground" />
                            ) : current.isError ? (
                                <span className="font-sans text-xs text-muted-foreground">ดู XP ตอนนี้ไม่ได้</span>
                            ) : (
                                <>
                                    <span className="text-muted-foreground">{formatNumber(currentXp)}</span>
                                    <ArrowRight className="size-3.5 text-muted-foreground" />
                                    <span className="font-semibold">{after === null ? '—' : formatNumber(after)}</span>
                                </>
                            )}
                        </div>
                    </div>

                    <ToggleGroup
                        type="single"
                        variant="outline"
                        className="w-full"
                        value={action}
                        onValueChange={(next) => next && setAction(next as XpCommandAction)}
                    >
                        {(Object.keys(XP_ACTION_LABEL) as XpCommandAction[]).map((key) => (
                            <ToggleGroupItem key={key} value={key} className="flex-1">
                                {XP_ACTION_LABEL[key]}
                            </ToggleGroupItem>
                        ))}
                    </ToggleGroup>

                    {action !== 'reset' && (
                        <div className="space-y-1.5">
                            <Label htmlFor="xp-command-amount">จำนวน XP</Label>
                            <Input
                                id="xp-command-amount"
                                inputMode="numeric"
                                autoFocus
                                value={amount}
                                onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
                                aria-invalid={!valid}
                            />
                        </div>
                    )}
                    <div className="space-y-1.5">
                        <Label htmlFor="xp-command-reason">เหตุผล</Label>
                        <Input
                            id="xp-command-reason"
                            value={reason}
                            maxLength={300}
                            onChange={(e) => setReason(e.target.value)}
                            aria-invalid={!reason.trim()}
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onClose} disabled={mutation.isPending}>
                            ยกเลิก
                        </Button>
                        <Button
                            type="submit"
                            disabled={!valid || !reason.trim() || mutation.isPending}
                            variant={action === 'reset' ? 'destructive' : 'default'}
                        >
                            {mutation.isPending && <Loader2 className="animate-spin" />}
                            ยืนยัน
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
