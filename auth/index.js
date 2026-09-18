// ==========================================
// 🔐 AUTH SYSTEM
// - login: username/password (bcrypt) หรือ Discord OAuth2
// - session: JWT access token 15 นาที + refresh token หมุนเวียน 7 วัน (httpOnly cookie ทั้งคู่)
// - role: USER (ดู Levels / บัญชีตัวเอง) และ ADMIN (ทุกอย่าง + จัดการผู้ใช้ + audit log)
// - audit log: บันทึกการ login และทุกการแก้ไขข้อมูลผ่าน Dashboard
// ==========================================
const { seedAdminFromEnv } = require('./users');
const { deleteExpiredRefreshTokens } = require('./tokens');
const { deleteOldAuditLogs } = require('./audit');

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

async function cleanup() {
    try {
        await deleteExpiredRefreshTokens();
        await deleteOldAuditLogs();
    } catch (err) {
        console.error('[Auth] ล้างข้อมูลเก่าไม่สำเร็จ:', err.message);
    }
}

// เรียกครั้งเดียวตอนเปิดเซิร์ฟเวอร์
function initAuth() {
    seedAdminFromEnv().catch((err) => console.error('[Auth] สร้างผู้ดูแลระบบเริ่มต้นไม่สำเร็จ:', err.message));
    cleanup();
    setInterval(cleanup, CLEANUP_INTERVAL_MS).unref();
}

module.exports = {
    initAuth,
    authRouter: require('./routes'),
    adminRouter: require('./adminRoutes'),
    ...require('./middleware'),
    auditApiMutations: require('./audit').auditApiMutations,
};
