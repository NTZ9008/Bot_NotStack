import { calculateDays, formatBaht, roundMoney, type FundPaymentView, type FundTopicDetail } from '@notstack/shared';
import { ArrowUpDown, Calendar, Pencil, Trash2, UserCheck, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { fundApi } from '@/api/fund';
import { useConfirm } from '@/components/confirm-dialog';
import { SearchInput } from '@/components/search-input';
import { EmptyState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGuildId } from '@/hooks/use-guild';
import { formatDateTime } from '@/lib/format';
import { onFundError, useFundRefresh } from './utils';

type PaymentSort = 'newest' | 'oldest' | 'amount_desc';

// ==========================================
// 🧾 ประวัติการรับเงิน + กรองรายคน + เรียงลำดับ + แก้ไข/ลบรายการ
// ==========================================
export function PaymentsTab({
    topic,
    memberFilter = null,
    onMemberFilterChange,
    onEditPayment,
}: {
    topic: FundTopicDetail;
    memberFilter?: number | null;
    onMemberFilterChange?: (memberId: number | null) => void;
    onEditPayment: (payment: FundPaymentView) => void;
}) {
    const guildId = useGuildId();
    const refresh = useFundRefresh();
    const confirm = useConfirm();
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState<PaymentSort>('newest');

    const avatarByMemberId = useMemo(() => {
        const map = new Map<number, string>();
        for (const m of topic.members) map.set(m.id, m.avatar);
        return map;
    }, [topic.members]);

    const remove = async (paymentId: number, label: string) => {
        const ok = await confirm({ title: 'ลบรายการรับเงิน?', description: label, confirmText: 'ลบรายการ', destructive: true });
        if (!ok) return;
        try {
            await fundApi.removePayment(guildId, topic.id, paymentId);
            toast.success('ลบรายการแล้ว');
            void refresh();
        } catch (err) {
            onFundError(err);
        }
    };

    const filteredPayments = useMemo(() => {
        const q = search.trim().toLowerCase();
        const filtered = topic.payments.filter((p) => {
            if (memberFilter !== null && p.memberId !== memberFilter) return false;
            if (
                q &&
                !p.memberName.toLowerCase().includes(q) &&
                !(p.note && p.note.toLowerCase().includes(q)) &&
                !(p.recordedBy && p.recordedBy.toLowerCase().includes(q))
            ) {
                return false;
            }
            return true;
        });

        return [...filtered].sort((a, b) => {
            if (sortBy === 'amount_desc') return b.amount - a.amount;
            const tA = new Date(a.paidAt).getTime();
            const tB = new Date(b.paidAt).getTime();
            return sortBy === 'oldest' ? tA - tB : tB - tA;
        });
    }, [topic.payments, memberFilter, search, sortBy]);

    const filteredTotal = useMemo(() => roundMoney(filteredPayments.reduce((acc, p) => acc + p.amount, 0)), [filteredPayments]);
    const activeMember = useMemo(() => (memberFilter !== null ? topic.members.find((m) => m.id === memberFilter) : undefined), [topic.members, memberFilter]);

    if (topic.payments.length === 0) return <EmptyState>ยังไม่มีรายการรับเงินในหัวข้อนี้</EmptyState>;

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs text-muted-foreground">
                        แสดง <span className="font-semibold text-foreground">{filteredPayments.length}</span> รายการ · ยอดรวม{' '}
                        <span className="font-semibold text-emerald-400 tabular-nums">{formatBaht(filteredTotal)}</span>
                    </p>
                    {activeMember && onMemberFilterChange && (
                        <Badge variant="secondary" className="gap-1 border-primary/30 bg-primary/10 text-primary">
                            <UserCheck className="size-3" />
                            เฉพาะ: {activeMember.displayName}
                            <button
                                type="button"
                                onClick={() => onMemberFilterChange(null)}
                                className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20"
                                aria-label="ล้างตัวกรองสมาชิก"
                            >
                                <X className="size-3" />
                            </button>
                        </Badge>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {onMemberFilterChange && topic.members.length > 1 && (
                        <Select
                            value={memberFilter !== null ? String(memberFilter) : 'all'}
                            onValueChange={(v) => onMemberFilterChange(v === 'all' ? null : Number(v))}
                        >
                            <SelectTrigger className="h-8 w-44 text-xs">
                                <SelectValue placeholder="สมาชิกทุกคน" />
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                                <SelectItem value="all">สมาชิกทุกคน ({topic.payments.length})</SelectItem>
                                {topic.members.map((m) => (
                                    <SelectItem key={m.id} value={String(m.id)}>
                                        {m.displayName}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}

                    <SearchInput value={search} onChange={setSearch} placeholder="ค้นหาชื่อคนจ่าย หรือหมายเหตุ..." className="w-48 sm:w-56" />

                    <Select value={sortBy} onValueChange={(v) => setSortBy(v as PaymentSort)}>
                        <SelectTrigger className="h-8 w-36 text-xs">
                            <ArrowUpDown className="mr-1 size-3 text-muted-foreground" />
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="newest">ล่าสุดก่อน</SelectItem>
                            <SelectItem value="oldest">เก่าสุดก่อน</SelectItem>
                            <SelectItem value="amount_desc">ยอดมากสุด</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {filteredPayments.length === 0 ? (
                <EmptyState>ไม่พบรายการรับเงินที่ตรงกับเงื่อนไขการค้นหา</EmptyState>
            ) : (
                <ul className="divide-y rounded-xl border">
                    {filteredPayments.map((p) => {
                        const days = p.periodStart && p.periodEnd ? calculateDays(p.periodStart, p.periodEnd) : 0;
                        const avatar = avatarByMemberId.get(p.memberId);
                        return (
                            <li key={p.id} className="flex items-center gap-3 px-3.5 py-2.5 text-sm transition-colors hover:bg-muted/20">
                                {avatar ? (
                                    <img src={avatar} alt="" className="size-8 shrink-0 rounded-full object-cover ring-1 ring-border" />
                                ) : (
                                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-400">
                                        ฿
                                    </div>
                                )}

                                <div className="min-w-0 flex-1 space-y-0.5">
                                    <div className="flex flex-wrap items-center gap-2 font-medium">
                                        <span>{p.memberName}</span>
                                        <Badge
                                            variant="outline"
                                            className="border-emerald-500/35 bg-emerald-500/10 font-semibold text-emerald-400 tabular-nums"
                                        >
                                            +{formatBaht(p.amount)}
                                        </Badge>
                                        {p.periodStart && p.periodEnd && (
                                            <Badge variant="outline" className="gap-1 border-primary/30 bg-primary/5 text-[11px] font-normal text-primary">
                                                <Calendar className="size-3" />
                                                งวด {new Date(p.periodStart).toLocaleDateString('th-TH')} – {new Date(p.periodEnd).toLocaleDateString('th-TH')}
                                                {days > 0 && ` (${days} วัน)`}
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {formatDateTime(p.paidAt)}
                                        {p.note && <span className="text-foreground/80"> · “{p.note}”</span>}
                                        {p.recordedBy && ` · บันทึกโดย ${p.recordedBy}`}
                                    </p>
                                </div>

                                <div className="flex shrink-0 items-center gap-1">
                                    <Button
                                        size="icon-xs"
                                        variant="ghost"
                                        aria-label="แก้ไขรายการ"
                                        title="แก้ไขรายการรับเงิน"
                                        disabled={topic.closed}
                                        onClick={() => onEditPayment(p)}
                                    >
                                        <Pencil />
                                    </Button>
                                    <Button
                                        size="icon-xs"
                                        variant="ghost"
                                        aria-label="ลบรายการ"
                                        title="ลบรายการรับเงิน"
                                        disabled={topic.closed}
                                        onClick={() => void remove(p.id, `${p.memberName} ${formatBaht(p.amount)} (${formatDateTime(p.paidAt)})`)}
                                    >
                                        <Trash2 className="text-destructive" />
                                    </Button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
