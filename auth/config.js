// ==========================================
// ⚙️ AUTH CONFIG
// ค่าคงที่ของระบบ login (JWT / refresh token / cookie / Discord OAuth) และค่าที่อ่านจาก .env
// ==========================================
require('dotenv').config({ quiet: true });
const crypto = require('crypto');

const isProduction = process.env.NODE_ENV === 'production';

// JWT_SECRET ควรยาว 32 ตัวอักษรขึ้นไป — สร้างได้ด้วย:
//   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
// ถ้าไม่ได้ตั้ง (หรือสั้นเกิน) จะสุ่ม secret ชั่วคราวแทน: ยังปลอดภัย แต่ทุกคนต้อง login ใหม่ทุกครั้งที่รีสตาร์ทบอท
function resolveJwtSecret() {
    const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
    if (secret && secret.length >= 32) return secret;
    console.warn('⚠️ [Auth] ยังไม่ได้ตั้ง JWT_SECRET (หรือสั้นกว่า 32 ตัวอักษร) — ใช้ secret สุ่มชั่วคราว ทุกคนจะต้อง login ใหม่เมื่อรีสตาร์ท');
    return crypto.randomBytes(48).toString('base64url');
}

// host ของหน้า Dashboard ที่อนุญาตให้ยิง POST/PATCH/DELETE เข้ามา (กัน CSRF) — นอกเหนือจาก Host header ของ request เอง
function resolveDashboardHost() {
    try {
        return new URL(process.env.DASHBOARD_URL || 'https://notstackutdash.arlifzs.site').host;
    } catch {
        return null;
    }
}

const discordAdminIds = (process.env.ADMIN_DISCORD_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

const discord = {
    // ใช้ Application ID เดียวกับบอทได้ (config.json → clientId) แต่ client secret ต้องเอาจาก Developer Portal → OAuth2
    clientId: process.env.DISCORD_CLIENT_ID || require('../config.json').clientId,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    // ต้องตรงกับที่ลงทะเบียนไว้ใน Developer Portal เป๊ะ เช่น https://notstackutdash.arlifzs.site/api/auth/discord/callback
    redirectUri: process.env.DISCORD_REDIRECT_URI,
    // Discord ID ที่ได้ role ADMIN อัตโนมัติตอนสมัครครั้งแรก (ครั้งต่อไปแอดมินปรับ role เองได้ในหน้า Users)
    adminIds: new Set(discordAdminIds),
};
discord.enabled = Boolean(discord.clientId && discord.clientSecret && discord.redirectUri);

module.exports = {
    isProduction,
    jwtSecret: resolveJwtSecret(),
    dashboardHost: resolveDashboardHost(),
    discord,

    JWT_ISSUER: 'botnotstack-dashboard',
    JWT_AUDIENCE: 'botnotstack-dashboard',
    OAUTH_STATE_AUDIENCE: 'botnotstack-discord-oauth',

    ACCESS_TOKEN_TTL_SEC: 15 * 60,              // access token (JWT) อายุสั้น 15 นาที
    REFRESH_TOKEN_TTL_MS: 7 * 24 * 60 * 60 * 1000, // refresh token 7 วัน (ต่ออายุทุกครั้งที่ใช้)
    REFRESH_REUSE_GRACE_MS: 30 * 1000,          // refresh พร้อมกันหลายแท็บภายใน 30 วิ ไม่นับว่าโดนขโมย
    OAUTH_STATE_TTL_SEC: 10 * 60,

    MAX_FAILED_LOGINS: 5,                       // ใส่รหัสผิดติดกันกี่ครั้งถึงล็อกบัญชี
    LOCK_DURATION_MS: 15 * 60 * 1000,
    BCRYPT_ROUNDS: 12,

    AUDIT_LOG_RETENTION_DAYS: Number(process.env.AUDIT_LOG_RETENTION_DAYS) || 180,

    // production ใช้ cookie prefix บังคับ Secure (+ Path=/ สำหรับ __Host-) ให้เบราว์เซอร์ช่วยกันการเขียนทับ cookie
    COOKIE: {
        access: isProduction ? '__Host-ns_at' : 'ns_at',
        refresh: isProduction ? '__Secure-ns_rt' : 'ns_rt',
        oauthState: isProduction ? '__Secure-ns_oauth' : 'ns_oauth',
    },
};
