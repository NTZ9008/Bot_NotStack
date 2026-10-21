import { z } from 'zod';
import { isIP } from 'node:net';

// ==========================================
// ⚙️ ENV — ตัวแปรจาก .env ทั้งหมดที่ backend ใช้ (ตรวจครั้งเดียวตอนเปิดเซิร์ฟเวอร์)
// ไฟล์ที่อ่าน: apps/backend/.env แล้วค่อย .env ที่ root ของ repo (ตำแหน่งเดิมบนเซิร์ฟเวอร์)
// ==========================================

// ค่าเดิมจาก config.json (Application ID ของบอท + เซิร์ฟเวอร์หลัก)
export const DEFAULT_CLIENT_ID = '1403007938343211099';
export const DEFAULT_GUILD_ID = '1273939427575595181';

const optionalString = z
    .string()
    .optional()
    .transform((value) => (value && value.trim() ? value.trim() : undefined));

const positiveInt = (fallback: number) =>
    z
        .string()
        .optional()
        .transform((value) => {
            const n = Number(value);
            return Number.isInteger(n) && n > 0 ? n : fallback;
        });

// รายการคั่นด้วย , (เช่น ADMIN_DISCORD_IDS / CORS_ORIGINS)
const stringList = z
    .string()
    .optional()
    .transform((value) =>
        (value ?? '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
    );

export const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'dev', 'test', 'production']).default('production'),
    // interface ที่ API รับการเชื่อมต่อ — ไม่ตั้ง = ทุก interface (แบบเดิม) ; อยู่หลัง reverse proxy / tunnel ในเครื่องเดียวกันควรตั้ง 127.0.0.1
    HOST: optionalString,
    // proxy ที่เชื่อ X-Forwarded-For (ใช้หา IP จริงของผู้ใช้สำหรับ rate limit / audit)
    // ระบุเป็น loopback / linklocal / uniquelocal / IP / CIDR คั่นด้วย , หรือจำนวน hop (เช่น 1) ถ้า proxy อยู่คนละเครื่องและ IP ไม่คงที่
    TRUST_PROXY: z
        .string()
        .default('loopback')
        .transform((v) =>
            v
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean),
        )
        .refine(
            (items) =>
                (items.length === 1 && /^\d{1,2}$/.test(items[0]!)) ||
                items.every((x) => {
                    if (['loopback', 'linklocal', 'uniquelocal'].includes(x)) return true;
                    const [ip, bits] = x.split('/');
                    const family = isIP(ip ?? '');
                    return !!family && (bits === undefined || (/^\d+$/.test(bits) && Number(bits) <= (family === 4 ? 32 : 128)));
                }),
            'ใช้ได้เฉพาะ loopback / linklocal / uniquelocal / IP / CIDR หรือจำนวน hop',
        )
        .transform((items) => (items.length === 1 && /^\d{1,2}$/.test(items[0]!) ? Number(items[0]) : items)),
    PORT: positiveInt(3035),

    DATABASE_URL: z
        .string({ error: 'ยังไม่ได้ตั้งค่า DATABASE_URL ในไฟล์ .env (เช่น postgresql://user:password@host:5432/dbname)' })
        .min(1, 'ยังไม่ได้ตั้งค่า DATABASE_URL ในไฟล์ .env (เช่น postgresql://user:password@host:5432/dbname)'),

    // Discord bot — ไม่ใส่ TOKEN = เปิดแค่ API (บอทไม่ login)
    TOKEN: optionalString,
    DISCORD_CLIENT_ID: optionalString.transform((value) => value ?? DEFAULT_CLIENT_ID),
    // เซิร์ฟเวอร์หลัก: ได้คำสั่งเฉพาะของ NotStack (/verify /addroles /setuproles /admininfo) และค่าเริ่มต้นแบบเดิม
    DISCORD_GUILD_ID: optionalString.transform((value) => value ?? DEFAULT_GUILD_ID),

    // Dashboard login
    JWT_SECRET: optionalString,
    SESSION_SECRET: optionalString,
    // URL หน้า Dashboard (ใช้กัน CSRF และเป็นปลายทาง redirect หลัง login ด้วย Discord)
    DASHBOARD_URL: optionalString,
    // origin ของหน้าเว็บที่อยู่คนละ origin กับ API (คั่นด้วย ,) — ว่าง = หน้าเว็บกับ API อยู่ origin เดียวกัน
    // ใส่ https://*.example.com = ทุก subdomain (รูปแบบดูที่ config/allowed-origins.ts)
    CORS_ORIGINS: stringList,
    ADMIN_USERNAME: optionalString,
    ADMIN_PASSWORD: optionalString,
    DISCORD_CLIENT_SECRET: optionalString,
    DISCORD_REDIRECT_URI: optionalString,
    ADMIN_DISCORD_IDS: stringList,
    AUDIT_LOG_RETENTION_DAYS: positiveInt(180),
    ACTIVITY_LOG_RETENTION_DAYS: positiveInt(90),

    // รหัสผ่านรับยศของเซิร์ฟเวอร์หลัก — ไม่ตั้ง = ปิดการรับยศด้วยรหัสผ่าน (/verify รุ่น DST, /addroles บัตร VIP)
    VERIFY_PASSWORD: optionalString,
    VIP_ROLE_PASSWORD: optionalString,

    // บริการภายนอก
    GEMINI_KEY: optionalString,
    // โควตา Gemini ต่อวัน (เวลาไทย) รวมทุกเซิร์ฟเวอร์ / ต่อเซิร์ฟเวอร์อื่นที่ไม่ใช่เซิร์ฟเวอร์หลัก — นับทั้ง AI Chat และตัวกรองคำหยาบ
    AI_DAILY_LIMIT: positiveInt(250),
    AI_GUILD_DAILY_LIMIT: positiveInt(50),
    OPENWEATHER_KEY: optionalString,
    // secret ของ webhook เดิม /webhook/github (เซิร์ฟเวอร์หลัก) — เซิร์ฟเวอร์อื่นสร้าง secret ของตัวเองที่หน้า PR Bot
    GITHUB_WEBHOOK_SECRET: optionalString,

    // ที่เก็บไฟล์ log (ค่าเริ่มต้น: <repo>/logs เหมือนเดิม)
    LOG_DIR: optionalString,
    // เก็บไฟล์ log (แชท / ประวัติห้องเสียง / การขอยศพิเศษ) ย้อนหลังกี่วัน (ค่าเริ่มต้น 30)
    LOG_RETENTION_DAYS: positiveInt(30),
    // (ไม่บังคับ) ให้ backend เสิร์ฟหน้าเว็บที่ build แล้วเองด้วย เช่น apps/frontend/dist — ไม่ตั้ง = API อย่างเดียว
    FRONTEND_DIST: optionalString,
});

