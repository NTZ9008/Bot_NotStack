import { roundMoney } from '@notstack/shared';

export interface PaymentAmount {
    id: number;
    amount: number;
}

// สิ่งที่ต้องทำกับรายการรับเงินเพื่อให้ยอดรวมเท่ากับยอดใหม่ (ว่างทั้งหมด = ไม่ต้องแก้)
export interface PaidAdjustment {
    deleteIds: number[];
    updates: PaymentAmount[];
    create: number | null;
}

// ==========================================
// 🧮 ปรับ "ยอดที่จ่ายแล้ว" ของคนหนึ่งคนให้เป็นยอดใหม่ โดยแก้รายการรับเงินเดิมให้น้อยที่สุด
// payments ต้องเรียงจากรายการล่าสุดไปเก่าสุด
// - ยอดใหม่ ≤ 0          → ลบทุกรายการ
// - ยังไม่มีรายการ        → สร้างรายการใหม่ 1 รายการ
// - มีรายการเดียว         → แก้ยอดของรายการนั้น
// - ยอดเพิ่มขึ้น           → บวกส่วนต่างเข้ารายการล่าสุด
// - ยอดลดลง              → หักจากรายการล่าสุดย้อนไปเรื่อยๆ (รายการที่ถูกหักหมดจะถูกลบ)
// ==========================================
export function planPaidAdjustment(payments: PaymentAmount[], newPaid: number): PaidAdjustment {
    const plan: PaidAdjustment = { deleteIds: [], updates: [], create: null };
    const target = roundMoney(newPaid);

    if (target <= 0) {
        plan.deleteIds = payments.map((p) => p.id);
        return plan;
    }
    if (payments.length === 0) {
        plan.create = target;
        return plan;
    }
    if (payments.length === 1) {
        plan.updates.push({ id: payments[0]!.id, amount: target });
        return plan;
    }

    const current = roundMoney(payments.reduce((sum, p) => sum + p.amount, 0));
    if (target > current) {
        const latest = payments[0]!;
        plan.updates.push({ id: latest.id, amount: roundMoney(latest.amount + roundMoney(target - current)) });
        return plan;
    }

    let toReduce = roundMoney(current - target);
    for (const p of payments) {
        if (toReduce <= 0) break;
        if (p.amount <= toReduce + 0.001) {
            plan.deleteIds.push(p.id);
            toReduce = roundMoney(Math.max(0, toReduce - p.amount));
        } else {
            plan.updates.push({ id: p.id, amount: roundMoney(p.amount - toReduce) });
            toReduce = 0;
        }
    }
    return plan;
}
