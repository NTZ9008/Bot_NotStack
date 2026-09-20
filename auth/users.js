// ==========================================
// 👤 USERS — บัญชีผู้ใช้ Dashboard (username/password และ Discord OAuth)
// ทุกการแก้ไขข้อมูลผู้ใช้ต้องผ่านไฟล์นี้ เพื่อล้าง cache ที่ middleware ใช้ตรวจสิทธิ์ทุก request
// ==========================================
const bcrypt = require('bcryptjs');
const { prisma } = require('../prisma/client');
const cfg = require('./config');

// hash ของรหัสสุ่มที่ไม่มีใครรู้ — ใช้ compare ตอนหา username ไม่เจอ ให้เวลาตอบกลับเท่ากับกรณีรหัสผิด
// (กันการเดาว่ามี username นี้อยู่ในระบบหรือไม่จากเวลาที่ใช้)
const DUMMY_HASH = '$2b$12$uEIq99m7fXJsMb7av/MB6eIiDrF1KhOZhToA.hJtllxofZrcdnzH.';
const BCRYPT_HASH_RE = /^\$2[aby]\$\d{2}\$.{53}$/;
const USERNAME_RE = /^[a-z0-9_.-]{3,32}$/;

const normalizeUsername = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');
const isValidUsername = (value) => USERNAME_RE.test(value);

// bcrypt ใช้แค่ 72 byte แรก — ยาวกว่านั้นจะถูกตัดทิ้งเงียบๆ จึงไม่ยอมรับตั้งแต่แรก
function validatePassword(password) {
    if (typeof password !== 'string' || password.length < 8) return 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร';
    if (Buffer.byteLength(password, 'utf8') > 72) return 'รหัสผ่านยาวเกินไป (สูงสุด 72 byte)';
    return null;
}

const hashPassword = (password) => bcrypt.hash(password, cfg.BCRYPT_ROUNDS);

// ชื่อที่ใช้แสดงผล / บันทึกใน audit log
const nameOf = (user) => user.displayName || user.username || user.discordUsername || `user#${user.id}`;

// ข้อมูลที่ส่งออกไปหน้าเว็บได้ (ไม่มี passwordHash / tokenVersion)
function publicUser(user) {
    return {
        id: user.id,
        username: user.username,
        displayName: nameOf(user),
        avatarUrl: user.avatarUrl,
        role: user.role,
        isActive: user.isActive,
        discordId: user.discordId,
        discordUsername: user.discordUsername,
        hasPassword: Boolean(user.passwordHash),
        lockedUntil: user.lockedUntil && user.lockedUntil > new Date() ? user.lockedUntil : null,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
    };
}

// --- Cache สำหรับ middleware (ทุก request ต้องเช็ค role / isActive / tokenVersion ล่าสุด) ---
const CACHE_TTL_MS = 30 * 1000;
const cache = new Map();

async function getCachedUser(id) {
    const hit = cache.get(id);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.user;
    const user = await prisma.user.findUnique({ where: { id } });
    if (user) cache.set(id, { user, at: Date.now() });
    else cache.delete(id);
    return user;
}

async function updateUser(id, data) {
    const user = await prisma.user.update({ where: { id }, data });
    cache.delete(id);
    return user;
}

async function deleteUser(id) {
    const user = await prisma.user.delete({ where: { id } });
    cache.delete(id);
    return user;
}

// ทำให้ access token ทุกใบของผู้ใช้นี้ใช้ไม่ได้ทันที
const bumpTokenVersion = (id) => updateUser(id, { tokenVersion: { increment: 1 } });

const findById = (id) => prisma.user.findUnique({ where: { id } });
const findByDiscordId = (discordId) => prisma.user.findUnique({ where: { discordId } });

/**
 * ตรวจ username/password
 * @returns {Promise<{ok: true, user} | {ok: false, reason: 'invalid'|'locked'|'disabled', user?, lockedUntil?, justLocked?}>}
 */
async function verifyPasswordLogin(rawUsername, password) {
    const username = normalizeUsername(rawUsername);
    const user = isValidUsername(username) ? await prisma.user.findUnique({ where: { username } }) : null;

    if (!user || !user.passwordHash) {
        await bcrypt.compare(password, DUMMY_HASH);
        return { ok: false, reason: 'invalid' };
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
        return { ok: false, reason: 'locked', user, lockedUntil: user.lockedUntil };
    }

    if (!(await bcrypt.compare(password, user.passwordHash))) {
        const updated = await updateUser(user.id, { failedLogins: { increment: 1 } });
        if (updated.failedLogins >= cfg.MAX_FAILED_LOGINS) {
            const lockedUntil = new Date(Date.now() + cfg.LOCK_DURATION_MS);
            await updateUser(user.id, { failedLogins: 0, lockedUntil });
            return { ok: false, reason: 'locked', user, lockedUntil, justLocked: true };
        }
        return { ok: false, reason: 'invalid', user };
    }

    // บอกว่าบัญชีถูกปิดเฉพาะคนที่ใส่รหัสถูกเท่านั้น
    if (!user.isActive) return { ok: false, reason: 'disabled', user };

    return { ok: true, user: await recordLogin(user.id) };
}

