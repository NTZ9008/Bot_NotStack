import type { AttachmentBuilder, GuildMember, PartialGuildMember } from 'discord.js';

// ผู้ใช้แบบย่อ — รับได้ทั้ง User / PartialUser ของ discord.js และ executor จาก audit log
export interface UserLike {
    id: string;
    username?: string | null;
    globalName?: string | null;
    tag?: string | null;
    bot?: boolean | null;
}

export interface LogField {
    name: string;
    value: string;
    inline?: boolean;
}

// ข้อมูลที่ใช้กรอง "ไม่ต้อง log" (ห้อง / คน / ยศ / บอท)
export interface LogContext {
    userId?: string | null;
    isBot?: boolean | null;
    channelId?: string | null;
    parentId?: string | null;
    member?: GuildMember | PartialGuildMember | null;
}

// ข้อมูลเพิ่มที่ call site รู้ดีกว่า — ใช้ตอนบันทึกลงตาราง activity_events
export interface ActivityExtra {
    executor?: UserLike | null;
    executorId?: string | null;
    executorName?: string | null;
    reason?: string | null;
    channelId?: string | null;
    channelName?: string | null;
    userId?: string | null;
    userName?: string | null;
    user?: UserLike | null;
    member?: GuildMember | PartialGuildMember | null;
    isBot?: boolean | null;
    metadata?: Record<string, unknown>;
}

// log หนึ่งรายการ = embed ที่ส่งเข้าห้อง Discord + แถวใน activity_events
export interface LogPayload {
    title?: string;
    description?: string;
    fields?: (LogField | null)[];
    thumbnail?: string | null;
    footer?: string;
    files?: AttachmentBuilder[];
    context?: LogContext;
    record?: ActivityExtra;
}
