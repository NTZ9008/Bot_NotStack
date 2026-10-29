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

export interface TopicTemplate {
    id: string;
    emoji: string;
    title: string;
    subtitle: string;
    name: string;
    description: string;
    mode: 'fixed' | 'daily';
    amount: string;
    dailyRate: string;
}

export const TOPIC_TEMPLATES: readonly TopicTemplate[] = [
    {
        id: 'monthly',
        emoji: '💰',
        title: 'กองกลางรายเดือน',
        subtitle: 'เก็บยอดคงที่เท่ากันทุกคน',
        name: 'ค่ากองกลางประจำเดือน',
        description: 'โอนผ่านพร้อมเพย์ 08X-XXX-XXXX แล้วแจ้งสลิปในห้องได้เลย',
        mode: 'fixed',
        amount: '300',
        dailyRate: '15',
    },
    {
        id: 'daily-15',
        emoji: '📅',
        title: 'เก็บเงินรายวัน 15 ฿',
        subtitle: 'คิดยอดอัตโนมัติตามจำนวนวัน',
        name: 'กองกลางรายวัน (วันละ 15 บาท)',
        description: 'สะสมวันละ 15 บาท จ่ายรายสัปดาห์หรือรวบยอดตามห้วงวันได้',
        mode: 'daily',
        amount: '450',
        dailyRate: '15',
    },
    {
        id: 'server-share',
        emoji: '🎮',
        title: 'หารค่าเซิร์ฟเวอร์ / เกม',
        subtitle: 'หารค่าเช่าเซิร์ฟเวอร์หรือซับรายเดือน',
        name: 'หารค่าเช่าเซิร์ฟเวอร์เกม',
        description: 'หารค่าเช่าเซิร์ฟเวอร์ประจำเดือน',
        mode: 'fixed',
        amount: '150',
        dailyRate: '15',
    },
    {
        id: 'party-trip',
        emoji: '🍻',
        title: 'ทริป / ปาร์ตี้กลุ่ม',
        subtitle: 'เก็บเงินมัดจำหรือค่ากิจกรรมกลุ่ม',
        name: 'ค่าทริป / ปาร์ตี้กลุ่ม',
        description: 'เก็บเงินกองกลางสำหรับงานมีตติ้งกลุ่ม',
        mode: 'fixed',
        amount: '500',
        dailyRate: '15',
    },
];

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

// บวก/ลบจำนวนวันจากวันที่อ้างอิง แล้วคืนค่า YYYY-MM-DD
export function shiftDateInput(baseDateStr: string, offsetDays: number): string {
    const base = baseDateStr ? new Date(`${baseDateStr}T12:00:00`) : new Date();
    if (Number.isNaN(base.getTime())) return todayInput();
    base.setDate(base.getDate() + offsetDays);
    return toDateInput(base.toISOString());
}

// วันแรกและวันสุดท้ายของเดือนปัจจุบัน (YYYY-MM-DD)
export function currentMonthRange(now = new Date()): { start: string; end: string } {
    const first = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0, 12, 0, 0);
    return { start: toDateInput(first.toISOString()), end: toDateInput(last.toISOString()) };
}

export type PeriodPreset = 'today' | '7d' | '15d' | 'month' | 'since_start';

export function periodPresetRange(preset: PeriodPreset, startDate?: string | null): { start: string; end: string } {
    const today = todayInput();
    switch (preset) {
        case 'today':
            return { start: today, end: today };
        case '7d':
            return { start: shiftDateInput(today, -6), end: today };
        case '15d':
            return { start: shiftDateInput(today, -14), end: today };
        case 'month':
            return currentMonthRange();
        case 'since_start': {
            const start = startDate ? toDateInput(startDate) : today;
            return { start: start <= today ? start : today, end: today };
        }
    }
}

export interface DueDateInfo {
    label: string;
    shortLabel: string;
    tone: 'overdue' | 'soon' | 'normal' | 'closed';
    daysLeft: number;
}

// คำนวณสถานะวันครบกำหนด (เลยกำหนด / ใกล้ครบกำหนด / ปกติ)
export function dueDateStatus(dueDate: string | null, closed: boolean, now = new Date()): DueDateInfo | null {
    if (!dueDate) return null;
    const due = new Date(dueDate);
    if (Number.isNaN(due.getTime())) return null;
    const formatted = due.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
    if (closed) {
        return { label: `ครบกำหนด ${formatted}`, shortLabel: formatted, tone: 'closed', daysLeft: 0 };
    }
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
    const daysLeft = Math.round((startOfDue - startOfToday) / 86_400_000);

    if (daysLeft < 0) {
        const overdueDays = Math.abs(daysLeft);
        return {
            label: `เลยกำหนด ${overdueDays} วัน (${formatted})`,
            shortLabel: `เลยกำหนด ${overdueDays} วัน`,
            tone: 'overdue',
            daysLeft,
        };
    }
    if (daysLeft === 0) {
        return { label: `ครบกำหนดวันนี้ (${formatted})`, shortLabel: 'ครบกำหนดวันนี้', tone: 'soon', daysLeft: 0 };
    }
    if (daysLeft <= 3) {
        return { label: `อีก ${daysLeft} วันครบกำหนด (${formatted})`, shortLabel: `อีก ${daysLeft} วัน`, tone: 'soon', daysLeft };
    }
    return { label: `ครบกำหนด ${formatted} (อีก ${daysLeft} วัน)`, shortLabel: formatted, tone: 'normal', daysLeft };
}

// ดึงเลขบัญชีหรือเบอร์พร้อมเพย์จากคำอธิบายหัวข้อ (ถ้ามีตัวเลข 10-15 หลัก) เพื่อให้กดคัดลอกได้ทันที
export function extractAccountDigits(description: string): string | null {
    if (!description) return null;
    const match = description.match(/\b\d[\d -]{8,17}\d\b/);
    if (!match) return null;
    const digitsOnly = match[0].replace(/[^\d]/g, '');
    return digitsOnly.length >= 10 && digitsOnly.length <= 15 ? match[0].trim() : null;
}

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
