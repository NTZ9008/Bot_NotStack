// รหัส error ที่ API ส่งมาตอน session ใช้ไม่ได้ (หน้าเว็บใช้ตัดสินใจว่าจะ refresh หรือพาไปหน้า login)
export const AUTH_ERROR_CODES = {
    unauthenticated: 'UNAUTHENTICATED',
    forbidden: 'FORBIDDEN',
    noSession: 'NO_SESSION',
    tokenRotated: 'TOKEN_ROTATED',
    sessionRevoked: 'SESSION_REVOKED',
    badOrigin: 'BAD_ORIGIN',
} as const;
