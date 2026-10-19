import { z } from 'zod';
import { SNOWFLAKE_RE } from './common';

// ==========================================
// 💰 FUND — เก็บเงินตามเป้า
// - หัวข้อ (topic) ได้หลายเรื่องต่อเซิร์ฟเวอร์ แต่ละเรื่องตั้ง "ยอดเก็บต่อคน" ได้
// - เพิ่ม/ลบคนในหัวข้อได้ และตั้งยอดเฉพาะคนได้ (null = ใช้ยอดต่อคนของหัวข้อ)
// - บันทึกการรับเงินทีละรายการ (จ่ายเป็นงวดได้) แล้วส่งรายงานเข้าห้องที่กำหนด
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
    recordedBy: string;
}

export interface FundTopicSummary {
    id: number;
    name: string;
    description: string;
    amountPerMember: number;
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

export const formatBaht = (value: number): string =>
    `${roundMoney(value).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} บาท`;

export function fundMemberStatus(target: number, paid: number): FundMemberStatus {
    if (paid <= 0) return target <= 0 ? 'paid' : 'unpaid';
    return paid + 0.001 >= target ? 'paid' : 'partial';
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

// วันครบกำหนด: ISO string / '' / null (= ไม่กำหนด)
const dueDate = z
    .union([z.string(), z.null()])
    .transform((value, ctx) => {
        if (!value) return null;
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            ctx.addIssue({ code: 'custom', message: 'วันครบกำหนดไม่ถูกต้อง' });
            return z.NEVER;
        }
        return date.toISOString();
    });

export const createFundTopicSchema = z.object({
    name: z.string({ error: 'กรุณาตั้งชื่อหัวข้อ' }).trim().min(1, 'กรุณาตั้งชื่อหัวข้อ').max(FUND_LIMITS.name, `ชื่อหัวข้อยาวได้ไม่เกิน ${FUND_LIMITS.name} ตัวอักษร`),
    description: z.string().trim().max(FUND_LIMITS.description, `รายละเอียดยาวได้ไม่เกิน ${FUND_LIMITS.description} ตัวอักษร`).optional(),
    amountPerMember: money('ยอดเก็บต่อคน'),
    reportChannelId: channelId.optional(),
    dueDate: dueDate.optional(),
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
    targetAmount: money('ยอดเฉพาะคน').nullable(),
});
export type UpdateFundMemberInput = z.input<typeof updateFundMemberSchema>;
export type UpdateFundMemberData = z.output<typeof updateFundMemberSchema>;

export const createFundPaymentSchema = z.object({
    memberId: z.coerce.number().int().positive('กรุณาเลือกคนที่จ่าย'),
    amount: money('จำนวนเงิน').refine((value) => value > 0, 'จำนวนเงินต้องมากกว่า 0'),
    note: z.string().trim().max(FUND_LIMITS.note, `หมายเหตุยาวได้ไม่เกิน ${FUND_LIMITS.note} ตัวอักษร`).optional(),
    paidAt: dueDate.optional(),
});
export type CreateFundPaymentInput = z.input<typeof createFundPaymentSchema>;
export type CreateFundPaymentData = z.output<typeof createFundPaymentSchema>;

export const sendFundReportSchema = z.object({
    // ไม่ส่ง = ใช้ห้องรายงานที่ตั้งไว้ในหัวข้อ
    channelId: snowflake.optional(),
    // แท็กคนที่ยังจ่ายไม่ครบในรายงาน
    mentionUnpaid: z.boolean().optional(),
});
export type SendFundReportInput = z.input<typeof sendFundReportSchema>;
