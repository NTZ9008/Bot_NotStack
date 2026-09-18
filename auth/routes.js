// ==========================================
// 🔑 AUTH API — /api/auth/*
// login ด้วย username/password หรือ Discord OAuth → ได้ access token (JWT) + refresh token เป็น httpOnly cookie
// ==========================================
const express = require('express');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const cfg = require('./config');
const tokens = require('./tokens');
const users = require('./users');
const discord = require('./discord');
const { audit } = require('./audit');
const { requireApiAuth } = require('./middleware');

const router = express.Router();

// นับเฉพาะครั้งที่ login ไม่สำเร็จ (คนใส่รหัสถูกไม่โดนจำกัด) — ทำงานคู่กับการล็อกบัญชีใน users.js
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'คุณพยายามเข้าสู่ระบบผิดพลาดบ่อยเกินไป กรุณารอสักครู่' },
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'เรียกใช้งานบ่อยเกินไป กรุณารอสักครู่' },
});

const OAUTH_STATE_COOKIE = { ...tokens.cookieBase, sameSite: 'lax', path: '/api/auth/discord' };

const requestContext = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

// ออก access + refresh token ชุดใหม่ (family ใหม่ = อุปกรณ์/การ login ใหม่)
async function startSession(req, res, user) {
    const refreshRaw = await tokens.issueRefreshToken(user.id, requestContext(req));
    tokens.setAuthCookies(res, tokens.signAccessToken(user), refreshRaw);
}

// เก็บ username ที่พิมพ์ผิดไว้ใน audit log เฉพาะที่หน้าตาเป็น username จริง (กันเผลอเก็บรหัสผ่านที่พิมพ์ผิดช่อง)
function attemptedUsername(value) {
    const username = users.normalizeUsername(value);
    return users.isValidUsername(username) ? username : '(invalid)';
}

// --- ช่องทาง login ที่เปิดใช้ (หน้า login ใช้ตัดสินใจว่าจะแสดงปุ่ม Discord หรือไม่) ---
router.get('/providers', (req, res) => {
    res.json({ password: true, discord: cfg.discord.enabled });
});

// --- Username / Password ---
router.post('/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
        return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
    }

    const result = await users.verifyPasswordLogin(username, password);
    if (!result.ok) {
        await audit(req, {
            action: 'auth.login_failed',
            actor: result.user || null,
            success: false,
            metadata: { method: 'password', reason: result.reason, username: attemptedUsername(username) },
        });
        if (result.justLocked) {
            await audit(req, { action: 'auth.account_locked', actor: result.user, success: false, metadata: { until: result.lockedUntil } });
        }
        if (result.reason === 'locked') {
            return res.status(423).json({ error: 'บัญชีถูกล็อกชั่วคราวเพราะใส่รหัสผ่านผิดหลายครั้ง', lockedUntil: result.lockedUntil });
        }
        if (result.reason === 'disabled') {
            return res.status(403).json({ error: 'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ' });
        }
        return res.status(401).json({ error: 'รหัสผ่านหรือชื่อผู้ใช้ไม่ถูกต้อง' });
    }

    await startSession(req, res, result.user);
    await audit(req, { action: 'auth.login', actor: result.user, metadata: { method: 'password' } });
    res.json({ success: true, user: users.publicUser(result.user) });
});

