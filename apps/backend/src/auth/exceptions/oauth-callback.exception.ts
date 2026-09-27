import type { OAuthFlow } from '../interfaces/discord-profile.interface';

// Discord OAuth callback ล้มเหลว — OAuthRedirectFilter พาผู้ใช้กลับหน้าเว็บพร้อมรหัส error (ไม่ตอบเป็น JSON)
export class OAuthCallbackException extends Error {
    constructor(
        readonly code: string,
        readonly flow: OAuthFlow | null,
    ) {
        super(code);
    }
}
