import crypto from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { z } from 'zod';
import { badRequest, serviceUnavailable } from '../common/exceptions/api.exception';
import { PrismaService } from '../prisma/prisma.service';
import { toJsonValue } from '../prisma/json.util';
import { PrBotService } from './pr-bot.service';

const repository = z
    .object({
        full_name: z
            .string()
            .regex(/^[\w.-]+\/[\w.-]+$/)
            .max(256),
        html_url: z.url().max(2048),
    })
    .passthrough();
const pr = z.object({ number: z.number().int().positive(), title: z.string().max(4096), html_url: z.url().max(2048) }).passthrough();
const base = z.object({ repository }).passthrough();
const schemas: Record<string, z.ZodType> = {
    pull_request: base.extend({ action: z.string().max(64), pull_request: pr }),
    pull_request_review: base.extend({ pull_request: pr, review: z.object({ id: z.number().int() }).passthrough() }),
    pull_request_review_comment: base.extend({ pull_request: pr, comment: z.object({ id: z.number().int() }).passthrough() }),
    issue_comment: base.extend({
        issue: z.object({ number: z.number().int().positive() }).passthrough(),
        comment: z.object({ id: z.number().int() }).passthrough(),
    }),
    check_run: base.extend({ check_run: z.object({ head_sha: z.string().max(128) }).passthrough() }),
    status: base.extend({ sha: z.string().max(128) }),
};

