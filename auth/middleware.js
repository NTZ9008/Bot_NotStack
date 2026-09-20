// ==========================================
// 🛡️ AUTH MIDDLEWARE
// authenticate  — อ่าน JWT จาก cookie แล้วใส่ req.user (ไม่ปฏิเสธ request เอง)
// requireAuthPage / requireApiAuth / requireAdmin — ด่านตรวจสิทธิ์ของแต่ละ route
// verifyOrigin  — กัน CSRF: request ที่แก้ข้อมูลต้องมาจากหน้าเว็บของเราเท่านั้น
// ==========================================
const jwt = require('jsonwebtoken');
const cfg = require('./config');
const { verifyAccessToken } = require('./tokens');
const { getCachedUser } = require('./users');
const { SAFE_METHODS } = require('./audit');

async function authenticate(req, res, next) {
    req.user = null;
    const token = req.cookies?.[cfg.COOKIE.access];
    if (!token) return next();
    try {
        const payload = verifyAccessToken(token);
        const user = await getCachedUser(Number(payload.sub));
        // tokenVersion ไม่ตรง = ผู้ใช้เปลี่ยนรหัส / ออกจากระบบทุกเครื่อง / ถูกปิดบัญชี หลังจาก token นี้ถูกออก
        if (user && user.isActive && user.tokenVersion === payload.tv) req.user = user;
    } catch (err) {
        // token หมดอายุ/ไม่ถูกต้อง = ถือว่ายังไม่ได้ login (หน้าเว็บจะเรียก /api/auth/refresh เอง)
        if (!(err instanceof jwt.JsonWebTokenError)) return next(err);
    }
    next();
}

const requireAuthPage = (req, res, next) => (req.user ? next() : res.redirect('/login'));

function requireApiAuth(req, res, next) {
    if (req.user) return next();
    res.status(401).json({ error: 'Unauthorized. Please login.', code: 'UNAUTHENTICATED' });
}

function requireAdmin(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized. Please login.', code: 'UNAUTHENTICATED' });
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'ต้องเป็นผู้ดูแลระบบ (ADMIN) เท่านั้น', code: 'FORBIDDEN' });
    next();
}

function originHost(req) {
    const value = req.get('origin') || req.get('referer');
    if (!value || value === 'null') return null;
    try {
        return new URL(value).host;
    } catch {
        return null;
    }
}

// เบราว์เซอร์ส่ง Origin มากับ fetch ที่ไม่ใช่ GET เสมอ และเว็บอื่นปลอมค่านี้ไม่ได้
// เทียบแค่ host (ไม่เทียบ http/https) เพราะหลัง Nginx ฝั่ง Node อาจเห็นเป็น http
function verifyOrigin(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();
    const host = originHost(req);
    if (host && (host === req.get('host') || host === cfg.dashboardHost)) return next();
    res.status(403).json({ error: 'คำขอไม่ได้มาจากหน้า Dashboard (ป้องกัน CSRF)', code: 'BAD_ORIGIN' });
}

module.exports = { authenticate, requireAuthPage, requireApiAuth, requireAdmin, verifyOrigin };
