import { formatBaht, type FundMemberView, type FundTopicDetail } from '@notstack/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowUpDown, Banknote, CheckCheck, Loader2, Trash2, Users } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGuildId } from '@/hooks/use-guild';
import { cn } from '@/lib/utils';
import { PaidCell, TargetCell } from './member-cells';
import { STATUS_LABEL, onFundError, useFundRefresh } from './utils';

// ==========================================
// 👥 รายชื่อ + เพิ่ม/ลบคน + ค้นหา/กรอง/เรียงลำดับ
// ==========================================
type MemberFilter = 'all' | 'unpaid' | 'paid';
type MemberSort = 'default' | 'remaining_desc' | 'paid_desc' | 'name_asc';

export function MembersTab({ topic, onPay }: { topic: FundTopicDetail; onPay: (member: FundMemberView | null) => void }) {
    const guildId = useGuildId();
    const refresh = useFundRefresh();
    const confirm = useConfirm();
    const { data: roles = [] } = useQuery(guildRolesQuery(guildId));
    const [roleId, setRoleId] = useState('');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<MemberFilter>('all');
    const [sortBy, setSortBy] = useState<MemberSort>('default');

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
            toast.success('ลบคนแล้ว');
            void refresh();
        } catch (err) {
            onFundError(err);
        }
    };

    const paidCount = useMemo(() => topic.members.filter((m) => m.status === 'paid').length, [topic.members]);
    const unpaidCount = topic.members.length - paidCount;

    const filteredMembers = useMemo(() => {
        const q = search.trim().toLowerCase();
        const filtered = topic.members.filter((m) => {
            if (statusFilter === 'paid' && m.status !== 'paid') return false;
            if (statusFilter === 'unpaid' && m.status === 'paid') return false;
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

    return (
        <div className="space-y-3">
            {!topic.closed && (
                <div className="grid gap-2 md:grid-cols-2">
                    <Field label="เพิ่มคน">
                        <UserPicker
                            keepSelection={false}
                            placeholder="พิมพ์ชื่อหรือ username..."
                            exclude={topic.members.map((m) => m.userId)}
                            onSelect={(user) => add.mutate({ userIds: [user.userId] })}
                        />
                    </Field>
                    <Field label="เพิ่มทุกคนในยศ">
                        <div className="flex gap-2">
                            <Select value={roleId} onValueChange={setRoleId}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="-- เลือกยศ --" />
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
                                {add.isPending ? <Loader2 className="animate-spin" /> : <Users />} เพิ่ม
                            </Button>
                        </div>
                    </Field>
                </div>
            )}

            {topic.members.length === 0 ? (
                <EmptyState>ยังไม่มีคนในหัวข้อนี้ — เพิ่มทีละคนหรือดึงทั้งยศด้านบน</EmptyState>
            ) : (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                            {(
                                [
                                    ['all', `ทั้งหมด (${topic.members.length})`],
                                    ['unpaid', `ค้างชำระ (${unpaidCount})`],
                                    ['paid', `จ่ายครบแล้ว (${paidCount})`],
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

                    {filteredMembers.length === 0 ? (
                        <EmptyState>ไม่พบสมาชิกที่ตรงกับเงื่อนไขการค้นหา</EmptyState>
                    ) : (
                        <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/40 text-xs text-muted-foreground">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-medium">ชื่อสมาชิก</th>
                                        <th className="px-3 py-2 text-left font-medium">ต้องจ่าย</th>
                                        <th className="px-3 py-2 text-right font-medium">จ่ายแล้ว (กดแก้ได้)</th>
                                        <th className="px-3 py-2 text-right font-medium">คงค้าง</th>
                                        <th className="px-3 py-2 text-left font-medium">สถานะ</th>
                                        <th className="px-3 py-2" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredMembers.map((m) => {
                                        const isPayingThis = payingMemberId === m.id;
                                        return (
                                            <tr key={m.id} className="border-t transition-colors hover:bg-muted/20">
                                                <td className="px-3 py-2">
                                                    <div className="flex items-center gap-2">
                                                        <img src={m.avatar} alt="" className="size-7 rounded-full object-cover" />
                                                        <div className="min-w-0">
                                                            <p className="truncate font-medium">{m.displayName}</p>
                                                            <p className="truncate font-mono text-[11px] text-muted-foreground">{m.userId}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <TargetCell topic={topic} member={m} />
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                    <PaidCell topic={topic} member={m} />
                                                </td>
                                                <td
                                                    className={cn(
                                                        'px-3 py-2 text-right tabular-nums',
                                                        m.remaining > 0 ? 'font-medium text-amber-400' : 'text-muted-foreground',
                                                    )}
                                                >
                                                    {formatBaht(m.remaining)}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <Badge variant="outline" className={STATUS_LABEL[m.status].className}>
                                                        {STATUS_LABEL[m.status].text}
                                                    </Badge>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <div className="flex justify-end gap-1">
                                                        <Button size="xs" variant="outline" disabled={topic.closed} onClick={() => onPay(m)}>
                                                            <Banknote /> รับเงิน
                                                        </Button>
                                                        {m.remaining > 0 && (
                                                            <Button
                                                                size="xs"
                                                                variant="ghost"
                                                                disabled={topic.closed || payFull.isPending}
                                                                onClick={() => payFull.mutate(m)}
                                                                title={`บันทึกรับ ${formatBaht(m.remaining)}`}
                                                            >
                                                                {isPayingThis ? <Loader2 className="animate-spin" /> : <CheckCheck />} จ่ายครบ
                                                            </Button>
                                                        )}
                                                        <Button
                                                            size="icon-xs"
                                                            variant="ghost"
                                                            aria-label="ลบคน"
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
