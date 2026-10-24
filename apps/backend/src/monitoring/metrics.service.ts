import { createHash, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response, NextFunction } from 'express';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';
import type { Env } from '../config/env.validation';
import { DiscordService } from '../discord/discord.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MetricsService {
    readonly registry = new Registry();
    private readonly requests = new Counter({
        name: 'notstack_http_requests_total',
        help: 'Completed API and webhook requests',
        labelNames: ['method', 'route', 'status_code'] as const,
        registers: [this.registry],
    });
    private readonly duration = new Histogram({
        name: 'notstack_http_request_duration_seconds',
        help: 'API and webhook response duration',
        labelNames: ['method', 'route', 'status_code'] as const,
        buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
        registers: [this.registry],
    });
    private databaseProbe?: Promise<void>;
    private readonly databaseUp = this.gauge('database_up', 'Whether the database probe succeeded');
    private readonly databaseDuration = this.gauge('database_probe_duration_seconds', 'Database probe duration including pool wait');
    private readonly discordReady = this.gauge('discord_ready', 'Whether the Discord client is ready');
    private readonly discordEnabled = this.gauge('discord_enabled', 'Whether a Discord token is configured');
    private readonly discordPing = this.gauge('discord_gateway_ping_seconds', 'Discord gateway heartbeat latency; NaN when unavailable');
    private readonly guilds = this.gauge('discord_guilds', 'Guilds in the Discord client cache');

    constructor(
        private readonly config: ConfigService<Env, true>,
        private readonly discord: DiscordService,
        private readonly prisma: PrismaService,
    ) {
        if (this.config.get('METRICS_TOKEN', { infer: true })) collectDefaultMetrics({ register: this.registry, prefix: 'notstack_' });
    }

    private gauge(name: string, help: string): Gauge {
        return new Gauge({ name: `notstack_${name}`, help, registers: [this.registry] });
    }

    // Installed before rate limiting/body parsing so rejected requests are counted too.
    readonly middleware = (req: Request, res: Response, next: NextFunction): void => {
        const path = req.path.toLowerCase().replace(/\/+$/, '');
        const token = this.config.get('METRICS_TOKEN', { infer: true });
        if (path === '/api/metrics') {
            res.setHeader('Cache-Control', 'no-store');
            if (!token) {
                res.sendStatus(404);
                return;
            }
            const expected = createHash('sha256').update(`Bearer ${token}`).digest();
            const actual = createHash('sha256')
                .update(req.headers.authorization ?? '')
                .digest();
            if (!timingSafeEqual(expected, actual)) {
                res.sendStatus(401);
                return;
            }
            if (req.method !== 'GET') {
                res.setHeader('Allow', 'GET');
                res.sendStatus(405);
                return;
            }
            void this.scrape()
                .then((body) => {
                    res.setHeader('Content-Type', this.registry.contentType);
                    res.send(body);
                })
                .catch(() => {
                    if (!res.headersSent) res.sendStatus(500);
                });
            return;
        }
        if (token && (path === '/api' || path.startsWith('/api/') || path === '/webhook' || path.startsWith('/webhook/'))) {
            const started = process.hrtime.bigint();
            res.once('finish', () => {
                // Express route templates only: never export IDs, query strings, tokens or arbitrary 404 paths.
                const route = typeof req.route?.path === 'string' ? req.route.path : 'unmatched';
                const method = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'].includes(req.method) ? req.method : 'OTHER';
                const labels = { method, route, status_code: String(res.statusCode) };
                this.requests.inc(labels);
                this.duration.observe(labels, Number(process.hrtime.bigint() - started) / 1e9);
            });
        }
        next();
    };

    async scrape(): Promise<string> {
        // Concurrent scrapes share one bounded query rather than exhausting the connection pool.
        this.databaseProbe ??= this.probeDatabase().finally(() => {
            this.databaseProbe = undefined;
        });
        await this.databaseProbe;
        const ready = this.discord.ready;
        this.discordEnabled.set(this.config.get('TOKEN', { infer: true }) ? 1 : 0);
        this.discordReady.set(ready ? 1 : 0);
        const ping = ready?.ws.ping;
        this.discordPing.set(ping !== undefined && ping >= 0 ? ping / 1000 : NaN);
        this.guilds.set(this.discord.client.guilds.cache.size);
        return this.registry.metrics();
    }

    private async probeDatabase(): Promise<void> {
        const started = process.hrtime.bigint();
        try {
            await this.prisma.$transaction(
                async (tx) => {
                    await tx.$executeRaw`SET LOCAL statement_timeout = '3000ms'`;
                    await tx.$queryRaw`SELECT 1`;
                },
                { maxWait: 1000, timeout: 4000 },
            );
            this.databaseUp.set(1);
        } catch {
            this.databaseUp.set(0);
        } finally {
            this.databaseDuration.set(Number(process.hrtime.bigint() - started) / 1e9);
        }
    }
}
