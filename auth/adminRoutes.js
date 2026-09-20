// ==========================================
// 👑 ADMIN API — /api/admin/* (ADMIN เท่านั้น — ตรวจสิทธิ์ตอน mount ใน server.js)
// จัดการผู้ใช้ Dashboard + ดู audit log
// กฎกันล็อกตัวเองออกจากระบบ: แอดมินลดสิทธิ์ / ปิดบัญชี / ลบบัญชี "ของตัวเอง" ไม่ได้
// (ผู้ที่เรียก API นี้เป็นแอดมินที่ active อยู่เสมอ → ระบบจะมีแอดมินเหลืออย่างน้อย 1 คนตลอด)
// ==========================================
const express = require('express');
const { prisma } = require('../prisma/client');
const tokens = require('./tokens');
const users = require('./users');
const { audit, queryAuditLogs, listAuditActions } = require('./audit');
const activity = require('../logmanager/activity');

const router = express.Router();
const ROLES = ['USER', 'ADMIN'];

// แปลงค่าจาก query string เป็นวันที่ (คืน undefined ถ้าไม่ถูกต้อง)
function parseDate(value) {
    const date = typeof value === 'string' && value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : undefined;
}

function parseId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

async function loadTarget(req, res) {
    const id = parseId(req.params.id);
    const user = id && (await users.findById(id));
    if (!user) res.status(404).json({ error: 'ไม่พบผู้ใช้นี้' });
    return user;
}

const isUniqueViolation = (err) => err?.code === 'P2002';

// ==========================================
// Users
// ==========================================
router.get('/users', async (req, res) => {
    const rows = await prisma.user.findMany({
        orderBy: { id: 'asc' },
        include: {
            _count: { select: { refreshTokens: { where: { revokedAt: null, expiresAt: { gt: new Date() } } } } },
        },
    });
    res.json(rows.map((row) => ({
        ...users.publicUser(row),
        failedLogins: row.failedLogins,
        activeSessions: row._count.refreshTokens,
        isSelf: row.id === req.user.id,
    })));
});

router.post('/users', async (req, res) => {
    const { username, password, role = 'USER', displayName } = req.body || {};
    const normalized = users.normalizeUsername(username);
    if (!users.isValidUsername(normalized)) {
        return res.status(400).json({ error: 'username ต้องเป็น a-z 0-9 _ . - ยาว 3-32 ตัวอักษร' });
    }
    const invalidPassword = users.validatePassword(password);
    if (invalidPassword) return res.status(400).json({ error: invalidPassword });
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'role ไม่ถูกต้อง' });

    try {
        const user = await users.createPasswordUser({
            username: normalized,
            password,
            role,
            displayName: typeof displayName === 'string' ? displayName.trim().slice(0, 64) : null,
        });
        await audit(req, { action: 'user.create', targetType: 'user', targetId: user.id, metadata: { username: user.username, role } });
        res.status(201).json(users.publicUser(user));
    } catch (err) {
        if (isUniqueViolation(err)) return res.status(409).json({ error: 'username นี้ถูกใช้แล้ว' });
        throw err;
    }
});

// แก้ไขได้ทีละหลายฟิลด์: role, isActive, displayName, username, password, unlock
router.patch('/users/:id', async (req, res) => {
    const target = await loadTarget(req, res);
    if (!target) return;
    const body = req.body || {};
    const isSelf = target.id === req.user.id;
    const data = {};
    const changes = {};
    let revokeSessions = false;

    if (body.role !== undefined && body.role !== target.role) {
        if (!ROLES.includes(body.role)) return res.status(400).json({ error: 'role ไม่ถูกต้อง' });
        if (isSelf) return res.status(400).json({ error: 'ไม่สามารถเปลี่ยน role ของตัวเองได้' });
        data.role = body.role;
        changes.role = { from: target.role, to: body.role };
    }

    if (body.isActive !== undefined && Boolean(body.isActive) !== target.isActive) {
        if (isSelf) return res.status(400).json({ error: 'ไม่สามารถปิดบัญชีของตัวเองได้' });
        data.isActive = Boolean(body.isActive);
        changes.isActive = { from: target.isActive, to: data.isActive };
        if (!data.isActive) revokeSessions = true;
    }

    if (typeof body.displayName === 'string') {
        const displayName = body.displayName.trim().slice(0, 64) || null;
        if (displayName !== target.displayName) {
            data.displayName = displayName;
            changes.displayName = { from: target.displayName, to: displayName };
        }
    }

    if (body.username !== undefined) {
        const username = users.normalizeUsername(body.username);
        if (!users.isValidUsername(username)) {
            return res.status(400).json({ error: 'username ต้องเป็น a-z 0-9 _ . - ยาว 3-32 ตัวอักษร' });
        }
        if (username !== target.username) {
            data.username = username;
            changes.username = { from: target.username, to: username };
        }
    }

    if (body.password !== undefined) {
        const invalid = users.validatePassword(body.password);
        if (invalid) return res.status(400).json({ error: invalid });
        // บัญชีที่มาจาก Discord ต้องมี username ด้วย ถึงจะ login ด้วยรหัสผ่านได้
        if (!target.username && !data.username) {
            return res.status(400).json({ error: 'บัญชีนี้ยังไม่มี username — กรุณากำหนด username พร้อมรหัสผ่าน' });
        }
        data.passwordHash = await users.hashPassword(body.password);
        data.failedLogins = 0;
        data.lockedUntil = null;
        changes.passwordReset = true;
        revokeSessions = true;
    }

    if (body.unlock === true && target.lockedUntil) {
        data.failedLogins = 0;
        data.lockedUntil = null;
        changes.unlocked = true;
    }

    if (Object.keys(changes).length === 0) return res.json(users.publicUser(target));

    if (revokeSessions) data.tokenVersion = { increment: 1 };
    let updated;
    try {
        updated = await users.updateUser(target.id, data);
    } catch (err) {
        if (isUniqueViolation(err)) return res.status(409).json({ error: 'username นี้ถูกใช้แล้ว' });
        throw err;
    }
    if (revokeSessions) await tokens.revokeAllForUser(target.id);

    await audit(req, { action: 'user.update', targetType: 'user', targetId: target.id, metadata: { target: users.nameOf(target), changes } });
    res.json(users.publicUser(updated));
});

