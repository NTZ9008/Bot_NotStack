// ==========================================
// 📜 AUDIT LOG — บันทึกว่าใครทำอะไรใน Dashboard เมื่อไหร่ จากที่ไหน
// - ระบบ auth / จัดการผู้ใช้ เรียก audit() เองพร้อมรายละเอียด
// - API อื่นๆ ที่แก้ข้อมูล (POST/PUT/PATCH/DELETE) ถูกบันทึกอัตโนมัติด้วย auditApiMutations
// การบันทึกล้มเหลวจะไม่ทำให้ request หลักล้มตาม
// ==========================================
const { prisma } = require('../prisma/client');
const cfg = require('./config');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const SENSITIVE_KEY_RE = /pass|secret|token|authorization|cookie/i;

// ชื่อ action ของ API เดิมใน server.js / logmanager (path ที่ไม่อยู่ในนี้จะใช้ชื่อ api.<method> <path>)
const API_ACTIONS = {
    '/api/config': 'config.update',
    '/api/news': 'news.send',
    '/api/grant-access': 'room_access.change',
    '/api/whitelist/channel': 'voice_guard.whitelist_channel.update',
    '/api/whitelist/channel/delete': 'voice_guard.whitelist_channel.delete',
    '/api/whitelist/user': 'voice_guard.whitelist_user.add',
    '/api/whitelist/user/delete': 'voice_guard.whitelist_user.remove',
    '/api/blacklist/channel': 'voice_guard.blacklist_channel.update',
    '/api/blacklist/channel/delete': 'voice_guard.blacklist_channel.delete',
    '/api/blacklist/user': 'voice_guard.blacklist_user.add',
    '/api/blacklist/user/delete': 'voice_guard.blacklist_user.remove',
    '/api/log-settings': 'log_settings.update',
    '/api/log-settings/system': 'log_settings.system_toggle',
    '/api/log-settings/apply-all': 'log_settings.apply_all',
    '/api/log-settings/options': 'log_settings.options_update',
};

// ชื่อผู้กระทำ ณ ตอนนั้น (ยังอ่านได้แม้บัญชีถูกลบหรือเปลี่ยนชื่อภายหลัง)
function actorLabel(user) {
    if (user.username) return user.username;
    if (user.discordUsername) return `@${user.discordUsername}`;
    return `user#${user.id}`;
}

// ตัดข้อมูลลับ (รหัสผ่าน / token) และข้อความที่ยาวเกินไปออกก่อนบันทึก
function sanitize(value, depth = 0) {
    if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…` : value;
    if (value === null || typeof value !== 'object') return value;
    if (depth >= 4) return '[…]';
    if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item, depth + 1));
    const out = {};
    for (const [key, item] of Object.entries(value)) {
        out[key] = SENSITIVE_KEY_RE.test(key) ? '[REDACTED]' : sanitize(item, depth + 1);
    }
    return out;
}

/**
 * @param {import('express').Request|null} req
 * @param {{action: string, actor?: object|null, targetType?: string, targetId?: string|number, success?: boolean, metadata?: object}} entry
 *   actor: ไม่ระบุ = ใช้ req.user, null = ไม่ทราบผู้กระทำ (เช่น login ด้วย username ที่ไม่มีอยู่จริง)
 */
async function audit(req, { action, actor, targetType, targetId, success = true, metadata }) {
    const who = actor === undefined ? req?.user : actor;
    try {
        await prisma.auditLog.create({
            data: {
                actorId: who?.id ?? null,
                actorName: who ? actorLabel(who) : null,
                action,
                targetType: targetType ?? null,
                targetId: targetId == null ? null : String(targetId),
                success,
                metadata: metadata ? sanitize(metadata) : undefined,
                ip: req?.ip?.slice(0, 64) ?? null,
                userAgent: req?.get('user-agent')?.slice(0, 255) ?? null,
            },
        });
    } catch (err) {
        console.error('[Audit] บันทึกไม่สำเร็จ:', err.message);
    }
}

// บันทึกทุก request ที่แก้ข้อมูลผ่าน API เดิม — route ใส่รายละเอียดเพิ่มได้ทาง res.locals.audit (เช่นค่าเดิมก่อนแก้)
// /api/auth และ /api/admin บันทึกเองอยู่แล้ว จึงข้าม
function auditApiMutations(req, res, next) {
    if (SAFE_METHODS.has(req.method) || !req.path.startsWith('/api/')
        || req.path.startsWith('/api/auth/') || req.path.startsWith('/api/admin/')) {
        return next();
    }
    res.on('finish', () => {
        // ไม่ได้ login → โดนปฏิเสธไปแล้ว ไม่มีอะไรเปลี่ยน ไม่ต้องบันทึก (กัน log ล้นจากคนสุ่มยิง)
        if (!req.user) return;
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        audit(req, {
            action: API_ACTIONS[req.path] || `api.${req.method.toLowerCase()} ${req.path}`,
            targetId: body.key || body.userId || body.channelId || null,
            success: res.statusCode < 400,
            metadata: { status: res.statusCode, body, ...res.locals.audit },
        });
    });
    next();
}

/**
 * ค้นหา audit log แบบแบ่งหน้า (cursor = id ตัวสุดท้ายของหน้าก่อน)
 * action ลงท้ายด้วย . (เช่น "auth.") = ค้นหาทั้งหมวด
 */
async function queryAuditLogs({ action, actorId, q, success, from, to, cursor, limit = 50 }) {
    const where = {};
    if (action) where.action = action.endsWith('.') ? { startsWith: action } : action;
    if (actorId) where.actorId = actorId;
    if (success === true || success === false) where.success = success;
    if (from || to) where.createdAt = { ...(from && { gte: from }), ...(to && { lte: to }) };
    if (cursor) where.id = { lt: cursor };
    if (q) {
        where.OR = [
            { actorName: { contains: q, mode: 'insensitive' } },
            { targetId: { contains: q, mode: 'insensitive' } },
            { ip: { contains: q } },
        ];
    }

    const rows = await prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, take: limit + 1 });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

async function listAuditActions() {
    const rows = await prisma.auditLog.groupBy({ by: ['action'], orderBy: { action: 'asc' } });
    return rows.map((row) => row.action);
}

const deleteOldAuditLogs = () =>
    prisma.auditLog.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - cfg.AUDIT_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000) } },
    });

module.exports = { audit, auditApiMutations, queryAuditLogs, listAuditActions, deleteOldAuditLogs, SAFE_METHODS };