export type Env = z.output<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
    const result = envSchema.safeParse(raw);
    if (!result.success) {
        const messages = result.error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`);
        throw new Error(`ค่าใน .env ไม่ถูกต้อง:\n${messages.join('\n')}`);
    }
    const env = result.data;
    if (env.NODE_ENV === 'production') {
        if ((env.JWT_SECRET ?? env.SESSION_SECRET ?? '').length < 32) throw new Error('Production requires JWT_SECRET (at least 32 characters)');
        if (!env.DASHBOARD_URL) throw new Error('Production requires an HTTPS DASHBOARD_URL');
        // ต้องเป็น https ไม่มี user:password — CORS_ORIGINS ใช้ * แทน subdomain ได้ (เช่น preview ของ Cloudflare Workers) แต่ต้องระบุ https:// เสมอ
        const isHttps = (value: string, allowWildcard: boolean) => {
            const trimmed = value.trim();
            const authority = /^https:\/\/([^/?#]+)/i.exec(trimmed)?.[1];
            if (!authority || authority.includes('@')) return false;
            if (trimmed.includes('*')) return allowWildcard && /^https:\/\/(?:[a-z0-9*-]+\.)+[a-z0-9-]+(?::\d+)?\/?$/i.test(trimmed);
            return URL.canParse(trimmed);
        };
        for (const value of [env.DASHBOARD_URL, env.DISCORD_REDIRECT_URI].filter((v): v is string => !!v)) {
            if (!isHttps(value, false)) throw new Error(`Production ต้องใช้ https:// แบบระบุตรงตัว: ${value}`);
        }
        for (const value of env.CORS_ORIGINS) {
            if (!isHttps(value, true)) throw new Error(`CORS_ORIGINS ใน production ต้องขึ้นต้นด้วย https:// (ใช้ * แทน subdomain ได้): ${value}`);
        }
    }
    return env;
}