// บังคับออกจากระบบทุกอุปกรณ์ของผู้ใช้คนนี้
router.post('/users/:id/revoke-sessions', async (req, res) => {
    const target = await loadTarget(req, res);
    if (!target) return;
    await users.bumpTokenVersion(target.id);
    const { count } = await tokens.revokeAllForUser(target.id);
    await audit(req, { action: 'user.sessions_revoke', targetType: 'user', targetId: target.id, metadata: { target: users.nameOf(target), revoked: count } });
    res.json({ success: true, revoked: count });
});

router.delete('/users/:id', async (req, res) => {
    const target = await loadTarget(req, res);
    if (!target) return;
    if (target.id === req.user.id) return res.status(400).json({ error: 'ไม่สามารถลบบัญชีของตัวเองได้' });

    await users.deleteUser(target.id);
    await audit(req, {
        action: 'user.delete', targetType: 'user', targetId: target.id,
        metadata: { username: target.username, discordId: target.discordId, discordUsername: target.discordUsername, role: target.role },
    });
    res.json({ success: true });
});

// ==========================================
// Audit logs
// ==========================================
router.get('/audit-logs', async (req, res) => {
    const { action, q, success } = req.query;
    const toDate = parseDate;
    const result = await queryAuditLogs({
        action: typeof action === 'string' ? action : undefined,
        actorId: parseId(req.query.actorId) || undefined,
        q: typeof q === 'string' ? q.trim().slice(0, 100) : undefined,
        success: success === 'true' ? true : success === 'false' ? false : undefined,
        from: toDate(req.query.from),
        to: toDate(req.query.to),
        cursor: parseId(req.query.cursor) || undefined,
        limit: Math.min(parseId(req.query.limit) || 50, 200),
    });
    res.json(result);
});

router.get('/audit-logs/actions', async (req, res) => {
    res.json(await listAuditActions());
});

// ==========================================
// Activity — เหตุการณ์ทุกอย่างในเซิร์ฟเวอร์ Discord (กราฟหน้า Overview + ตาราง Activity Log)
// ==========================================
const DEFAULT_RANGE_DAYS = 7;
const MAX_RANGE_DAYS = 365;

// ช่วงเวลาที่จะดู — ไม่ระบุ = 7 วันล่าสุด, ระบุเกิน 1 ปีจะถูกตัดให้เหลือ 1 ปี
function parseRange(query) {
    const now = new Date();
    const to = parseDate(query.to) || now;
    const from = parseDate(query.from) || new Date(to.getTime() - DEFAULT_RANGE_DAYS * 86400000);
    const capped = new Date(Math.max(from.getTime(), to.getTime() - MAX_RANGE_DAYS * 86400000));
    const spanHours = (to.getTime() - capped.getTime()) / 3600000;
    // ไม่ได้เลือก interval เอง → ช่วงสั้น (ไม่เกิน 3 วัน) ดูรายชั่วโมง ที่เหลือดูรายวัน
    const interval = query.interval === 'hour' || query.interval === 'day'
        ? query.interval
        : (spanHours <= 72 ? 'hour' : 'day');
    return { from: capped, to, interval, includeBots: query.includeBots === 'true' };
}

router.get('/activity/stats', async (req, res) => {
    const range = parseRange(req.query);
    res.json(await activity.activityStats({
        ...range,
        timeZone: typeof req.query.tz === 'string' ? req.query.tz : 'Asia/Bangkok',
        limit: Math.min(parseId(req.query.limit) || 10, 50),
    }));
});

router.get('/activity', async (req, res) => {
    const range = parseRange(req.query);
    const { eventKey, userId, channelId, q } = req.query;
    const result = await activity.queryActivity({
        from: range.from,
        to: range.to,
        includeBots: range.includeBots,
        // eventKey รับได้หลายค่า คั่นด้วย , (เช่น voiceJoin,voiceLeave)
        eventKeys: typeof eventKey === 'string' && eventKey
            ? eventKey.split(',').map((key) => key.trim()).filter(Boolean).slice(0, 50)
            : undefined,
        userId: typeof userId === 'string' && /^\d{5,25}$/.test(userId) ? userId : undefined,
        channelId: typeof channelId === 'string' && /^\d{5,25}$/.test(channelId) ? channelId : undefined,
        q: typeof q === 'string' ? q.trim().slice(0, 100) || undefined : undefined,
        cursor: parseId(req.query.cursor) || undefined,
        limit: Math.min(parseId(req.query.limit) || 50, 200),
    });
    res.json(result);
});

// ข้อมูลประกอบหน้าเว็บ: ชนิดเหตุการณ์ทั้งหมด + เก็บข้อมูลมาตั้งแต่เมื่อไหร่
router.get('/activity/meta', async (req, res) => {
    res.json(await activity.activityMeta());
});

module.exports = router;
