import { z } from 'zod';
import { SNOWFLAKE_RE } from './common';

// ==========================================
// 💰 FUND — เก็บเงินตามเป้า (ยอดคงที่ & ยอดรายวัน)
// - หัวข้อ (topic) ได้หลายเรื่องต่อเซิร์ฟเวอร์ แต่ละเรื่องตั้ง "ยอดเก็บต่อคน" หรือ "ยอดรายวัน" ได้
// - รองรับการบันทึกย้อนหลังตามห้วงเวลา (periodStart - periodEnd) คำนวณวันและยอดเงินให้อัตโนมัติ
// - เพิ่ม/ลบคนในหัวข้อได้ และตั้งยอดเฉพาะคนได้ (null = ใช้ยอดต่อคนของหัวข้อ)
// - บันทึก/แก้ไขการรับเงินทีละรายการหรือเป็นกลุ่ม (Batch) และ Export เป็น CSV รองรับภาษาไทย (UTF-8 BOM)
// ==========================================
export const FUND_LIMITS = {
    name: 100,
    description: 500,
    note: 200,
    // ยอดเงินสูงสุดต่อช่อง (DECIMAL(12,2))
    amount: 9_999_999_999,
    membersPerTopic: 200,
    // ต่อการเพิ่ม 1 ครั้ง
    membersPerAdd: 200,
} as const;

export type FundMemberStatus = 'paid' | 'partial' | 'unpaid';

export interface FundMemberView {
    id: number;
    userId: string;
    displayName: string;
    avatar: string;
    // ยอดที่ต้องจ่าย (ยอดเฉพาะคน หรือยอดต่อคนของหัวข้อ)
    target: number;
    // true = ตั้งยอดเฉพาะคนนี้
    customTarget: boolean;
    paid: number;
    remaining: number;
    status: FundMemberStatus;
}

export interface FundPaymentView {
    id: number;
    memberId: number;
    memberName: string;
    amount: number;
    note: string;
    paidAt: string;
    // ห้วงเวลาที่จ่าย (ถ้ามี เช่น งวดวันที่ 01/10/2026 - 15/10/2026)
    periodStart: string | null;
    periodEnd: string | null;
    recordedBy: string;
}

export interface FundTopicSummary {
    id: number;
    name: string;
    description: string;
    amountPerMember: number;
    // ยอดรายวัน (เช่น 15 บาท/วัน) — null หรือ 0 = ยอดคงที่
    dailyRate: number | null;
    startDate: string | null;
    reportChannelId: string;
    dueDate: string | null;
    closed: boolean;
    memberCount: number;
    paidCount: number;
    // ยอดเป้ารวมของทุกคน / ยอดที่เก็บได้แล้ว
    target: number;
    collected: number;
    createdAt: string;
    updatedAt: string;
}

export interface FundTopicDetail extends FundTopicSummary {
    members: FundMemberView[];
    payments: FundPaymentView[];
}

// ปัดเป็นทศนิยม 2 ตำแหน่ง (สตางค์) กันเลขทศนิยมลอย
export const roundMoney = (value: number): number => Math.round((Number(value) || 0) * 100) / 100;

export const formatBaht = (value: number): string => `${roundMoney(value).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} บาท`;

export function fundMemberStatus(target: number, paid: number): FundMemberStatus {
    if (paid <= 0) return target <= 0 ? 'paid' : 'unpaid';
    return paid + 0.001 >= target ? 'paid' : 'partial';
}

// คำนวณจำนวนวันระหว่าง 2 วันที่ (แบบนับรวมวันเริ่มต้นและสิ้นสุด เช่น 1 ถึง 15 = 15 วัน)
export function calculateDays(from: string | Date | null | undefined, to: string | Date | null | undefined): number {
    if (!from || !to) return 0;
    const d1 = new Date(from);
    const d2 = new Date(to);
    if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return 0;
    const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
    const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
    const diff = Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? diff + 1 : 0;
}

export function calculateDailyAmount(dailyRate: number, from: string | Date, to: string | Date): number {
    return roundMoney(calculateDays(from, to) * (Number(dailyRate) || 0));
}

// สร้างไฟล์ CSV พร้อม UTF-8 BOM สำหรับเปิดใน Excel ได้ภาษาไทยไม่เพี้ยน
function escapeCsv(cell: unknown): string {
    let str = String(cell ?? '');
    // ป้องกัน CSV Formula Injection ใน Microsoft Excel / LibreOffice
    if (/^[\s\u0000-\u001f]*[=+\-@]/.test(str) || /^[\t\r\n]/.test(str)) {
        str = `'${str}`;
    }
    return str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r') ? `"${str.replace(/"/g, '""')}"` : str;
}

const formatCsvDate = (val: string | Date | null | undefined): string => {
    if (!val) return '-';
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('th-TH');
};

const formatCsvDateTime = (val: string | Date | null | undefined): string => {
    if (!val) return '-';
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('th-TH');
};

