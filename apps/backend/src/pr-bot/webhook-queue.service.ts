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
        if (event === 'ping') return;
        if (typeof event !== 'string' || !schemas[event]) throw badRequest('Unsupported webhook event');
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
            await tx.webhookDelivery.create({ data: { guildId, deliveryId, digest, event, payload: toJsonValue(parsed.data) } });
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
            const job = await this.prisma.$transaction(async (tx) => {
                const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM webhook_deliveries
                    WHERE status IN ('pending', 'processing') AND available_at <= NOW() AND attempts < 5
                    ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`;
                if (!rows[0]) return null;
                return tx.webhookDelivery.update({
                    where: { id: rows[0].id },
                    data: {
                        status: 'processing',
                        attempts: { increment: 1 },
                        availableAt: new Date(Date.now() + 120_000),
                    },
                });
            });
            if (!job) return;
            try {
                await this.bot.handle(job.guildId, job.event, job.payload, job.id);
                await this.prisma.webhookDelivery.update({ where: { id: job.id }, data: { status: 'done', completedAt: new Date(), payload: {} } });
            } catch {
                const failed = job.attempts >= 5;
                await this.prisma.webhookDelivery.update({
                    where: { id: job.id },
                    data: {
                        status: failed ? 'failed' : 'pending',
                        availableAt: new Date(Date.now() + 5000 * 2 ** (job.attempts - 1)),
                    },
                });
                this.logger.error(JSON.stringify({ event: failed ? 'webhook_dead_letter' : 'webhook_retry', jobId: job.id, attempts: job.attempts }));
            }
        } catch {
            this.logger.error(JSON.stringify({ event: 'webhook_queue_unavailable' }));
        } finally {
            this.running = false;
        }
    }
}
