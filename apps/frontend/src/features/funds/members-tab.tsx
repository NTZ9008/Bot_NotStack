import { formatBaht, roundMoney, type FundMemberView, type FundTopicDetail } from '@notstack/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowUpDown, Banknote, Calendar, CheckCheck, History, Loader2, Trash2, Users, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { fundApi } from '@/api/fund';
import { guildRolesQuery } from '@/api/guilds';
import { useConfirm } from '@/components/confirm-dialog';
import { Field } from '@/components/field';
import { SearchInput } from '@/components/search-input';
import { EmptyState } from '@/components/states';
import { UserPicker } from '@/components/user-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGuildId } from '@/hooks/use-guild';
import { cn } from '@/lib/utils';
import { PaidCell, TargetCell } from './member-cells';
import { STATUS_LABEL, onFundError, useFundRefresh } from './utils';

// ==========================================
// 👥 รายชื่อ + เพิ่ม/ลบคน + เลือกหลายคน (Bulk Actions) + ค้นหา/กรอง/เรียงลำดับ
// ==========================================
type MemberFilter = 'all' | 'owing' | 'partial' | 'unpaid' | 'paid';
type MemberSort = 'default' | 'remaining_desc' | 'paid_desc' | 'name_asc';

export function MembersTab({
    topic,
    onPay,
    onBatchPay,
    onViewHistory,
}: {
    topic: FundTopicDetail;
    onPay: (member: FundMemberView | null) => void;
    onBatchPay?: (memberIds: number[]) => void;
    onViewHistory?: (memberId: number) => void;
}) {
    const guildId = useGuildId();
    const refresh = useFundRefresh();
    const confirm = useConfirm();
    const { data: roles = [] } = useQuery(guildRolesQuery(guildId));
    const [roleId, setRoleId] = useState('');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<MemberFilter>('all');
    const [sortBy, setSortBy] = useState<MemberSort>('default');
    const [selectedIds, setSelectedIds] = useState<number[]>([]);

    const paymentCountByMember = useMemo(() => {
        const map = new Map<number, number>();
        for (const p of topic.payments) {
            map.set(p.memberId, (map.get(p.memberId) ?? 0) + 1);
        }
        return map;
    }, [topic.payments]);

    const add = useMutation({
        mutationFn: (input: { userIds?: string[]; roleId?: string }) => fundApi.addMembers(guildId, topic.id, input),
        onSuccess: (res) => {
            toast.success(res.message ?? 'เพิ่มคนแล้ว');
            setRoleId('');
            void refresh();
        },
        onError: onFundError,
    });

    const payFull = useMutation({
        mutationFn: (member: FundMemberView) => fundApi.addPayment(guildId, topic.id, { memberId: member.id, amount: member.remaining, note: 'จ่ายครบ' }),
        onSuccess: () => {
            toast.success('บันทึกว่าจ่ายครบแล้ว');
            void refresh();
        },
        onError: onFundError,
    });
    const payingMemberId = payFull.isPending ? payFull.variables?.id : undefined;

    const bulkPayFull = useMutation({
        mutationFn: async (membersToPay: FundMemberView[]) => {
            for (const m of membersToPay) {
                if (m.remaining > 0) {
                    await fundApi.addPayment(guildId, topic.id, { memberId: m.id, amount: m.remaining, note: 'จ่ายครบ' });
                }
            }
        },
        onSuccess: (_, membersToPay) => {
            toast.success(`บันทึกจ่ายครบให้ ${membersToPay.length} คนเรียบร้อยแล้ว`);
            setSelectedIds([]);
            void refresh();
        },
        onError: onFundError,
    });

    const remove = async (member: FundMemberView) => {
        const ok = await confirm({
            title: 'ลบคนออกจากหัวข้อ?',
            description:
                member.paid > 0
                    ? `${member.displayName} มีรายการรับเงินรวม ${formatBaht(member.paid)} — รายการเหล่านั้นจะถูกลบไปด้วย`
                    : `เอา ${member.displayName} ออกจาก “${topic.name}”`,
            confirmText: 'ลบ',
            destructive: true,
        });
        if (!ok) return;
        try {
            await fundApi.removeMember(guildId, topic.id, member.id);
            setSelectedIds((prev) => prev.filter((id) => id !== member.id));
            toast.success('ลบคนแล้ว');
            void refresh();
        } catch (err) {
            onFundError(err);
        }
    };

    const counts = useMemo(() => {
        let paid = 0;
        let partial = 0;
        let unpaid = 0;
        for (const m of topic.members) {
            if (m.status === 'paid') paid++;
            else if (m.status === 'partial') partial++;
            else unpaid++;
        }
        return { paid, partial, unpaid, owing: partial + unpaid };
    }, [topic.members]);

    const filteredMembers = useMemo(() => {
        const q = search.trim().toLowerCase();
        const filtered = topic.members.filter((m) => {
            if (statusFilter === 'paid' && m.status !== 'paid') return false;
            if (statusFilter === 'owing' && m.status === 'paid') return false;
            if (statusFilter === 'partial' && m.status !== 'partial') return false;
            if (statusFilter === 'unpaid' && m.status !== 'unpaid') return false;
            if (q && !m.displayName.toLowerCase().includes(q) && !m.userId.includes(q)) return false;
            return true;
        });

        if (sortBy === 'remaining_desc') {
            return [...filtered].sort((a, b) => b.remaining - a.remaining);
        }
        if (sortBy === 'paid_desc') {
            return [...filtered].sort((a, b) => b.paid - a.paid);
        }
        if (sortBy === 'name_asc') {
            return [...filtered].sort((a, b) => a.displayName.localeCompare(b.displayName, 'th'));
        }
        return filtered;
    }, [topic.members, search, statusFilter, sortBy]);

    const validSelectedIds = useMemo(() => {
        const memberIdSet = new Set(topic.members.map((m) => m.id));
        return selectedIds.filter((id) => memberIdSet.has(id));
    }, [topic.members, selectedIds]);

    const selectedMembers = useMemo(() => topic.members.filter((m) => validSelectedIds.includes(m.id)), [topic.members, validSelectedIds]);
    const selectedUnpaidMembers = useMemo(() => selectedMembers.filter((m) => m.remaining > 0), [selectedMembers]);
    const selectedRemainingTotal = useMemo(() => roundMoney(selectedUnpaidMembers.reduce((sum, m) => sum + m.remaining, 0)), [selectedUnpaidMembers]);

    const allFilteredSelected = filteredMembers.length > 0 && filteredMembers.every((m) => validSelectedIds.includes(m.id));

    const toggleSelectAllFiltered = () => {
        if (allFilteredSelected) {
            const filteredIdSet = new Set(filteredMembers.map((m) => m.id));
            setSelectedIds((prev) => prev.filter((id) => !filteredIdSet.has(id)));
        } else {
            const merged = new Set([...validSelectedIds, ...filteredMembers.map((m) => m.id)]);
            setSelectedIds([...merged]);
        }
    };

    const toggleMember = (id: number) => {
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const handleBulkPayFull = async () => {
        if (selectedUnpaidMembers.length === 0) return;
        const ok = await confirm({
            title: `บันทึกจ่ายครบให้ ${selectedUnpaidMembers.length} คน?`,
            description: `ระบบจะบันทึกรับเงินตามยอดคงค้างของแต่ละคน รวมเป็นเงินทั้งสิ้น ${formatBaht(selectedRemainingTotal)}`,
            confirmText: `บันทึกจ่ายครบ (${formatBaht(selectedRemainingTotal)})`,
        });
        if (!ok) return;
        bulkPayFull.mutate(selectedUnpaidMembers);
    };

    return (
        <div className="space-y-3">
            {!topic.closed && (
                <div className="grid gap-2.5 rounded-xl border bg-muted/15 p-3 md:grid-cols-2">
                    <Field label="เพิ่มสมาชิกรายคน">
                        <UserPicker
                            keepSelection={false}
                            placeholder="พิมพ์ชื่อหรือ username เพื่อเพิ่มเข้าหัวข้อ..."
                            exclude={topic.members.map((m) => m.userId)}
                            onSelect={(user) => add.mutate({ userIds: [user.userId] })}
                        />
                    </Field>
                    <Field label="ดึงสมาชิกทุกคนจากยศ (Role)">
                        <div className="flex gap-2">
                            <Select value={roleId} onValueChange={setRoleId}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="-- เลือกยศในเซิร์ฟเวอร์ --" />
                                </SelectTrigger>
                                <SelectContent className="max-h-80">
                                    {roles.map((role) => (
                                        <SelectItem key={role.id} value={role.id}>
                                            @{role.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button variant="outline" disabled={!roleId || add.isPending} onClick={() => add.mutate({ roleId })}>
                                {add.isPending ? <Loader2 className="animate-spin" /> : <Users />} เพิ่มทั้งยศ
                            </Button>
                        </div>
                    </Field>
                </div>
            )}

            {topic.members.length === 0 ? (
                <EmptyState>ยังไม่มีคนในหัวข้อนี้ — เพิ่มทีละคนหรือดึงทั้งยศจากแถบด้านบน</EmptyState>
            ) : (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                            {(
                                [
                                    ['all', `ทั้งหมด (${topic.members.length})`],
                                    ['owing', `ค้างชำระ (${counts.owing})`],
                                    ...(counts.partial > 0 ? ([['partial', `จ่ายบางส่วน (${counts.partial})`]] as const) : []),
                                    ...(counts.unpaid > 0 ? ([['unpaid', `ยังไม่จ่าย (${counts.unpaid})`]] as const) : []),
                                    ['paid', `จ่ายครบแล้ว (${counts.paid})`],
                                ] as const
                            ).map(([value, label]) => (
                                <Button
                                    key={value}
                                    type="button"
                                    size="xs"
                                    variant={statusFilter === value ? 'default' : 'outline'}
                                    onClick={() => setStatusFilter(value)}
                                >
                                    {label}
                                </Button>
                            ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <SearchInput value={search} onChange={setSearch} placeholder="ค้นหาชื่อ หรือ User ID..." className="w-48 sm:w-56" />
                            <Select value={sortBy} onValueChange={(v) => setSortBy(v as MemberSort)}>
                                <SelectTrigger className="h-8 w-40 text-xs">
                                    <ArrowUpDown className="mr-1 size-3 text-muted-foreground" />
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="default">เรียงตามลำดับเพิ่ม</SelectItem>
                                    <SelectItem value="remaining_desc">คงค้างมากสุด</SelectItem>
                                    <SelectItem value="paid_desc">จ่ายแล้วมากสุด</SelectItem>
                                    <SelectItem value="name_asc">ชื่อ (ก-ฮ / A-Z)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {!topic.closed && validSelectedIds.length > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/8 px-3.5 py-2 text-xs">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-primary">เลือกแล้ว {validSelectedIds.length} คน</span>
                                {selectedUnpaidMembers.length > 0 && (
                                    <span className="text-muted-foreground tabular-nums">
                                        (ค้างชำระ {selectedUnpaidMembers.length} คน · รวม{' '}
                                        <span className="font-semibold text-amber-400">{formatBaht(selectedRemainingTotal)}</span>)
                                    </span>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                                {selectedUnpaidMembers.length > 0 && (
                                    <Button type="button" size="xs" disabled={bulkPayFull.isPending} onClick={() => void handleBulkPayFull()}>
                                        {bulkPayFull.isPending ? <Loader2 className="animate-spin" /> : <CheckCheck />}
                                        จ่ายครบทุกคนที่เลือก ({formatBaht(selectedRemainingTotal)})
                                    </Button>
                                )}
                                {onBatchPay && (
                                    <Button type="button" size="xs" variant="outline" onClick={() => onBatchPay(validSelectedIds)}>
                                        <Calendar /> บันทึกตามห้วงเวลา ({validSelectedIds.length} คน)
                                    </Button>
                                )}
                                <Button type="button" size="xs" variant="ghost" onClick={() => setSelectedIds([])}>
                                    <X /> ล้างการเลือก
                                </Button>
                            </div>
                        </div>
                    )}

                    {filteredMembers.length === 0 ? (
                        <EmptyState>ไม่พบสมาชิกที่ตรงกับเงื่อนไขการค้นหา</EmptyState>
                    ) : (
                        <div className="overflow-x-auto rounded-xl border">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/40 text-xs text-muted-foreground">
                                    <tr>
                                        {!topic.closed && (
                                            <th className="w-9 px-3 py-2.5 text-center">
                                                <Checkbox
                                                    checked={allFilteredSelected}
                                                    onCheckedChange={toggleSelectAllFiltered}
                                                    aria-label="เลือกทั้งหมดในรายการ"
                                                />
                                            </th>
                                        )}
                                        <th className="px-3 py-2.5 text-left font-medium">ชื่อสมาชิก</th>
                                        <th className="px-3 py-2.5 text-left font-medium">ต้องจ่าย (กดแก้ได้)</th>
                                        <th className="px-3 py-2.5 text-right font-medium">จ่ายแล้ว (กดแก้ได้)</th>
                                        <th className="px-3 py-2.5 text-right font-medium">คงค้าง</th>
                                        <th className="px-3 py-2.5 text-left font-medium">สถานะ</th>
                                        <th className="px-3 py-2.5 text-right font-medium">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredMembers.map((m) => {
                                        const isPayingThis = payingMemberId === m.id;
                                        const isSelected = validSelectedIds.includes(m.id);
                                        const payCount = paymentCountByMember.get(m.id) ?? 0;

                                        return (
                                            <tr key={m.id} className={cn('border-t transition-colors hover:bg-muted/20', isSelected && 'bg-primary/5')}>
                                                {!topic.closed && (
                                                    <td className="px-3 py-2.5 text-center">
                                                        <Checkbox
                                                            checked={isSelected}
                                                            onCheckedChange={() => toggleMember(m.id)}
                                                            aria-label={`เลือก ${m.displayName}`}
                                                        />
                                                    </td>
                                                )}
                                                <td className="px-3 py-2.5">
                                                    <div className="flex items-center gap-2.5">
                                                        <img src={m.avatar} alt="" className="size-8 rounded-full object-cover ring-1 ring-border" />
                                                        <div className="min-w-0">
                                                            <p className="truncate font-medium">{m.displayName}</p>
                                                            <div className="flex items-center gap-1.5">
                                                                <p className="truncate font-mono text-[11px] text-muted-foreground">{m.userId}</p>
                                                                {payCount > 0 && onViewHistory && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => onViewHistory(m.id)}
                                                                        className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.2 text-[10px] text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary"
                                                                        title="ดูประวัติการโอนของคนนี้"
                                                                    >
                                                                        <History className="size-2.5" /> {payCount} ครั้ง
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    <TargetCell topic={topic} member={m} />
                                                </td>
                                                <td className="px-3 py-2.5 text-right">
                                                    <PaidCell topic={topic} member={m} />
                                                </td>
                                                <td
                                                    className={cn(
                                                        'px-3 py-2.5 text-right tabular-nums',
                                                        m.remaining > 0 ? 'font-semibold text-amber-400' : 'text-muted-foreground',
                                                    )}
                                                >
                                                    {m.remaining > 0 ? formatBaht(m.remaining) : '—'}
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    <Badge variant="outline" className={STATUS_LABEL[m.status].className}>
                                                        {STATUS_LABEL[m.status].text}
                                                    </Badge>
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    <div className="flex justify-end gap-1">
                                                        <Button size="xs" variant="outline" disabled={topic.closed} onClick={() => onPay(m)}>
                                                            <Banknote /> รับเงิน
                                                        </Button>
                                                        {m.remaining > 0 && (
                                                            <Button
                                                                size="xs"
                                                                variant="secondary"
                                                                className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                                                                disabled={topic.closed || payFull.isPending}
                                                                onClick={() => payFull.mutate(m)}
                                                                title={`บันทึกรับยอดคงค้าง ${formatBaht(m.remaining)}`}
                                                            >
                                                                {isPayingThis ? <Loader2 className="animate-spin" /> : <CheckCheck />} จ่ายครบ
                                                            </Button>
                                                        )}
                                                        <Button
                                                            size="icon-xs"
                                                            variant="ghost"
                                                            aria-label="ลบคน"
                                                            title="ลบออกจากหัวข้อ"
                                                            disabled={topic.closed}
                                                            onClick={() => void remove(m)}
                                                        >
                                                            <Trash2 className="text-destructive" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
