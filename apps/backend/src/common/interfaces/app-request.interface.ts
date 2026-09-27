import type { Request } from 'express';
import type { User } from '../../generated/prisma/client';

// รายละเอียดที่ route ใส่เพิ่มให้ audit log ของ request นี้ได้ (ดู AuditRecorderMiddleware)
export interface AuditContext {
    // ชื่อ action (ถ้าไม่ตั้ง จะได้ชื่อจาก path เช่น api.post /api/xxx)
    action?: string;
    targetId?: string | number | null;
    // เซิร์ฟเวอร์ที่ถูกแก้ (GuildAccessGuard ใส่ให้เองทุก route ใต้ /api/guilds/:guildId)
    guildId?: string;
    // ข้อมูลเพิ่มใน metadata เช่นค่าเดิมก่อนแก้
    extra?: Record<string, unknown>;
    // POST ที่ไม่ได้แก้ข้อมูล (เช่นวาดรูปตัวอย่าง) — ไม่ต้องลง log
    skip?: boolean;
}

// req.user ถูกใส่โดย JwtStrategy (ไม่มี = ยังไม่ได้ login)
export interface AppRequest extends Request {
    user?: User;
    audit: AuditContext;
}