const recordLogin = (id) => updateUser(id, { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() });

async function createPasswordUser({ username, password, role = 'USER', displayName }) {
    const user = await prisma.user.create({
        data: {
            username: normalizeUsername(username),
            passwordHash: await hashPassword(password),
            role,
            displayName: displayName || null,
        },
    });
    return user;
}

// --- Discord ---
function discordProfileFields(profile) {
    return {
        discordUsername: profile.username,
        avatarUrl: profile.avatarUrl,
    };
}

async function createDiscordUser(profile) {
    try {
        return await prisma.user.create({
            data: {
                discordId: profile.id,
                ...discordProfileFields(profile),
                displayName: profile.globalName || profile.username,
                role: cfg.discord.adminIds.has(profile.id) ? 'ADMIN' : 'USER',
            },
        });
    } catch (err) {
        // login พร้อมกัน 2 แท็บ → อีกแท็บสร้างไปก่อนแล้ว
        if (err.code === 'P2002') return findByDiscordId(profile.id);
        throw err;
    }
}

const syncDiscordProfile = (id, profile) => updateUser(id, discordProfileFields(profile));

const linkDiscord = (id, profile) => updateUser(id, { discordId: profile.id, ...discordProfileFields(profile) });

const unlinkDiscord = (id) => updateUser(id, { discordId: null, discordUsername: null, avatarUrl: null });

// ==========================================
// Bootstrap: ถ้ายังไม่มี ADMIN ในระบบเลย ให้สร้างจาก ADMIN_USERNAME / ADMIN_PASSWORD ใน .env
// (ADMIN_PASSWORD เป็น bcrypt hash แบบเดิมได้เลย) — ทำแค่ครั้งแรก หลังจากนั้นจัดการผู้ใช้ผ่านหน้า Users
// ==========================================
async function seedAdminFromEnv() {
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
    if (adminCount > 0) return;

    const username = normalizeUsername(process.env.ADMIN_USERNAME);
    const secret = process.env.ADMIN_PASSWORD;
    if (!username || !secret) {
        console.warn('⚠️ [Auth] ยังไม่มีผู้ดูแลระบบ — ตั้ง ADMIN_USERNAME / ADMIN_PASSWORD ใน .env หรือ ADMIN_DISCORD_IDS แล้วรีสตาร์ท');
        return;
    }
    if (!isValidUsername(username)) {
        console.warn('⚠️ [Auth] ADMIN_USERNAME ต้องเป็น a-z 0-9 _ . - ยาว 3-32 ตัว — ข้ามการสร้างผู้ดูแลระบบ');
        return;
    }
    if (await prisma.user.findUnique({ where: { username } })) {
        console.warn(`⚠️ [Auth] มีผู้ใช้ชื่อ ${username} อยู่แล้วแต่ไม่ใช่ ADMIN — ข้ามการสร้างผู้ดูแลระบบ`);
        return;
    }

    let passwordHash = secret;
    if (!BCRYPT_HASH_RE.test(secret)) {
        console.warn('⚠️ [Auth] ADMIN_PASSWORD ไม่ใช่ bcrypt hash — ระบบ hash ให้แล้ว แนะนำให้ลบรหัสผ่านตัวจริงออกจาก .env');
        passwordHash = await hashPassword(secret);
    }
    await prisma.user.create({ data: { username, passwordHash, role: 'ADMIN', displayName: username } });
    console.log(`✅ [Auth] สร้างผู้ดูแลระบบ "${username}" จาก .env แล้ว`);
}

module.exports = {
    normalizeUsername,
    isValidUsername,
    validatePassword,
    hashPassword,
    nameOf,
    publicUser,
    getCachedUser,
    updateUser,
    deleteUser,
    bumpTokenVersion,
    findById,
    findByDiscordId,
    verifyPasswordLogin,
    recordLogin,
    createPasswordUser,
    createDiscordUser,
    syncDiscordProfile,
    linkDiscord,
    unlinkDiscord,
    seedAdminFromEnv,
};
