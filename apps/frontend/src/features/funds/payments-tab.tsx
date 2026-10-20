import { calculateDays, formatBaht, roundMoney, type FundPaymentView, type FundTopicDetail } from '@notstack/shared';
import { Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { fundApi } from '@/api/fund';
import { useConfirm } from '@/components/confirm-dialog';
import { SearchInput } from '@/components/search-input';
import { EmptyState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useGuildId } from '@/hooks/use-guild';
import { formatDateTime } from '@/lib/format';
import { onFundError, useFundRefresh } from './utils';

// ==========================================
// 🧾 ประวัติการรับเงิน + ค้นหา + แก้ไข/ลบรายการ
// ==========================================
export function PaymentsTab({ topic, onEditPayment }: { topic: FundTopicDetail; onEditPayment: (payment: FundPaymentView) => void }) {
    const guildId = useGuildId();
    const refresh = useFundRefresh();
    const confirm = useConfirm();
    const [search, setSearch] = useState('');

    const remove = async (paymentId: number, label: string) => {
        const ok = await confirm({ title: 'ลบรายการรับเงิน?', description: label, confirmText: 'ลบ', destructive: true });
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
        if (!q) return topic.payments;
        return topic.payments.filter(
            (p) =>
                p.memberName.toLowerCase().includes(q) ||
                (p.note && p.note.toLowerCase().includes(q)) ||
                (p.recordedBy && p.recordedBy.toLowerCase().includes(q)),
        );
    }, [topic.payments, search]);

    const filteredTotal = useMemo(() => roundMoney(filteredPayments.reduce((acc, p) => acc + p.amount, 0)), [filteredPayments]);

    if (topic.payments.length === 0) return <EmptyState>ยังไม่มีรายการรับเงิน</EmptyState>;

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                    แสดง <span className="font-semibold text-foreground">{filteredPayments.length}</span> รายการ · ยอดรวม{' '}
                    <span className="font-semibold text-emerald-400">{formatBaht(filteredTotal)}</span>
                </p>
                <SearchInput value={search} onChange={setSearch} placeholder="ค้นหาชื่อคนจ่าย หรือหมายเหตุ..." className="w-56" />
            </div>

            {filteredPayments.length === 0 ? (
                <EmptyState>ไม่พบรายการรับเงินที่ตรงกับการค้นหา</EmptyState>
            ) : (
                <ul className="divide-y rounded-lg border">
                    {filteredPayments.map((p) => {
                        const days = p.periodStart && p.periodEnd ? calculateDays(p.periodStart, p.periodEnd) : 0;
                        return (
                            <li key={p.id} className="flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted/20">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-1.5 font-medium">
                                        <span>{p.memberName}</span>
                                        <span className="text-emerald-400 tabular-nums">+{formatBaht(p.amount)}</span>
                                        {p.periodStart && p.periodEnd && (
                                            <Badge variant="outline" className="text-[11px] font-normal border-primary/30 bg-primary/5 text-primary">
                                                งวด {new Date(p.periodStart).toLocaleDateString('th-TH')} – {new Date(p.periodEnd).toLocaleDateString('th-TH')}
                                                {days > 0 && ` (${days} วัน)`}
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {formatDateTime(p.paidAt)}
                                        {p.note && ` · ${p.note}`}
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