// ชื่อไฟล์ CSV เดียวกันทั้งตอนดาวน์โหลดจากหน้าเว็บและจาก API (ตัดอักขระที่ใช้ในชื่อไฟล์ไม่ได้ออก)
export function fundCsvFilename(topicName: string, date = new Date()): string {
    const safeName = (topicName || 'fund').replace(/[/\\?%*:|"<>]/g, '_').slice(0, 50);
    return `fund-${safeName}-${date.toISOString().slice(0, 10)}.csv`;
}

export function generateFundCsv(topic: FundTopicDetail): string {
    const lines: string[] = [];
    const pushRow = (...cols: unknown[]) => lines.push(cols.map(escapeCsv).join(','));

    // --- ส่วนสรุปหัวข้อ ---
    pushRow('หัวข้อการเก็บเงิน', topic.name);
    if (topic.description) pushRow('รายละเอียด', topic.description);
    pushRow('รูปแบบการเก็บ', topic.dailyRate && topic.dailyRate > 0 ? `รายวัน (วันละ ${formatBaht(topic.dailyRate)})` : 'ยอดคงที่');
    if (topic.startDate) pushRow('วันที่เริ่มเก็บ', formatCsvDate(topic.startDate));
    if (topic.dueDate) pushRow('วันครบกำหนด', formatCsvDate(topic.dueDate));
    pushRow('สถานะ', topic.closed ? 'ปิดการเก็บเงินแล้ว' : 'กำลังเปิดรับเงิน');
    pushRow('ยอดเป้าหมายรวม', topic.target);
    pushRow('ยอดเก็บได้แล้ว', topic.collected);
    pushRow('ยอดคงค้างรวม', Math.max(0, roundMoney(topic.target - topic.collected)));
    pushRow('จำนวนสมาชิก', `${topic.paidCount}/${topic.memberCount} คน (จ่ายครบ/ทั้งหมด)`);
    pushRow('');

    // --- ส่วนรายชื่อสมาชิก ---
    pushRow('--- รายชื่อสมาชิก ---');
    pushRow('User ID', 'ชื่อ', 'ยอดเป้าหมาย', 'จ่ายแล้ว', 'คงค้าง', 'สถานะ');
    const statusMap: Record<FundMemberStatus, string> = { paid: 'จ่ายครบ', partial: 'จ่ายบางส่วน', unpaid: 'ยังไม่จ่าย' };
    for (const m of topic.members) {
        // ใช้ ="ID" เพื่อไม่ให้ Excel แปลง Discord ID (18-19 หลัก) เป็น Scientific notation เช่น 1.23E+17
        const formattedUserId = m.userId ? `="${m.userId}"` : '';
        pushRow(formattedUserId, m.displayName, m.target, m.paid, m.remaining, statusMap[m.status] || m.status);
    }
    pushRow('');

    // --- ส่วนประวัติการรับเงิน ---
    pushRow('--- ประวัติการรับเงิน ---');
    pushRow('ลำดับ', 'วันเวลาที่รับเงิน', 'ชื่อสมาชิก', 'จำนวนเงิน', 'ห้วงเวลาที่จ่าย (เริ่มต้น)', 'ห้วงเวลาที่จ่าย (สิ้นสุด)', 'หมายเหตุ', 'ผู้บันทึก');
    topic.payments.forEach((p, idx) => {
        pushRow(
            idx + 1,
            formatCsvDateTime(p.paidAt),
            p.memberName,
            p.amount,
            p.periodStart ? formatCsvDate(p.periodStart) : '-',
            p.periodEnd ? formatCsvDate(p.periodEnd) : '-',
            p.note || '-',
            p.recordedBy || '-',
        );
    });

    // \uFEFF คือ UTF-8 BOM ให้ Microsoft Excel บน Windows เปิดภาษาไทยได้ถูกต้อง
    return `\uFEFF${lines.join('\r\n')}`;
}

// ---------- validation ----------
const money = (label: string) =>
    z.coerce
        .number({ error: `${label}ต้องเป็นตัวเลข` })
        .refine((value) => Number.isFinite(value), `${label}ต้องเป็นตัวเลข`)
        .min(0, `${label}ต้องไม่ติดลบ`)
        .max(FUND_LIMITS.amount, `${label}มากเกินไป`)
        .transform(roundMoney);

const snowflake = z.string().regex(SNOWFLAKE_RE, 'รหัส Discord ไม่ถูกต้อง');
const channelId = z.union([z.literal(''), snowflake]);

// วันที่: ISO string / '' / null (= ไม่กำหนด)
const dateField = z.union([z.string(), z.null()]).transform((value, ctx) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        ctx.addIssue({ code: 'custom', message: 'วันที่ไม่ถูกต้อง' });
        return z.NEVER;
    }
    return date.toISOString();
});

export const createFundTopicSchema = z.object({
    name: z
        .string({ error: 'กรุณาตั้งชื่อหัวข้อ' })
        .trim()
        .min(1, 'กรุณาตั้งชื่อหัวข้อ')
        .max(FUND_LIMITS.name, `ชื่อหัวข้อยาวได้ไม่เกิน ${FUND_LIMITS.name} ตัวอักษร`),
    description: z.string().trim().max(FUND_LIMITS.description, `รายละเอียดยาวได้ไม่เกิน ${FUND_LIMITS.description} ตัวอักษร`).optional(),
    amountPerMember: money('ยอดเก็บต่อคน'),
    dailyRate: money('ยอดรายวัน').nullable().optional(),
    startDate: dateField.optional(),
    dueDate: dateField.optional(),
    reportChannelId: channelId.optional(),
});
export type CreateFundTopicInput = z.input<typeof createFundTopicSchema>;
export type CreateFundTopicData = z.output<typeof createFundTopicSchema>;

