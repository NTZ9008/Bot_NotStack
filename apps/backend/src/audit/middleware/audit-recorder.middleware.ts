import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import type { AppRequest } from '../../common/interfaces/app-request.interface';
import { AuditService } from '../audit.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * บันทึกทุก request ที่แก้ข้อมูลผ่าน /api — route ใส่รายละเอียดเพิ่มได้ทาง @AuditCtx() (เช่นค่าเดิมก่อนแก้)
 * และตั้งชื่อ action ด้วย @Audit('...') / ไม่บันทึกด้วย @SkipAudit()
 * /api/auth และ /api/admin บันทึกเองอยู่แล้ว (มีรายละเอียดมากกว่า) จึงข้าม
 */
@Injectable()
export class AuditRecorderMiddleware implements NestMiddleware {
    constructor(private readonly audit: AuditService) {}

    use(req: AppRequest, res: Response, next: NextFunction): void {
        req.audit ??= {};
        const path = new URL(req.originalUrl, 'http://local').pathname;
        if (SAFE_METHODS.has(req.method) || !path.startsWith('/api/') || path.startsWith('/api/auth/') || path.startsWith('/api/admin/')) {
            return next();
        }

        res.on('finish', () => {
            // ไม่ได้ login → โดนปฏิเสธไปแล้ว ไม่มีอะไรเปลี่ยน ไม่ต้องบันทึก (กัน log ล้นจากคนสุ่มยิง)
            if (!req.user || req.audit.skip) return;
            // body ที่เป็นไฟล์ดิบ (Buffer) ไม่ต้องเก็บลง log
            const body: Record<string, unknown> =
                req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? (req.body as Record<string, unknown>) : {};
            // ชื่อ action สำรองจาก path (id ของเซิร์ฟเวอร์ไม่ต้องอยู่ในชื่อ — เก็บแยกในคอลัมน์ guild_id)
            const fallback = `api.${req.method.toLowerCase()} ${path.replace(/^\/api\/guilds\/\d+/, '/api/guilds/:guildId')}`;
            void this.audit.audit(req, {
                action: req.audit.action || fallback,
                targetId: req.audit.targetId ?? ((body.key || body.userId || body.channelId || null) as string | null),
                success: res.statusCode < 400,
                metadata: { status: res.statusCode, body, ...req.audit.extra },
            });
        });
        next();
    }
}
