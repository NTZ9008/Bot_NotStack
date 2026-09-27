import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuditLogPage, AuditLogQuery } from '@notstack/shared';
import type { AppRequest } from '../common/interfaces/app-request.interface';
import type { Env } from '../config/env.validation';
import type { Prisma, User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuditEntry } from './interfaces/audit-entry.interface';

const SENSITIVE_KEY_RE = /pass|secret|token|authorization|cookie/i;

// ชื่อผู้กระทำ ณ ตอนนั้น (ยังอ่านได้แม้บัญชีถูกลบหรือเปลี่ยนชื่อภายหลัง)
function actorLabel(user: Pick<User, 'id' | 'username' | 'discordUsername'>): string {
    if (user.username) return user.username;
    if (user.discordUsername) return `@${user.discordUsername}`;
    return `user#${user.id}`;
}

// ตัดข้อมูลลับ (รหัสผ่าน / token) และข้อความที่ยาวเกินไปออกก่อนบันทึก
export function sanitize(value: unknown, depth = 0): unknown {
    if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…` : value;
    if (value === null || typeof value !== 'object') return value;
    if (value instanceof Date) return value.toISOString();
    if (depth >= 4) return '[…]';
    if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
        out[key] = SENSITIVE_KEY_RE.test(key) ? '[REDACTED]' : sanitize(item, depth + 1);
    }
    return out;
}

// ==========================================
// 📜 AUDIT LOG — บันทึกว่าใครทำอะไรใน Dashboard เมื่อไหร่ จากที่ไหน (และกับเซิร์ฟเวอร์ไหน)
// - ระบบ auth / จัดการผู้ใช้ เรียก audit() เองพร้อมรายละเอียด
// - API อื่นๆ ที่แก้ข้อมูลถูกบันทึกอัตโนมัติด้วย AuditRecorderMiddleware
// การบันทึกล้มเหลวจะไม่ทำให้ request หลักล้มตาม
// ==========================================
@Injectable()
export class AuditService {
    private readonly logger = new Logger('Audit');
    private readonly retentionDays: number;

    constructor(
        private readonly prisma: PrismaService,
        config: ConfigService<Env, true>,
    ) {
        this.retentionDays = config.get('AUDIT_LOG_RETENTION_DAYS', { infer: true });
    }

    async audit(req: AppRequest | null, { action, actor, guildId, targetType, targetId, success = true, metadata }: AuditEntry): Promise<void> {
        const who = actor === undefined ? req?.user : actor;
        try {
            await this.prisma.auditLog.create({
                data: {
                    guildId: guildId === undefined ? (req?.audit?.guildId ?? null) : guildId,
                    actorId: who?.id ?? null,
                    actorName: who ? actorLabel(who) : null,
                    action,
                    targetType: targetType ?? null,
                    targetId: targetId == null ? null : String(targetId),
                    success,
                    metadata: metadata ? (sanitize(metadata) as Prisma.InputJsonValue) : undefined,
                    ip: req?.ip?.slice(0, 64) ?? null,
                    userAgent: req?.get('user-agent')?.slice(0, 255) ?? null,
                },
            });
        } catch (err) {
            this.logger.error(`บันทึกไม่สำเร็จ: ${(err as Error).message}`);
        }
    }

    /**
     * ค้นหา audit log แบบแบ่งหน้า (cursor = id ตัวสุดท้ายของหน้าก่อน)
     * action ลงท้ายด้วย . (เช่น "auth.") = ค้นหาทั้งหมวด, guildId = เฉพาะการแก้ค่าของเซิร์ฟเวอร์นั้น
     */
    async query({ action, actorId, q, success, from, to, cursor, limit }: AuditLogQuery, guildId?: string): Promise<AuditLogPage> {
        const where: Prisma.AuditLogWhereInput = {};
        if (guildId) where.guildId = guildId;
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

        const rows = await this.prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, take: limit + 1 });
        const hasMore = rows.length > limit;
        const items = (hasMore ? rows.slice(0, limit) : rows).map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
        return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
    }

    async listActions(guildId?: string): Promise<string[]> {
        const rows = await this.prisma.auditLog.groupBy({ by: ['action'], where: guildId ? { guildId } : {}, orderBy: { action: 'asc' } });
        return rows.map((row) => row.action);
    }

    deleteOld() {
        return this.prisma.auditLog.deleteMany({
            where: { createdAt: { lt: new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000) } },
        });
    }
}
