import { z } from 'zod';
import { logAppearanceSchema, type LogAppearance } from './log-appearance';

// ==========================================
// 📚 LOG EVENT CATALOG
// รายการ log ทั้งหมดที่ระบบรองรับ — แหล่งความจริงเดียว (single source of truth)
// ทั้งฝั่ง DB (seed ค่า default), ฝั่ง API และฝั่ง Dashboard
// ==========================================

// สีมาตรฐานตามชนิดเหตุการณ์ (อิงโทนสีของ Discord)
export const LOG_COLOR = {
    CREATE: '#57F287', // เขียว — สร้างของใหม่
    DELETE: '#ED4245', // แดง — ลบ
    UPDATE: '#FEE75C', // เหลือง — แก้ไข
    MEMBER: '#5865F2', // น้ำเงิน — สมาชิก
    VOICE: '#00B0F4', // ฟ้า — ห้องเสียง
    DANGER: '#992D22', // แดงเข้ม — แบน / ลงโทษ
    SAFE: '#1ABC9C', // เขียวน้ำทะเล — ปลดโทษ
    SECURITY: '#E67E22', // ส้ม — ความปลอดภัย / AutoMod
} as const;

// group ใช้จัดกลุ่มการ์ดในหน้า Dashboard
export const LOG_GROUP = {
    MEMBER: 'สมาชิก',
    MESSAGE: 'ข้อความ',
    CHANNEL: 'ช่อง & เธรด',
    SERVER: 'บทบาท & เซิร์ฟเวอร์',
    VOICE: 'ห้องเสียง',
    SECURITY: 'ความปลอดภัย & AutoMod',
} as const;

export interface LogEventDefinition {
    key: string;
    label: string;
    group: string;
    color: string;
}

const G = LOG_GROUP;
const C = LOG_COLOR;

export const LOG_EVENTS = [
    // --- สมาชิก ---
    { key: 'memberJoin', label: 'สมาชิกเข้าร่วม', group: G.MEMBER, color: C.CREATE },
    { key: 'memberLeave', label: 'สมาชิกออก', group: G.MEMBER, color: C.DELETE },
    { key: 'memberBan', label: 'แบนสมาชิก', group: G.MEMBER, color: C.DANGER },
    { key: 'memberUnban', label: 'ปลดแบนสมาชิก', group: G.MEMBER, color: C.SAFE },
    { key: 'memberKick', label: 'เตะสมาชิก', group: G.MEMBER, color: C.DANGER },
    { key: 'memberTimeout', label: 'จำกัดการสื่อสาร / ยกเลิก Timeout', group: G.MEMBER, color: C.DANGER },
    { key: 'nicknameUpdate', label: 'เปลี่ยนชื่อเล่น', group: G.MEMBER, color: C.UPDATE },
    { key: 'roleGiven', label: 'ให้บทบาท', group: G.MEMBER, color: C.CREATE },
    { key: 'roleRemoved', label: 'ลบบทบาท', group: G.MEMBER, color: C.DELETE },
    { key: 'userProfileUpdate', label: 'เปลี่ยนชื่อผู้ใช้ / รูปโปรไฟล์', group: G.MEMBER, color: C.UPDATE },
    { key: 'memberPrune', label: 'ล้างสมาชิกที่ไม่เคลื่อนไหว (Prune)', group: G.MEMBER, color: C.DANGER },

    // --- ข้อความ ---
    { key: 'messageDelete', label: 'ลบข้อความ', group: G.MESSAGE, color: C.DELETE },
    { key: 'messageUpdate', label: 'แก้ไขข้อความ', group: G.MESSAGE, color: C.UPDATE },
    { key: 'messageBulkDelete', label: 'ลบข้อความจำนวนมาก (Purge)', group: G.MESSAGE, color: C.DELETE },
    { key: 'messagePin', label: 'ปักหมุด / เลิกปักหมุดข้อความ', group: G.MESSAGE, color: C.UPDATE },
    { key: 'invitePosted', label: 'มีคนโพสต์ลิงก์เชิญ', group: G.MESSAGE, color: C.SECURITY },
    { key: 'filterUsed', label: 'ใช้คำสั่งการคัดกรอง', group: G.MESSAGE, color: C.DANGER },

    // --- ช่อง & เธรด ---
    { key: 'channelCreate', label: 'สร้างช่อง', group: G.CHANNEL, color: C.CREATE },
    { key: 'channelDelete', label: 'ลบช่อง', group: G.CHANNEL, color: C.DELETE },
    { key: 'channelUpdate', label: 'แก้ไขช่อง', group: G.CHANNEL, color: C.UPDATE },
    { key: 'channelPermissionUpdate', label: 'แก้ไขสิทธิ์ของช่อง', group: G.CHANNEL, color: C.UPDATE },
    { key: 'threadCreate', label: 'สร้างเธรด', group: G.CHANNEL, color: C.CREATE },
    { key: 'threadDelete', label: 'ลบเธรด', group: G.CHANNEL, color: C.DELETE },
    { key: 'threadUpdate', label: 'แก้ไขเธรด', group: G.CHANNEL, color: C.UPDATE },

    // --- บทบาท & เซิร์ฟเวอร์ ---
    { key: 'roleCreate', label: 'สร้างบทบาท', group: G.SERVER, color: C.CREATE },
    { key: 'roleDelete', label: 'ลบบทบาท', group: G.SERVER, color: C.DELETE },
    { key: 'roleUpdate', label: 'แก้ไขบทบาท', group: G.SERVER, color: C.UPDATE },
    { key: 'guildUpdate', label: 'อัปเดตเซิร์ฟเวอร์', group: G.SERVER, color: C.UPDATE },
    { key: 'inviteCreate', label: 'คำเชิญของเซิร์ฟเวอร์', group: G.SERVER, color: C.MEMBER },
    { key: 'emojiUpdate', label: 'อีโมจิ (เพิ่ม / แก้ไข / ลบ)', group: G.SERVER, color: C.UPDATE },
    { key: 'stickerUpdate', label: 'สติกเกอร์ (เพิ่ม / แก้ไข / ลบ)', group: G.SERVER, color: C.UPDATE },
    { key: 'scheduledEvent', label: 'กิจกรรมของเซิร์ฟเวอร์ (สร้าง / แก้ไข / ลบ)', group: G.SERVER, color: C.MEMBER },

    // --- ห้องเสียง ---
    { key: 'voiceJoin', label: 'สมาชิกเข้าร่วมช่องเสียง', group: G.VOICE, color: C.VOICE },
    { key: 'voiceLeave', label: 'สมาชิกออกจากช่องเสียง', group: G.VOICE, color: C.VOICE },
    { key: 'voiceSwitch', label: 'สมาชิกสลับห้องเสียง', group: G.VOICE, color: C.VOICE },
    { key: 'voiceStateChange', label: 'สถานะเสียง (ปิดเสียง/ไม่ได้ยิน)', group: G.VOICE, color: C.VOICE },
    { key: 'voiceMoved', label: 'สมาชิกถูกย้ายไปช่องเสียงอื่น (โดยแอดมิน)', group: G.VOICE, color: C.DANGER },
    { key: 'voiceDisconnected', label: 'สมาชิกถูกตัดออกจากช่องเสียง (โดยแอดมิน)', group: G.VOICE, color: C.DANGER },
    { key: 'stageInstance', label: 'เวทีเสียง Stage (เริ่ม / แก้ไข / จบ)', group: G.VOICE, color: C.VOICE },

    // --- ความปลอดภัย & AutoMod ---
    { key: 'autoModAction', label: 'AutoMod ของ Discord ทำงาน', group: G.SECURITY, color: C.DANGER },
    { key: 'autoModRule', label: 'กฎ AutoMod (สร้าง / แก้ไข / ลบ)', group: G.SECURITY, color: C.SECURITY },
    { key: 'webhookUpdate', label: 'Webhook เปลี่ยนแปลง', group: G.SECURITY, color: C.SECURITY },
    { key: 'botAdd', label: 'เพิ่มบอทเข้าเซิร์ฟเวอร์', group: G.SECURITY, color: C.DANGER },
] as const satisfies readonly LogEventDefinition[];

