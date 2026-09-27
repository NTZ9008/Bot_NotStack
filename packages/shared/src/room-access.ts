import { z } from 'zod';
import { SNOWFLAKE_RE } from './common';

// ==========================================
// 🎫 ROOM ACCESS — ให้สิทธิ์เห็นห้องพิเศษ (ถาวร / จำกัดเวลา)
// ห้องที่ให้สิทธิ์ได้ตั้งเองต่อเซิร์ฟเวอร์ (ตาราง room_access_channels)
// ==========================================

// roomId = 'all' → ทุกห้องที่ตั้งไว้ของเซิร์ฟเวอร์นี้
export const ALL_ROOMS = 'all';

export const grantAccessSchema = z.object({
    userId: z.string({ error: 'User ID, Room ID, and Action are required' }).trim().min(1, 'User ID, Room ID, and Action are required'),
    roomId: z.string({ error: 'User ID, Room ID, and Action are required' }).trim().min(1, 'User ID, Room ID, and Action are required'),
    action: z.enum(['grant', 'revoke'], { error: 'User ID, Room ID, and Action are required' }),
    // นาที (รับทศนิยมได้ เพื่อให้ตั้งเป็นวินาทีได้) — ไม่ระบุ/0 = ถาวร
    duration: z.number().positive().nullish(),
});
export type GrantAccessInput = z.input<typeof grantAccessSchema>;

export interface GrantAccessResponse {
    success: true;
    message: string;
    errors?: string[];
}

export interface RoomAccessItem {
    userId: string;
    username: string;
    avatar: string | null;
    roomId: string;
    roomName: string;
    type: 'temporary' | 'permanent';
    // เวลาหมดอายุเป็น ms (Date.now())
    expireAt: number | null;
}

// ห้องที่เปิดให้ใช้ระบบตั๋ว
export interface AccessRoom {
    id: string;
    name: string;
    // false = ห้องถูกลบไปแล้ว หรือบอทมองไม่เห็น
    exists: boolean;
}

export const accessRoomSchema = z.object({
    channelId: z.string({ error: 'กรุณาเลือกห้อง' }).trim().regex(SNOWFLAKE_RE, 'Channel ID ไม่ถูกต้อง'),
});
export type AccessRoomInput = z.input<typeof accessRoomSchema>;