// ==========================================
// 📥 คิว webhook ของ GitHub — บันทึกลงฐานข้อมูลก่อนตอบ 202 แล้วค่อยทำงานทีละรายการตามลำดับ
// - กันส่งซ้ำ: delivery ID เดิม หรือ body เดิม (digest) ของเซิร์ฟเวอร์เดียวกัน จะไม่ถูกทำซ้ำ
// - ทำไม่สำเร็จ (เช่นบอทยังไม่ต่อ Discord) ลองใหม่แบบเว้นระยะ สูงสุด 5 ครั้ง แล้วเป็น failed
// - GitHub ไม่ส่งซ้ำให้เองเมื่อเราตอบ error จึงต้องรับได้ทั้งชุดที่มาพร้อมกัน (PR หนึ่งอันมี check_run หลายสิบ event)
// ==========================================
const DRAIN_BATCH = 100;
// แถวที่เสร็จแล้วเก็บไว้กันส่งซ้ำช่วงหนึ่งแล้วลบ (payload ถูกล้างตั้งแต่ตอนเสร็จ) / ที่ล้มเหลวเก็บนานกว่าไว้ตรวจสอบ
const DONE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const FAILED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class WebhookQueueService {
    private readonly logger = new Logger('Security');
    private running = false;
    constructor(
        private readonly prisma: PrismaService,
        private readonly bot: PrBotService,
    ) {}

    async enqueue(guildId: string, deliveryId: unknown, event: unknown, raw: Buffer): Promise<void> {
        if (typeof deliveryId !== 'string' || !/^[a-f0-9-]{36}$/i.test(deliveryId)) throw badRequest('Invalid delivery ID');
        // ping / event ที่บอทไม่ได้ใช้ (เช่น push ถ้าเลือก "Send me everything") ตอบรับเฉยๆ — ไม่ให้ GitHub ขึ้นว่าส่งไม่สำเร็จ
        if (typeof event !== 'string' || !schemas[event]) return;
        let input: unknown;
        try {
            input = JSON.parse(raw.toString('utf8'));
        } catch {
            throw badRequest('Invalid JSON');
        }
        const parsed = schemas[event]!.safeParse(input);
        if (!parsed.success) throw badRequest('Invalid webhook payload');
        // Body digest is independent of unsigned headers, preventing replay with a changed delivery ID/event header.
        const digest = crypto.createHash('sha256').update(raw).digest('hex');
        await this.prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('webhook-enqueue'))`;
            const existing = await tx.webhookDelivery.findFirst({ where: { guildId, OR: [{ deliveryId }, { digest }] } });
            if (existing) return;
            if (
                (await tx.webhookDelivery.count({ where: { status: { in: ['pending', 'processing'] } } })) >= 256 ||
                (await tx.webhookDelivery.count({ where: { guildId, status: { in: ['pending', 'processing'] } } })) >= 50
            ) {
                throw serviceUnavailable('Webhook queue is full; retry later');
            }
            await tx.webhookDelivery.create({ data: { guildId, deliveryId, digest, event, payload: toJsonValue(parsed.data), availableAt: new Date() } });
        });
    }

    @Interval(1000)
    async drain(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            const exhausted = await this.prisma.webhookDelivery.updateMany({
                where: { status: 'processing', attempts: { gte: 5 }, availableAt: { lte: new Date() } },
                data: { status: 'failed' },
            });
            if (exhausted.count) this.logger.error(JSON.stringify({ event: 'webhook_dead_letter', count: exhausted.count }));
            // ทำต่อเนื่องจนคิวว่าง (ทีละรายการ ตามลำดับที่เข้ามา) — รอบละไม่เกิน DRAIN_BATCH ให้ event loop ได้พักบ้าง
            for (let i = 0; i < DRAIN_BATCH && (await this.processNext()); i++);
        } catch {
            this.logger.error(JSON.stringify({ event: 'webhook_queue_unavailable' }));
        } finally {
            this.running = false;
        }
    }

    // ทำงานรายการถัดไป — คืน false เมื่อไม่มีงานที่ถึงเวลาแล้ว
    private async processNext(): Promise<boolean> {
        const job = await this.prisma.$transaction(async (tx) => {
            // เทียบกับเวลาที่ส่งจาก JS ไม่ใช่ NOW() ของฐานข้อมูล — Prisma 7 (adapter-pg) เขียน DateTime ตาม TimeZone ของ session
            // ถ้าฐานข้อมูลไม่ใช่ UTC ค่า available_at ที่ Prisma เขียนกับ NOW() จะห่างกันหลายชั่วโมง (การรอ retry / lease จะไม่ทำงาน)
            const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM webhook_deliveries
                WHERE status IN ('pending', 'processing') AND available_at <= ${new Date()} AND attempts < 5
                ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`;
            if (!rows[0]) return null;
            return tx.webhookDelivery.update({
                where: { id: rows[0].id },
                // ระหว่างทำจองไว้ 2 นาที — โปรเซสตายกลางทาง รายการจะกลับมาให้ทำใหม่เอง
                data: { status: 'processing', attempts: { increment: 1 }, availableAt: new Date(Date.now() + 120_000) },
            });
        });
        if (!job) return false;
        try {
            await this.bot.handle(job.guildId, job.event, job.payload, job.id);
            await this.prisma.webhookDelivery.update({ where: { id: job.id }, data: { status: 'done', completedAt: new Date(), payload: {} } });
        } catch {
            const failed = job.attempts >= 5;
            await this.prisma.webhookDelivery.update({
                where: { id: job.id },
                data: { status: failed ? 'failed' : 'pending', availableAt: new Date(Date.now() + 5000 * 2 ** (job.attempts - 1)) },
            });
            this.logger.error(JSON.stringify({ event: failed ? 'webhook_dead_letter' : 'webhook_retry', jobId: job.id, attempts: job.attempts }));
        }
        return true;
    }

    @Interval(60 * 60 * 1000)
    async cleanup(): Promise<void> {
        const now = Date.now();
        await this.prisma.webhookDelivery
            .deleteMany({
                where: {
                    OR: [
                        { status: 'done', completedAt: { lt: new Date(now - DONE_RETENTION_MS) } },
                        { status: 'failed', createdAt: { lt: new Date(now - FAILED_RETENTION_MS) } },
                    ],
                },
            })
            .catch(() => this.logger.error(JSON.stringify({ event: 'webhook_cleanup_failed' })));
    }
}
