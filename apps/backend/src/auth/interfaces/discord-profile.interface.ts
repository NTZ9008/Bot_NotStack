import type { OAuthMode } from './jwt-payload.interface';

export interface DiscordProfile {
    id: string;
    username: string;
    globalName: string | null;
    avatarUrl: string;
}

// ขั้นตอน OAuth ที่ state ยืนยันแล้ว: login ปกติ หรือผูก Discord เข้ากับบัญชีที่ login อยู่ (userId)
export interface OAuthFlow {
    mode: OAuthMode;
    userId: number | null;
}

// ผลของ DiscordStrategy (ใส่ไว้ที่ req.discordAuth)
export interface DiscordAuthResult {
    flow: OAuthFlow;
    profile: DiscordProfile;
}

export interface RequestContext {
    ip?: string;
    userAgent?: string;
}