// --- ต่ออายุ session (หน้าเว็บเรียกเองเมื่อ API ตอบ 401) ---
router.post('/refresh', authLimiter, async (req, res) => {
    const raw = req.cookies?.[cfg.COOKIE.refresh];
    if (!raw) return res.status(401).json({ error: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่', code: 'NO_SESSION' });

    const result = await tokens.rotateRefreshToken(raw, requestContext(req));
    switch (result.status) {
        case 'ok':
            tokens.setAuthCookies(res, tokens.signAccessToken(result.user), result.raw);
            return res.json({ success: true, user: users.publicUser(result.user) });
        case 'rotated':
            // อีกแท็บเพิ่ง refresh ไป — ไม่ล้าง cookie เพราะเบราว์เซอร์อาจได้ cookie ใบใหม่มาแล้ว
            return res.status(401).json({ error: 'Session ถูกต่ออายุจากแท็บอื่นแล้ว', code: 'TOKEN_ROTATED' });
        case 'reused':
            // refresh token ที่ถูกแทนไปนานแล้วโผล่มาใช้อีก = มีคนขโมย cookie → เตะออกทุกเครื่อง
            await users.bumpTokenVersion(result.user.id);
            await tokens.revokeAllForUser(result.user.id);
            await audit(req, { action: 'auth.refresh_reuse_detected', actor: result.user, success: false });
            tokens.clearAuthCookies(res);
            return res.status(401).json({ error: 'ตรวจพบการใช้ session ซ้ำ กรุณาเข้าสู่ระบบใหม่', code: 'SESSION_REVOKED' });
        default:
            tokens.clearAuthCookies(res);
            return res.status(401).json({ error: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่', code: 'NO_SESSION' });
    }
});

router.post('/logout', async (req, res) => {
    const raw = req.cookies?.[cfg.COOKIE.refresh];
    if (raw) await tokens.revokeRefreshToken(raw);
    if (req.user) await audit(req, { action: 'auth.logout' });
    tokens.clearAuthCookies(res);
    res.json({ success: true });
});

// ออกจากระบบทุกอุปกรณ์ (รวมเครื่องนี้)
router.post('/logout-all', requireApiAuth, async (req, res) => {
    await users.bumpTokenVersion(req.user.id);
    await tokens.revokeAllForUser(req.user.id);
    await audit(req, { action: 'auth.logout_all' });
    tokens.clearAuthCookies(res);
    res.json({ success: true });
});

router.get('/me', requireApiAuth, (req, res) => {
    res.json({ user: users.publicUser(req.user), discordEnabled: cfg.discord.enabled });
});

// เปลี่ยนรหัสผ่านตัวเอง — อุปกรณ์อื่นที่ login ค้างไว้จะถูกออกจากระบบ ส่วนเครื่องนี้ได้ session ใหม่
router.post('/password', requireApiAuth, loginLimiter, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    const user = req.user;
    if (!user.passwordHash) {
        return res.status(400).json({ error: 'บัญชีนี้ไม่มีรหัสผ่าน (เข้าสู่ระบบด้วย Discord) — ให้ผู้ดูแลระบบตั้งให้' });
    }
    if (typeof currentPassword !== 'string' || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
        await audit(req, { action: 'auth.password_change', success: false, metadata: { reason: 'wrong_current_password' } });
        return res.status(400).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
    }
    const invalid = users.validatePassword(newPassword);
    if (invalid) return res.status(400).json({ error: invalid });

    const updated = await users.updateUser(user.id, {
        passwordHash: await users.hashPassword(newPassword),
        tokenVersion: { increment: 1 },
    });
    await tokens.revokeAllForUser(user.id);
    await startSession(req, res, updated);
    await audit(req, { action: 'auth.password_change', actor: updated });
    res.json({ success: true });
});

// ==========================================
// Discord OAuth2
// /discord       → login (สมัครให้อัตโนมัติถ้ายังไม่มีบัญชี ได้ role USER)
// /discord/link  → ผูก Discord เข้ากับบัญชีที่ login อยู่ (เพื่อให้ login ได้ทั้งสองทาง)
// ==========================================
function startDiscordFlow(res, { mode, userId }) {
    const { state, cookie } = discord.createState({ mode, userId });
    res.cookie(cfg.COOKIE.oauthState, cookie, { ...OAUTH_STATE_COOKIE, maxAge: cfg.OAUTH_STATE_TTL_SEC * 1000 });
    res.redirect(discord.buildAuthorizeUrl(state));
}

router.get('/discord', authLimiter, (req, res) => {
    if (!cfg.discord.enabled) return res.redirect('/login?error=discord_disabled');
    startDiscordFlow(res, { mode: 'login' });
});

router.get('/discord/link', authLimiter, (req, res) => {
    if (!req.user) return res.redirect('/login');
    if (!cfg.discord.enabled) return res.redirect('/?discord_error=discord_disabled');
    startDiscordFlow(res, { mode: 'link', userId: req.user.id });
});

router.get('/discord/callback', authLimiter, async (req, res) => {
    const flow = discord.verifyState(req.cookies?.[cfg.COOKIE.oauthState], req.query.state);
    res.clearCookie(cfg.COOKIE.oauthState, OAUTH_STATE_COOKIE);

    const isLink = flow?.mode === 'link';
    const fail = (code) => res.redirect(isLink ? `/?discord_error=${code}` : `/login?error=${code}`);

    if (!flow) return fail('discord_state');
    if (req.query.error) return fail('discord_denied'); // ผู้ใช้กดยกเลิกที่หน้า Discord
    if (typeof req.query.code !== 'string') return fail('discord_failed');

    let profile;
    try {
        profile = await discord.fetchDiscordProfile(req.query.code);
    } catch (err) {
        console.error('[Auth] Discord OAuth ล้มเหลว:', err.message);
        return fail('discord_failed');
    }

    if (isLink) {
        const user = await users.findById(flow.userId);
        if (!user || !user.isActive) return fail('account_disabled');
        const owner = await users.findByDiscordId(profile.id);
        if (owner && owner.id !== user.id) {
            await audit(req, {
                action: 'auth.discord_link', actor: user, success: false,
                targetType: 'discord', targetId: profile.id, metadata: { reason: 'already_linked', discordUsername: profile.username },
            });
            return fail('discord_taken');
        }
        await users.linkDiscord(user.id, profile);
        await audit(req, {
            action: 'auth.discord_link', actor: user,
            targetType: 'discord', targetId: profile.id, metadata: { discordUsername: profile.username },
        });
        return res.redirect('/?discord=linked');
    }

    let user = await users.findByDiscordId(profile.id);
    if (user) {
        user = await users.syncDiscordProfile(user.id, profile);
    } else {
        user = await users.createDiscordUser(profile);
        await audit(req, {
            action: 'auth.discord_register', actor: user,
            targetType: 'user', targetId: user.id, metadata: { discordId: profile.id, discordUsername: profile.username, role: user.role },
        });
    }

    if (!user.isActive) {
        await audit(req, { action: 'auth.login_failed', actor: user, success: false, metadata: { method: 'discord', reason: 'disabled' } });
        return fail('account_disabled');
    }

    user = await users.recordLogin(user.id);
    await startSession(req, res, user);
    await audit(req, { action: 'auth.login', actor: user, metadata: { method: 'discord' } });
    res.redirect('/');
});

// ยกเลิกการผูก Discord — ต้องมีรหัสผ่านอยู่ ไม่อย่างนั้นจะไม่เหลือทาง login
router.post('/discord/unlink', requireApiAuth, async (req, res) => {
    const user = req.user;
    if (!user.discordId) return res.status(400).json({ error: 'บัญชีนี้ยังไม่ได้เชื่อมต่อ Discord' });
    if (!user.username || !user.passwordHash) {
        return res.status(400).json({ error: 'ต้องมี username/รหัสผ่านก่อน จึงจะยกเลิกการเชื่อมต่อ Discord ได้' });
    }
    await users.unlinkDiscord(user.id);
    await audit(req, {
        action: 'auth.discord_unlink',
        targetType: 'discord', targetId: user.discordId, metadata: { discordUsername: user.discordUsername },
    });
    res.json({ success: true });
});

module.exports = router;
