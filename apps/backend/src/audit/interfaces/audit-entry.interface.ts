import type { User } from '../../generated/prisma/client';

export interface AuditEntry {
    action: string;
    // ไม่ระบุ = ใช้ req.user, null = ไม่ทราบผู้กระทำ (เช่น login ด้วย username ที่ไม่มีอยู่จริง)
    actor?: Pick<User, 'id' | 'username' | 'discordUsername'> | null;
    // ไม่ระบุ = เซิร์ฟเวอร์ของ route นี้ (req.audit.guildId)
    guildId?: string | null;
    targetType?: string;
    targetId?: string | number | null;
    success?: boolean;
    metadata?: Record<string, unknown>;
}