export const updateFundTopicSchema = createFundTopicSchema.partial().extend({
    closed: z.boolean().optional(),
});
export type UpdateFundTopicInput = z.input<typeof updateFundTopicSchema>;
export type UpdateFundTopicData = z.output<typeof updateFundTopicSchema>;

// เพิ่มคนทีละหลายคน หรือดึงทุกคนที่มียศหนึ่ง (ต้องระบุอย่างน้อย 1 อย่าง)
export const addFundMembersSchema = z
    .object({
        userIds: z.array(snowflake).max(FUND_LIMITS.membersPerAdd, `เพิ่มได้ครั้งละไม่เกิน ${FUND_LIMITS.membersPerAdd} คน`).optional(),
        roleId: snowflake.optional(),
        // ยอดเฉพาะคนที่เพิ่มรอบนี้ (ไม่ส่ง = ใช้ยอดต่อคนของหัวข้อ)
        targetAmount: money('ยอดเฉพาะคน').nullable().optional(),
    })
    .refine((body) => (body.userIds?.length ?? 0) > 0 || Boolean(body.roleId), { message: 'กรุณาเลือกสมาชิกหรือยศที่จะเพิ่ม' });
export type AddFundMembersInput = z.input<typeof addFundMembersSchema>;
export type AddFundMembersData = z.output<typeof addFundMembersSchema>;

export const updateFundMemberSchema = z.object({
    // null = กลับไปใช้ยอดต่อคนของหัวข้อ
    targetAmount: money('ยอดเฉพาะคน').nullable().optional(),
    // ปรับยอดที่จ่ายแล้วรวมของคนนี้โดยตรง
    paidAmount: money('ยอดที่จ่ายแล้ว').optional(),
});
export type UpdateFundMemberInput = z.input<typeof updateFundMemberSchema>;
export type UpdateFundMemberData = z.output<typeof updateFundMemberSchema>;

export const createFundPaymentSchema = z.object({
    memberId: z.coerce.number().int().positive('กรุณาเลือกคนที่จ่าย'),
    amount: money('จำนวนเงิน').refine((value) => value > 0, 'จำนวนเงินต้องมากกว่า 0'),
    note: z.string().trim().max(FUND_LIMITS.note, `หมายเหตุยาวได้ไม่เกิน ${FUND_LIMITS.note} ตัวอักษร`).optional(),
    paidAt: dateField.optional(),
    periodStart: dateField.optional(),
    periodEnd: dateField.optional(),
});
export type CreateFundPaymentInput = z.input<typeof createFundPaymentSchema>;
export type CreateFundPaymentData = z.output<typeof createFundPaymentSchema>;

export const updateFundPaymentSchema = z.object({
    memberId: z.coerce.number().int().positive('กรุณาเลือกคนที่จ่าย').optional(),
    amount: money('จำนวนเงิน')
        .refine((value) => value > 0, 'จำนวนเงินต้องมากกว่า 0')
        .optional(),
    note: z.string().trim().max(FUND_LIMITS.note, `หมายเหตุยาวได้ไม่เกิน ${FUND_LIMITS.note} ตัวอักษร`).optional(),
    paidAt: dateField.optional(),
    periodStart: dateField.optional(),
    periodEnd: dateField.optional(),
});
export type UpdateFundPaymentInput = z.input<typeof updateFundPaymentSchema>;
export type UpdateFundPaymentData = z.output<typeof updateFundPaymentSchema>;

export const batchFundPaymentSchema = z.object({
    memberIds: z.array(z.coerce.number().int().positive()).min(1, 'กรุณาเลือกสมาชิกอย่างน้อย 1 คน'),
    amount: money('จำนวนเงิน').refine((value) => value > 0, 'จำนวนเงินต้องมากกว่า 0'),
    note: z.string().trim().max(FUND_LIMITS.note, `หมายเหตุยาวได้ไม่เกิน ${FUND_LIMITS.note} ตัวอักษร`).optional(),
    paidAt: dateField.optional(),
    periodStart: dateField.optional(),
    periodEnd: dateField.optional(),
});
export type BatchFundPaymentInput = z.input<typeof batchFundPaymentSchema>;
export type BatchFundPaymentData = z.output<typeof batchFundPaymentSchema>;

export const sendFundReportSchema = z.object({
    // ไม่ส่ง = ใช้ห้องรายงานที่ตั้งไว้ในหัวข้อ
    channelId: snowflake.optional(),
    // แท็กคนที่ยังจ่ายไม่ครบในรายงาน
    mentionUnpaid: z.boolean().optional(),
});
export type SendFundReportInput = z.input<typeof sendFundReportSchema>;
