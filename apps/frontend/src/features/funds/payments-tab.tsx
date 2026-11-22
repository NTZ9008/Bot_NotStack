import { tr, dateLocale } from '../../lib/i18n';
import { calculateDays, roundMoney, type FundPaymentView, type FundTopicDetail } from '@notstack/shared';
import { formatBaht } from './money';
import { ArrowUpDown, Calendar, Pencil, Trash2, UserCheck, X } from '@/components/icons';
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
        const ok = await confirm({ title: tr('ลบรายการรับเงิน?'), description: label, confirmText: tr('ลบรายการ'), destructive: true });
        if (!ok) return;
        try {
            await fundApi.removePayment(guildId, topic.id, paymentId);
            toast.success(tr('ลบรายการแล้ว'));
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

    if (topic.payments.length === 0) return <EmptyState>{tr('ยังไม่มีรายการรับเงินในหัวข้อนี้')}</EmptyState>;

    return (
        <div className="min-w-0 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs text-muted-foreground">
                        {tr('แสดง')} <span className="font-semibold text-foreground">{filteredPayments.length}</span> {tr('รายการ · ยอดรวม')}{' '}
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">{formatBaht(filteredTotal)}</span>
                    </p>
                    {activeMember && onMemberFilterChange && (
                        <Badge variant="secondary" className="max-w-full gap-1 border-primary/30 bg-primary/10 text-primary">
                            <UserCheck className="size-3" />
                            {tr('เฉพาะ:')} {activeMember.displayName}
                            <button
                                type="button"
                                onClick={() => onMemberFilterChange(null)}
                                className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20"
                                aria-label={tr('ล้างตัวกรองสมาชิก')}
                            >
                                <X className="size-3" />
                            </button>
                        </Badge>
                    )}
                </div>

                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                    <SearchInput value={search} onChange={setSearch} placeholder={tr('ค้นหาชื่อคนจ่าย หรือหมายเหตุ...')} className="w-full sm:w-56" />

                    <div className="flex w-full items-center gap-2 sm:w-auto">
                        {onMemberFilterChange && topic.members.length > 1 && (
                            <Select
                                value={memberFilter !== null ? String(memberFilter) : 'all'}
                                onValueChange={(v) => onMemberFilterChange(v === 'all' ? null : Number(v))}
                            >
                                <SelectTrigger className="h-8 w-full min-w-0 flex-1 text-xs sm:w-44 sm:flex-initial">
                                    <SelectValue placeholder={tr('สมาชิกทุกคน')} />
                                </SelectTrigger>
                                <SelectContent className="max-h-72">
                                    <SelectItem value="all">
                                        {tr('สมาชิกทุกคน (')}
                                        {topic.payments.length})
                                    </SelectItem>
                                    {topic.members.map((m) => (
                                        <SelectItem key={m.id} value={String(m.id)}>
                                            {m.displayName}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}

                        <Select value={sortBy} onValueChange={(v) => setSortBy(v as PaymentSort)}>
                            <SelectTrigger className="h-8 w-full min-w-0 flex-1 text-xs sm:w-36 sm:flex-initial">
                                <ArrowUpDown className="mr-1 size-3 shrink-0 text-muted-foreground" />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="newest">{tr('ล่าสุดก่อน')}</SelectItem>
                                <SelectItem value="oldest">{tr('เก่าสุดก่อน')}</SelectItem>
                                <SelectItem value="amount_desc">{tr('ยอดมากสุด')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {filteredPayments.length === 0 ? (
                <EmptyState>{tr('ไม่พบรายการรับเงินที่ตรงกับเงื่อนไขการค้นหา')}</EmptyState>
            ) : (
                <ul className="divide-y rounded-xl border">
                    {filteredPayments.map((p) => {
                        const days = p.periodStart && p.periodEnd ? calculateDays(p.periodStart, p.periodEnd) : 0;
                        const avatar = avatarByMemberId.get(p.memberId);
                        return (
                            <li
                                key={p.id}
                                className="flex items-start gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-muted/20 sm:items-center sm:gap-3 sm:px-3.5"
                            >
                                {avatar ? (
                                    <img src={avatar} alt="" className="mt-0.5 size-8 shrink-0 rounded-full object-cover ring-1 ring-border sm:mt-0" />
                                ) : (
                                    <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-700 dark:text-emerald-400 sm:mt-0">
                                        {tr('฿')}
                                    </div>
                                )}

                                <div className="min-w-0 flex-1 space-y-0.5">
                                    <div className="flex flex-wrap items-center gap-1.5 font-medium sm:gap-2">
                                        <span className="truncate">{p.memberName}</span>
                                        <Badge
                                            variant="outline"
                                            className="border-emerald-500/35 bg-emerald-500/10 font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums"
                                        >
                                            +{formatBaht(p.amount)}
                                        </Badge>
                                        {p.periodStart && p.periodEnd && (
                                            <Badge
                                                variant="outline"
                                                className="max-w-full gap-1 border-primary/30 bg-primary/5 text-[11px] font-normal text-primary"
                                            >
                                                <Calendar className="size-3 shrink-0" />
                                                <span className="truncate">
                                                    {tr('งวด')} {new Date(p.periodStart).toLocaleDateString(dateLocale())} –{' '}
                                                    {new Date(p.periodEnd).toLocaleDateString(dateLocale())}
                                                    {days > 0 && tr(' ({0} วัน)', { 0: days })}
                                                </span>
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="break-words text-xs text-muted-foreground sm:truncate">
                                        {formatDateTime(p.paidAt)}
                                        {p.note && <span className="text-foreground/80"> · “{p.note}”</span>}
                                        {p.recordedBy && tr(' · บันทึกโดย {0}', { 0: p.recordedBy })}
                                    </p>
                                </div>

                                <div className="flex shrink-0 items-center gap-1">
                                    <Button
                                        size="icon-xs"
                                        variant="ghost"
                                        aria-label={tr('แก้ไขรายการ')}
                                        title={tr('แก้ไขรายการรับเงิน')}
                                        disabled={topic.closed}
                                        onClick={() => onEditPayment(p)}
                                    >
                                        <Pencil />
                                    </Button>
                                    <Button
                                        size="icon-xs"
                                        variant="ghost"
                                        aria-label={tr('ลบรายการ')}
                                        title={tr('ลบรายการรับเงิน')}
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
