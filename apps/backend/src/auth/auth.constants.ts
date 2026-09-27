// ==========================================
// ⚙️ ค่าคงที่ของระบบ login (JWT / refresh token / cookie / Discord OAuth)
// ==========================================
export const AUTH = {
    JWT_ISSUER: 'botnotstack-dashboard',
    JWT_AUDIENCE: 'botnotstack-dashboard',
    OAUTH_STATE_AUDIENCE: 'botnotstack-discord-oauth',

    ACCESS_TOKEN_TTL_SEC: 15 * 60, // access token (JWT) อายุสั้น 15 นาที
    REFRESH_TOKEN_TTL_MS: 7 * 24 * 60 * 60 * 1000, // refresh token 7 วัน (ต่ออายุทุกครั้งที่ใช้)
    REFRESH_REUSE_GRACE_MS: 30 * 1000, // refresh พร้อมกันหลายแท็บภายใน 30 วิ ไม่นับว่าโดนขโมย
    OAUTH_STATE_TTL_SEC: 10 * 60,

    MAX_FAILED_LOGINS: 5, // ใส่รหัสผิดติดกันกี่ครั้งถึงล็อกบัญชี
    LOCK_DURATION_MS: 15 * 60 * 1000,
    BCRYPT_ROUNDS: 12,
} as const;

// ชื่อ strategy ของ passport
export const LOCAL_STRATEGY = 'local';
export const JWT_STRATEGY = 'jwt';
export const DISCORD_STRATEGY = 'discord';
