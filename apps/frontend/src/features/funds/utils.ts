import {
    calculateDays,
    fundCsvFilename,
    generateFundCsv,
    roundMoney,
    type FundMemberStatus,
    type FundTopicDetail,
    type FundTopicSummary,
} from '@notstack/shared';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fundsKey } from '@/api/fund';
import { useGuildId } from '@/hooks/use-guild';
import { errorMessage } from '@/lib/api';
import { toLocalInput } from '@/lib/format';

export const STATUS_LABEL: Record<FundMemberStatus, { text: string; className: string; color: string }> = {
    paid: { text: 'จ่ายครบ', className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400', color: '#10b981' },
    partial: { text: 'จ่ายบางส่วน', className: 'border-amber-500/40 bg-amber-500/10 text-amber-400', color: '#f59e0b' },
    unpaid: { text: 'ยังไม่จ่าย', className: 'border-destructive/40 bg-destructive/10 text-destructive', color: '#ef4444' },
};

export const percent = (collected: number, target: number) => (target > 0 ? Math.min(100, Math.round((collected / target) * 100)) : 0);

// ยอดเก็บต่อวันของหัวข้อแบบรายวัน (null = หัวข้อแบบยอดคงที่)
export const dailyRateOf = (topic: Pick<FundTopicSummary, 'dailyRate'>): number | null => (topic.dailyRate && topic.dailyRate > 0 ? topic.dailyRate : null);

// <input type="date"> ใช้ YYYY-MM-DD (เวลาท้องถิ่น)
export const toDateInput = (iso: string | null) => (iso ? toLocalInput(new Date(iso)).slice(0, 10) : '');
export const todayInput = () => toDateInput(new Date().toISOString());
export const startOfDayIso = (date: string) => new Date(`${date}T00:00:00`).toISOString();
export const endOfDayIso = (date: string) => new Date(`${date}T23:59:59`).toISOString();
// วันครบกำหนดนับถึงเกือบเที่ยงคืนของวันนั้น
export const dueDateIso = (date: string) => (date ? new Date(`${date}T23:59:00`).toISOString() : null);

export const periodNote = (start: string, end: string, days: number) => `งวดวันที่ ${start} ถึง ${end} (${days} วัน)`;
export const isAutoPeriodNote = (note: string) => !note || note.startsWith('งวดวันที่');

// ห้วงเวลาเริ่มต้นของการบันทึกรับเงิน: วันเริ่มเก็บของหัวข้อ (หรือวันนี้) ถึงวันนี้
export function defaultPeriod(topic: Pick<FundTopicDetail, 'startDate'>): { start: string; end: string } {
    const end = todayInput();
    return { start: topic.startDate ? toDateInput(topic.startDate) : end, end };
}

// ยอดที่ต้องจ่ายของห้วงเวลานั้นในหัวข้อแบบรายวัน (0 = คำนวณไม่ได้)
export function periodAmount(topic: Pick<FundTopicSummary, 'dailyRate'>, start: string, end: string): { days: number; amount: number } {
    const rate = dailyRateOf(topic);
    const days = start && end && start <= end ? calculateDays(start, end) : 0;
    return { days, amount: rate && days > 0 ? roundMoney(days * rate) : 0 };
}

export function useFundRefresh() {
    const guildId = useGuildId();
    const queryClient = useQueryClient();
    return () => queryClient.invalidateQueries({ queryKey: fundsKey(guildId) });
}

export const onFundError = (err: unknown) => toast.error('ข้อผิดพลาด', { description: errorMessage(err) });

// ดาวน์โหลด CSV ทันทีจากข้อมูลในหน้าเว็บ (ไม่ต้องรอโหลดซ้ำจากเซิร์ฟเวอร์ และรองรับ UTF-8 BOM สำหรับ Excel)
export function downloadFundCsv(topic: FundTopicDetail) {
    const blob = new Blob([generateFundCsv(topic)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fundCsvFilename(topic.name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