export type LogEventKey = (typeof LOG_EVENTS)[number]['key'];

// เหตุการณ์ที่บันทึกเฉพาะใน Activity Log (ไม่ได้ส่ง embed เข้าห้อง Discord)
export const ACTIVITY_ONLY_EVENTS = {
    messageSent: { label: 'ส่งข้อความ', group: G.MESSAGE, color: C.MEMBER },
    commandUsed: { label: 'ใช้คำสั่งบอท', group: G.MESSAGE, color: C.SECURITY },
} as const;

export type ActivityEventKey = LogEventKey | keyof typeof ACTIVITY_ONLY_EVENTS;

export const LOG_EVENT_MAP: ReadonlyMap<string, LogEventDefinition> = new Map(LOG_EVENTS.map((event) => [event.key, event]));

// ลำดับกลุ่มที่จะแสดงในหน้า Dashboard
export const GROUP_ORDER: string[] = [G.MEMBER, G.MESSAGE, G.CHANNEL, G.SERVER, G.VOICE, G.SECURITY];

// ==========================================
// การตั้งค่า (API)
// ==========================================
export interface LogEventSetting {
    key: string;
    label: string;
    group: string;
    enabled: boolean;
    channelId: string;
    color: string;
}

export interface LogOptions {
    ignoredChannels: string[];
    ignoredUsers: string[];
    ignoredRoles: string[];
    ignoreBots: boolean;
    // บันทึกทุกเหตุการณ์ลงฐานข้อมูลไหม (ใช้ทำกราฟหน้า Overview + ตาราง Activity Log)
    activityRecording: boolean;
    appearance: LogAppearance;
}

export interface LogSettingsResponse {
    systemEnabled: boolean;
    groups: string[];
    events: LogEventSetting[];
    options: LogOptions;
    // ชื่อผู้ใช้ที่อยู่ใน ignore list — หน้าเว็บ list สมาชิกทั้งเซิร์ฟเวอร์เองไม่ได้
    ignoredUserNames: Record<string, string>;
}

export const updateLogSettingSchema = z.object({
    key: z.string({ error: 'ต้องระบุ key ของ log event' }).min(1, 'ต้องระบุ key ของ log event'),
    enabled: z.boolean().optional(),
    channelId: z.string().optional(),
    color: z.string().optional(),
});
export type UpdateLogSettingInput = z.infer<typeof updateLogSettingSchema>;

export const logSystemToggleSchema = z.object({
    enabled: z.boolean({ error: 'ต้องระบุ enabled เป็น true หรือ false' }),
});

export const logApplyAllSchema = z.object({
    channelId: z.string().default(''),
});

export const updateLogOptionsSchema = z.object({
    ignoredChannels: z.array(z.unknown()).optional(),
    ignoredUsers: z.array(z.unknown()).optional(),
    ignoredRoles: z.array(z.unknown()).optional(),
    ignoreBots: z.boolean().optional(),
    activityRecording: z.boolean().optional(),
    appearance: logAppearanceSchema.optional(),
});
export type UpdateLogOptionsInput = z.input<typeof updateLogOptionsSchema>;
