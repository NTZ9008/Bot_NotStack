import { createHash, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Events, type Interaction, type Message } from 'discord.js';
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
    private readonly members = this.gauge('discord_members', 'Members across all guilds (Discord-reported counts)');
    private readonly channels = this.gauge('discord_channels', 'Channels in the Discord client cache');
    private readonly cachedUsers = this.gauge('discord_cached_users', 'Users in the Discord client cache');
    private readonly voiceUsers = this.gauge('discord_voice_users', 'Users currently connected to voice channels');
    private readonly interactions = this.counter('discord_interactions_total', 'Interactions received by type', ['type']);
    private readonly commands = this.counter('discord_commands_total', 'Slash commands received by name', ['command']);
    private readonly messages = this.counter('discord_messages_total', 'Guild messages seen by author kind', ['author']);
    private readonly memberEvents = this.counter('discord_member_events_total', 'Guild member joins and leaves', ['event']);
    private readonly gatewayEvents = this.counter('discord_gateway_events_total', 'Gateway connection lifecycle events', ['event']);
    private readonly rateLimits = this.counter('discord_rate_limits_total', 'REST requests that hit a Discord rate limit', ['global']);

    // Business stats come from heavier queries, so they refresh at most once a minute and never fail a scrape.
    private statsRefreshedAt = 0;
    private statsRefresh?: Promise<void>;
    private readonly activeGuilds = this.gauge('db_guilds_active', 'Guilds the bot is currently in (database)');
    private readonly users = this.gauge('db_users', 'Dashboard user accounts');
    private readonly activeSessions = this.gauge('db_auth_sessions_active', 'Unrevoked, unexpired dashboard sessions');
    private readonly webhookDeliveries = this.gauge('db_webhook_deliveries', 'Queued PR webhook deliveries by status', ['status']);
    private readonly activity24h = this.gauge('db_activity_events_24h', 'Activity events recorded in the last 24 hours', ['event']);
    private readonly statsUp = this.gauge('db_stats_up', 'Whether the last business stats refresh succeeded');

    constructor(
        private readonly config: ConfigService<Env, true>,
        private readonly discord: DiscordService,
        private readonly prisma: PrismaService,
    ) {
        if (!this.config.get('METRICS_TOKEN', { infer: true })) return;
        collectDefaultMetrics({ register: this.registry, prefix: 'notstack_' });
        this.observeDiscord();
    }

    private gauge(name: string, help: string, labelNames: string[] = []): Gauge {
        return new Gauge({ name: `notstack_${name}`, help, labelNames, registers: [this.registry] });
    }

    private counter(name: string, help: string, labelNames: string[]): Counter {
        return new Counter({ name: `notstack_${name}`, help, labelNames, registers: [this.registry] });
    }

    private observeDiscord(): void {
        const client = this.discord.client;
        client.on(Events.InteractionCreate, (i: Interaction) => {
            const type = i.isChatInputCommand()
                ? 'command'
                : i.isAutocomplete()
                  ? 'autocomplete'
                  : i.isButton()
                    ? 'button'
                    : i.isAnySelectMenu()
                      ? 'select'
                      : i.isModalSubmit()
                        ? 'modal'
                        : i.isContextMenuCommand()
                          ? 'context_menu'
                          : 'other';
            this.interactions.inc({ type });
            // Discord only dispatches names registered by this app, and the regex caps label cardinality anyway.
            if (i.isChatInputCommand()) this.commands.inc({ command: /^[\w-]{1,32}$/.test(i.commandName) ? i.commandName : 'other' });
        });
        client.on(Events.MessageCreate, (m: Message) => {
            if (m.inGuild()) this.messages.inc({ author: m.webhookId ? 'webhook' : m.author.bot ? 'bot' : 'user' });
        });
        client.on(Events.GuildMemberAdd, () => this.memberEvents.inc({ event: 'join' }));
        client.on(Events.GuildMemberRemove, () => this.memberEvents.inc({ event: 'leave' }));
        client.on(Events.ShardDisconnect, () => this.gatewayEvents.inc({ event: 'disconnect' }));
        client.on(Events.ShardReconnecting, () => this.gatewayEvents.inc({ event: 'reconnecting' }));
        client.on(Events.ShardResume, () => this.gatewayEvents.inc({ event: 'resume' }));
        client.on(Events.ShardError, () => this.gatewayEvents.inc({ event: 'error' }));
        client.rest.on('rateLimited', (info) => this.rateLimits.inc({ global: String(info.global) }));
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
        const guilds = this.discord.client.guilds.cache;
        this.guilds.set(guilds.size);
        let members = 0;
        let voice = 0;
        for (const guild of guilds.values()) {
            members += guild.memberCount;
            voice += guild.voiceStates.cache.filter((state) => state.channelId !== null).size;
        }
        this.members.set(members);
        this.voiceUsers.set(voice);
        this.channels.set(this.discord.client.channels.cache.size);
        this.cachedUsers.set(this.discord.client.users.cache.size);
        if (Date.now() - this.statsRefreshedAt >= 60_000) {
            this.statsRefresh ??= this.refreshStats().finally(() => {
                this.statsRefresh = undefined;
            });
            await this.statsRefresh;
        }
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

    private async refreshStats(): Promise<void> {
        try {
            const now = new Date();
            const [guilds, users, sessions, deliveries, activity] = await Promise.all([
                this.prisma.guild.count({ where: { leftAt: null } }),
                this.prisma.user.count(),
                this.prisma.authSession.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
                this.prisma.webhookDelivery.groupBy({ by: ['status'], _count: { _all: true } }),
                this.prisma.activityEvent.groupBy({
                    by: ['eventKey'],
                    where: { createdAt: { gte: new Date(now.getTime() - 86_400_000) } },
                    _count: { _all: true },
                }),
            ]);
            this.activeGuilds.set(guilds);
            this.users.set(users);
            this.activeSessions.set(sessions);
            this.webhookDeliveries.reset();
            for (const status of ['pending', 'processing', 'done', 'failed']) this.webhookDeliveries.set({ status }, 0);
            for (const row of deliveries) this.webhookDeliveries.set({ status: row.status }, row._count._all);
            this.activity24h.reset();
            for (const row of activity) this.activity24h.set({ event: row.eventKey }, row._count._all);
            this.statsUp.set(1);
        } catch {
            this.statsUp.set(0);
        } finally {
            this.statsRefreshedAt = Date.now();
        }
    }
}
