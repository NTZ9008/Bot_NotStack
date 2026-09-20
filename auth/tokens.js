// ==========================================
// 🎟️ TOKENS — JWT access token + refresh token แบบหมุนเวียน (rotation)
// - access token: JWT (HS256) อายุ 15 นาที อยู่ใน httpOnly cookie ไม่มี JS ตัวไหนอ่านได้
// - refresh token: ค่าสุ่ม 256 บิต เก็บใน DB แค่ SHA-256 — ใช้แล้วออกใบใหม่ทุกครั้ง
//   ถ้าใบเก่าที่ถูกแทนไปแล้วถูกนำกลับมาใช้ = โดนขโมย → ยกเลิกทั้ง family ทันที
// ==========================================
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { prisma } = require('../prisma/client');
const cfg = require('./config');

const JWT_VERIFY_OPTIONS = { algorithms: ['HS256'], issuer: cfg.JWT_ISSUER, audience: cfg.JWT_AUDIENCE };

const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
const newRawToken = () => crypto.randomBytes(32).toString('base64url');
const truncate = (value, max) => (typeof value === 'string' ? value.slice(0, max) : null);

// tv (token version) ต้องตรงกับใน DB — เพิ่มค่าเมื่อไหร่ access token เก่าทุกใบของผู้ใช้นั้นใช้ไม่ได้ทันที
function signAccessToken(user) {
    return jwt.sign({ role: user.role, tv: user.tokenVersion }, cfg.jwtSecret, {
        algorithm: 'HS256',
        expiresIn: cfg.ACCESS_TOKEN_TTL_SEC,
        issuer: cfg.JWT_ISSUER,
        audience: cfg.JWT_AUDIENCE,
        subject: String(user.id),
        jwtid: crypto.randomUUID(),
    });
}

// โยน error ถ้า token ปลอม/หมดอายุ (jwt.JsonWebTokenError)
const verifyAccessToken = (token) => jwt.verify(token, cfg.jwtSecret, JWT_VERIFY_OPTIONS);

async function issueRefreshToken(userId, { familyId, ip, userAgent } = {}) {
    const raw = newRawToken();
    await prisma.refreshToken.create({
        data: {
            userId,
            tokenHash: hashToken(raw),
            familyId: familyId || crypto.randomUUID(),
            expiresAt: new Date(Date.now() + cfg.REFRESH_TOKEN_TTL_MS),
            ip: truncate(ip, 64),
            userAgent: truncate(userAgent, 255),
        },
    });
    return raw;
}

/**
 * แลก refresh token ใบเดิมเป็นใบใหม่
 * @returns {Promise<{status: 'ok', user, raw: string} | {status: 'rotated'} | {status: 'reused', user} | {status: 'invalid'}>}
 */
async function rotateRefreshToken(raw, { ip, userAgent } = {}) {
    const record = await prisma.refreshToken.findUnique({
        where: { tokenHash: hashToken(raw) },
        include: { user: true },
    });
    if (!record) return { status: 'invalid' };

    const now = Date.now();
    if (record.revokedAt) {
        // ใบที่ถูก logout ไปแล้ว (ไม่มีใบใหม่มาแทน) — แค่หมดอายุ ไม่ใช่การขโมย
        if (!record.replacedById) return { status: 'invalid' };
        // เพิ่งถูกแทนไม่กี่วินาที (เช่นเปิดหลายแท็บแล้ว refresh พร้อมกัน) — ให้ฝั่งเว็บใช้ cookie ใบใหม่ที่อีกแท็บได้ไป
        if (now - record.revokedAt.getTime() < cfg.REFRESH_REUSE_GRACE_MS) return { status: 'rotated' };
        await revokeFamily(record.familyId);
        return { status: 'reused', user: record.user };
    }
    if (record.expiresAt.getTime() <= now || !record.user.isActive) return { status: 'invalid' };

    const nextRaw = newRawToken();
    const nextId = crypto.randomUUID();
    const rotated = await prisma.$transaction(async (tx) => {
        // มีเงื่อนไข revokedAt: null → ถ้า 2 request หมุนใบเดียวกันพร้อมกัน จะมีแค่ request เดียวที่สำเร็จ
        const { count } = await tx.refreshToken.updateMany({
            where: { id: record.id, revokedAt: null },
            data: { revokedAt: new Date(now), replacedById: nextId },
        });
        if (count === 0) return false;
        await tx.refreshToken.create({
            data: {
                id: nextId,
                userId: record.userId,
                tokenHash: hashToken(nextRaw),
                familyId: record.familyId,
                expiresAt: new Date(now + cfg.REFRESH_TOKEN_TTL_MS),
                ip: truncate(ip, 64),
                userAgent: truncate(userAgent, 255),
            },
        });
        return true;
    });
    if (!rotated) return { status: 'rotated' };
    return { status: 'ok', user: record.user, raw: nextRaw };
}

const revokeRefreshToken = (raw) =>
    prisma.refreshToken.updateMany({
        where: { tokenHash: hashToken(raw), revokedAt: null },
        data: { revokedAt: new Date() },
    });

const revokeFamily = (familyId) =>
    prisma.refreshToken.updateMany({
        where: { familyId, revokedAt: null },
        data: { revokedAt: new Date() },
    });

const revokeAllForUser = (userId) =>
    prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
    });

// ใบที่หมดอายุแล้วเก็บไว้ก็ไม่มีประโยชน์ (ตรวจการใช้ซ้ำได้แค่ช่วงที่ยังไม่หมดอายุ)
const deleteExpiredRefreshTokens = () =>
    prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });

// --- Cookies ---
const cookieBase = { httpOnly: true, secure: cfg.isProduction };
// Lax: ส่งไปกับการเปิดลิงก์ Dashboard จากที่อื่น (เช่นกดจาก Discord / redirect กลับจาก OAuth) ได้ แต่ไม่ส่งกับ POST ข้ามเว็บ
const ACCESS_COOKIE = { ...cookieBase, sameSite: 'lax', path: '/' };
// Strict + จำกัด path: refresh token ถูกส่งเฉพาะตอนหน้าเว็บของเราเองเรียก /api/auth/* เท่านั้น
const REFRESH_COOKIE = { ...cookieBase, sameSite: 'strict', path: '/api/auth' };

function setAuthCookies(res, accessToken, refreshRaw) {
    res.cookie(cfg.COOKIE.access, accessToken, { ...ACCESS_COOKIE, maxAge: cfg.ACCESS_TOKEN_TTL_SEC * 1000 });
    res.cookie(cfg.COOKIE.refresh, refreshRaw, { ...REFRESH_COOKIE, maxAge: cfg.REFRESH_TOKEN_TTL_MS });
}

function clearAuthCookies(res) {
    res.clearCookie(cfg.COOKIE.access, ACCESS_COOKIE);
    res.clearCookie(cfg.COOKIE.refresh, REFRESH_COOKIE);
}

module.exports = {
    signAccessToken,
    verifyAccessToken,
    issueRefreshToken,
    rotateRefreshToken,
    revokeRefreshToken,
    revokeAllForUser,
    deleteExpiredRefreshTokens,
    setAuthCookies,
    clearAuthCookies,
    cookieBase,
};
