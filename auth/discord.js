// ==========================================
// 🎮 DISCORD OAUTH2 (Authorization Code Grant)
// ขอแค่ scope "identify" (id / ชื่อ / avatar) — ไม่เก็บ access token ของ Discord ไว้ที่ไหนเลย
// ==========================================
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const cfg = require('./config');

const DISCORD_API = 'https://discord.com/api/v10';
const AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const REQUEST_TIMEOUT_MS = 10 * 1000;

// state สุ่มใหม่ทุกครั้ง: เก็บคู่กับโหมด (login / link) ใน cookie ที่เซ็นด้วย JWT_SECRET
// ตอน callback ต้องตรงกับ ?state= ที่ Discord ส่งกลับมา — กันคนอื่นหลอกให้เรา login เป็นบัญชีของเขา
function createState({ mode, userId }) {
    const state = crypto.randomBytes(24).toString('base64url');
    const cookie = jwt.sign({ s: state, m: mode, uid: userId ?? null }, cfg.jwtSecret, {
        algorithm: 'HS256',
        expiresIn: cfg.OAUTH_STATE_TTL_SEC,
        issuer: cfg.JWT_ISSUER,
        audience: cfg.OAUTH_STATE_AUDIENCE,
    });
    return { state, cookie };
}

// state ที่ใช้ไปแล้ว → เวลาหมดอายุ (ms) — ใช้ซ้ำไม่ได้แม้ cookie ยังไม่หมดอายุ
const usedStates = new Map();

function markStateUsed(state, expiresAtMs) {
    const now = Date.now();
    for (const [key, exp] of usedStates) if (exp <= now) usedStates.delete(key);
    if (usedStates.has(state)) return false;
    usedStates.set(state, expiresAtMs);
    return true;
}

// คืน { mode, userId } หรือ null ถ้า cookie หาย/หมดอายุ/state ไม่ตรง/เคยใช้แล้ว
function verifyState(cookie, state) {
    if (!cookie || typeof state !== 'string') return null;
    let payload;
    try {
        payload = jwt.verify(cookie, cfg.jwtSecret, {
            algorithms: ['HS256'],
            issuer: cfg.JWT_ISSUER,
            audience: cfg.OAUTH_STATE_AUDIENCE,
        });
    } catch {
        return null;
    }
    const expected = Buffer.from(String(payload.s));
    const actual = Buffer.from(state);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
    if (!markStateUsed(payload.s, payload.exp * 1000)) return null;
    return { mode: payload.m, userId: payload.uid };
}

function buildAuthorizeUrl(state) {
    const params = new URLSearchParams({
        client_id: cfg.discord.clientId,
        redirect_uri: cfg.discord.redirectUri,
        response_type: 'code',
        scope: 'identify',
        state,
        prompt: 'none', // เคยอนุญาตแล้วไม่ต้องกดยืนยันซ้ำ
    });
    return `${AUTHORIZE_URL}?${params}`;
}

async function discordRequest(url, init) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Discord ${res.status}: ${detail.slice(0, 200)}`);
    }
    return res.json();
}

function avatarUrlOf(user) {
    if (user.avatar) {
        const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
        return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=128`;
    }
    // ระบบชื่อใหม่ของ Discord (ไม่มี discriminator) ใช้ (id >> 22) % 6 เลือก avatar เริ่มต้น
    return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(user.id) >> 22n) % 6n)}.png`;
}

// แลก code เป็นข้อมูลผู้ใช้ Discord
async function fetchDiscordProfile(code) {
    const token = await discordRequest(`${DISCORD_API}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: cfg.discord.clientId,
            client_secret: cfg.discord.clientSecret,
            grant_type: 'authorization_code',
            code,
            redirect_uri: cfg.discord.redirectUri,
        }),
    });
    const user = await discordRequest(`${DISCORD_API}/users/@me`, {
        headers: { Authorization: `Bearer ${token.access_token}` },
    });
    return {
        id: user.id,
        username: user.username,
        globalName: user.global_name || null,
        avatarUrl: avatarUrlOf(user),
    };
}

module.exports = { createState, verifyState, buildAuthorizeUrl, fetchDiscordProfile };
