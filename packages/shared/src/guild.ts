// ==========================================
// 🏰 GUILD — เซิร์ฟเวอร์ Discord ที่บอทอยู่ (multi-server) + ข้อมูลที่หน้าเว็บใช้ทำ dropdown / ค้นหาสมาชิก
// ==========================================

// สิทธิ์ของผู้ใช้ Dashboard ต่อเซิร์ฟเวอร์หนึ่ง
// - manage: ตั้งค่าบอทได้ทุกอย่าง (มีสิทธิ์ Manage Server / Administrator / เป็นเจ้าของเซิร์ฟเวอร์ หรือเป็น ADMIN ของระบบ)
// - view:   เป็นสมาชิกของเซิร์ฟเวอร์ ดูได้เฉพาะหน้า Levels
export type GuildAccessLevel = 'view' | 'manage';

export interface GuildSummary {
    id: string;
    name: string;
    iconUrl: string | null;
    memberCount: number;
    access: GuildAccessLevel;
    // เซิร์ฟเวอร์หลักของบอท (DISCORD_GUILD_ID) — มีคำสั่งเฉพาะของ NotStack (/verify /addroles ...)
    isHome: boolean;
}

export interface GuildListResponse {
    guilds: GuildSummary[];
    // ลิงก์เชิญบอทเข้าเซิร์ฟเวอร์ของตัวเอง (null = บอทยังไม่ออนไลน์)
    inviteUrl: string | null;
    // บัญชีนี้ยังไม่ได้เชื่อมต่อ Discord → ระบบไม่รู้ว่าเป็นสมาชิกเซิร์ฟเวอร์ไหน
    needsDiscordLink: boolean;
    botOnline: boolean;
}

export interface GuildChannel {
    id: string;
    name: string;
    category: string;
    position: number;
    // ห้องที่ "ส่งข้อความเข้าไปได้" มีแค่ห้องข้อความ ส่วน ignore list เลือกได้ทุกแบบ
    sendable: boolean;
    isCategory: boolean;
    isVoice: boolean;
}

export interface GuildRole {
    id: string;
    name: string;
    position: number;
}

export interface VoiceChannelOption {
    id: string;
    name: string;
}

export interface MemberSearchResult {
    userId: string;
    username: string;
    tag: string;
    avatar: string;
    nickname: string | null;
}

// ผู้ใช้ Discord แบบย่อ (ชื่อ + รูป) ที่หน้าเว็บแสดงในรายการต่างๆ
export interface DiscordUserInfo {
    userId: string;
    username: string;
    avatar: string;
}

export interface BotInfo {
    name: string;
    avatar: string;
}

export interface AppInfo {
    version: string;
    bot: BotInfo | null;
}
