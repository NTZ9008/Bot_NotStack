import { randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbedBuilder } from 'discord.js';
import { BotConfigService } from '../bot-config/bot-config.service';
import type { Env } from '../config/env.validation';
import { DiscordService } from '../discord/discord.service';
import { PrismaService } from '../prisma/prisma.service';

const KEYS = { channel: 'GRAFANA_CHANNEL_ID', secret: 'GRAFANA_WEBHOOK_SECRET', mapping: 'GRAFANA_LABEL_CHANNEL_MAP' } as const;

type Alert = {
    status?: string;
    labels?: Record<string, unknown>;
    annotations?: Record<string, unknown>;
    startsAt?: string;
    endsAt?: string;
    generatorURL?: string;
    dashboardURL?: string;
    panelURL?: string;
};
type AlertPayload = { status?: string; receiver?: string; alerts?: Alert[]; externalURL?: string; commonLabels?: Record<string, unknown>; commonAnnotations?: Record<string, unknown> };

const clip = (value: unknown, max = 1000): string => String(value ?? '').slice(0, max) || '—';
const safeUrl = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
    } catch {
        return null;
    }
};

@Injectable()
export class GrafanaService {
    private readonly logger = new Logger('Grafana');
    private readonly baseUrl: string;
    private readonly apiToken: string;
    private readonly webhookSecret: string;
    private readonly legacyChannelId: string;

    constructor(config: ConfigService<Env, true>, private readonly discord: DiscordService, private readonly botConfig: BotConfigService, private readonly prisma: PrismaService) {
        this.baseUrl = (config.get('GRAFANA_API_URL', { infer: true }) ?? '').replace(/\/+$/, '');
        this.apiToken = config.get('GRAFANA_API_TOKEN', { infer: true }) ?? '';
        this.webhookSecret = config.get('GRAFANA_WEBHOOK_SECRET', { infer: true }) ?? '';
        this.legacyChannelId = config.get('GRAFANA_DISCORD_CHANNEL_ID', { infer: true }) ?? '';
    }

    get homeGuildId(): string {
        return this.discord.homeGuildId;
    }

    private async secret(guildId: string): Promise<string> {
        return (await this.botConfig.get(guildId, KEYS.secret)) ?? (guildId === this.discord.homeGuildId ? this.webhookSecret : '') ?? '';
    }

    async verifyWebhookAuthorization(guildId: string, header: unknown): Promise<boolean> {
        const secret = await this.secret(guildId);
        if (!secret) return false;
        if (typeof header !== 'string') return false;
        const expected = Buffer.from(`Bearer ${secret}`);
        const received = Buffer.from(header);
        return expected.length === received.length && timingSafeEqual(expected, received);
    }

    async sendAlert(guildId: string, payload: AlertPayload, channelOverride?: string): Promise<void> {
        const mapping = await this.labelChannelMap(guildId);
        const defaultChannel = await this.botConfig.get(guildId, KEYS.channel) ?? (guildId === this.discord.homeGuildId ? this.legacyChannelId : '');
        const alerts = Array.isArray(payload.alerts) ? payload.alerts.slice(0, 10) : [];
        const groups = new Map<string, Alert[]>();
        if (alerts.length) {
            for (const alert of alerts) {
                const labels = { ...(payload.commonLabels ?? {}), ...(alert.labels ?? {}) };
                const channelId = channelOverride ?? this.resolveMappedChannel(mapping, labels) ?? defaultChannel;
                if (!channelId) throw new Error(`Grafana channel is not configured for guild ${guildId}`);
                groups.set(channelId, [...(groups.get(channelId) ?? []), alert]);
            }
        } else {
            const channelId = channelOverride ?? defaultChannel;
            if (!channelId) throw new Error(`Grafana channel is not configured for guild ${guildId}`);
            groups.set(channelId, []);
        }
        for (const [channelId, routedAlerts] of groups) await this.sendAlertToChannel(guildId, { ...payload, alerts: routedAlerts }, channelId);
        await this.recordStats(guildId, payload.status === 'resolved' ? 'resolved' : 'firing');
    }

    private async sendAlertToChannel(guildId: string, payload: AlertPayload, channelId: string): Promise<void> {
        if (!this.discord.ready) throw new Error('Discord bot is not ready');
        const channel = await this.discord.fetchGuildChannel(guildId, channelId, true);
        if (!channel?.isSendable() || !('send' in channel)) throw new Error('Configured Grafana Discord channel is unavailable');

        const alerts = payload.alerts ?? [];
        const firing = alerts.filter((alert) => (alert.status ?? payload.status) === 'firing').length;
        const resolved = alerts.filter((alert) => (alert.status ?? payload.status) === 'resolved').length;
        const isFiring = firing > 0 || (!alerts.length && payload.status === 'firing');
        const color = isFiring ? 0xe03131 : 0x2f9e44;
        const status = isFiring ? 'FIRING' : 'RESOLVED';
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`${isFiring ? '🔴' : '🟢'} Grafana Alert ${status}`)
            .setDescription(`${alerts.length} alert(s) · ${firing} firing · ${resolved} resolved`)
            .setTimestamp(new Date());

        const common = payload.commonLabels ?? {};
        const commonAnnotations = payload.commonAnnotations ?? {};
        const externalUrl = safeUrl(payload.externalURL);
        if (externalUrl) embed.setURL(externalUrl);
        const usefulCommon = Object.entries(common).filter(([key]) => key !== 'alertname').slice(0, 5);
        for (let index = 0; index < Math.min(alerts.length, 5); index++) {
            const alert = alerts[index]!;
            const labels = alert.labels ?? {};
            const annotations = alert.annotations ?? {};
            const alertName = clip(labels.alertname ?? 'Alert', 200);
            const summary = clip(annotations.summary ?? commonAnnotations.summary ?? annotations.description ?? commonAnnotations.description, 900);
            const links = [
                safeUrl(annotations.dashboardURL ?? alert.dashboardURL),
                safeUrl(annotations.panelURL ?? alert.panelURL),
                safeUrl(alert.generatorURL),
            ].filter((url): url is string => !!url);
            const fields = [
                ...Object.entries(labels).filter(([key]) => key !== 'alertname').slice(0, 4).map(([key, value]) => `**${clip(key, 80)}:** ${clip(value, 180)}`),
                ...usefulCommon.map(([key, value]) => `**${clip(key, 80)}:** ${clip(value, 180)}`),
            ].slice(0, 4);
            const details = [summary, fields.join(' · '), links.length ? links.map((url, i) => `[${['Dashboard', 'Panel', 'Explore'][i] ?? 'Details'}](${url})`).join(' · ') : '']
                .filter(Boolean)
                .join('\n');
            embed.addFields({ name: alertName, value: clip(details, 1024), inline: false });
        }
        if (alerts.length > 5) embed.setFooter({ text: `${alerts.length - 5} additional alerts omitted` });
        await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    }

    async sendTest(guildId: string): Promise<void> {
        await this.sendAlert(guildId, {
            status: 'firing',
            alerts: [{ status: 'firing', labels: { alertname: 'Grafana Test Alert', env: 'test', severity: 'info', service: 'Bot_NotStack' }, annotations: { summary: 'This is a test notification from the Grafana dashboard.' } }],
        });
    }

    async readSettings(guildId: string) {
        const secret = (await this.botConfig.get(guildId, KEYS.secret)) ?? (await this.rotateSecret(guildId));
        let labelChannels: Record<string, string> = {};
        try {
            const parsed: unknown = JSON.parse((await this.botConfig.get(guildId, KEYS.mapping)) ?? '{}');
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                labelChannels = Object.fromEntries(Object.entries(parsed).filter(([key, value]) => /^(env|severity):[^:]+$/i.test(key) && typeof value === 'string'));
            }
        } catch {
            // Ignore invalid legacy values and return an empty mapping.
        }
        return { defaultChannelId: (await this.botConfig.get(guildId, KEYS.channel)) ?? '', labelChannels, webhookPath: `/webhook/grafana/${guildId}`, webhookSecret: secret };
    }

    async updateSettings(guildId: string, input: { defaultChannelId: string; labelChannels: Record<string, string> }) {
        for (const [key, value] of Object.entries(input.labelChannels)) {
            if (!/^(env|severity):[^:]+$/i.test(key)) throw new Error(`Invalid Grafana label mapping key: ${key}`);
            if (value && !(await this.discord.fetchGuildChannel(guildId, value))) throw new Error(`Channel ${value} does not belong to this guild`);
        }
        if (input.defaultChannelId && !(await this.discord.fetchGuildChannel(guildId, input.defaultChannelId))) throw new Error('Default channel does not belong to this guild');
        await this.botConfig.set(guildId, KEYS.channel, input.defaultChannelId, 'Grafana alerts default Discord channel');
        await this.botConfig.set(guildId, KEYS.mapping, JSON.stringify(input.labelChannels), 'Grafana label to Discord channel mappings');
        return this.readSettings(guildId);
    }

    async rotateSecret(guildId: string): Promise<string> {
        const secret = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
        await this.botConfig.set(guildId, KEYS.secret, secret, 'Grafana webhook Bearer secret');
        return secret;
    }

    private async labelChannelMap(guildId: string): Promise<Record<string, string>> {
        try {
            const parsed: unknown = JSON.parse((await this.botConfig.get(guildId, KEYS.mapping)) ?? '{}');
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === 'string'));
        } catch {
            // Ignore invalid legacy values and use the default channel.
        }
        return {};
    }

    private resolveMappedChannel(mapping: Record<string, string>, labels: Record<string, unknown>): string | null {
        for (const label of ['env', 'severity']) {
            const value = labels[label];
            if (typeof value !== 'string') continue;
            const channelId = mapping[`${label}:${value}`] ?? Object.entries(mapping).find(([key]) => key.toLowerCase() === `${label}:${value}`.toLowerCase())?.[1];
            if (channelId) return channelId;
        }
        return null;
    }

    private async recordStats(guildId: string, status: 'firing' | 'resolved'): Promise<void> {
        try {
            const messageId = `grafana-${randomUUID()}`;
            await this.prisma.prNotification.createMany({
                data: [
                    { guildId, messageId, kind: 'grafana_sent' },
                    { guildId, messageId, kind: `grafana_${status}` },
                ],
                skipDuplicates: true,
            });
        } catch (error) {
            this.logger.error(`Unable to record Grafana stats: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async readStats(guildId: string, days: number, now = new Date()) {
        const dayMs = 86_400_000;
        const thaiOffset = 7 * 3_600_000;
        const today = Math.floor((now.getTime() + thaiOffset) / dayMs) * dayMs;
        const firstDay = today - (days - 1) * dayMs;
        const from = new Date(firstDay - thaiOffset);
        const daily = Array.from({ length: days }, (_, i) => ({ label: new Date(firstDay + i * dayMs).toISOString().slice(0, 10), firing: 0, resolved: 0, sent: 0 }));
        const totals = { firing: 0, resolved: 0, sent: 0 };
        const rows = await this.prisma.$queryRaw<{ day: string; kind: string; total: bigint }[]>`
            SELECT to_char(created_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS day, kind, count(*) AS total
            FROM pr_notifications WHERE guild_id = ${guildId} AND kind IN ('grafana_firing', 'grafana_resolved', 'grafana_sent')
              AND created_at >= ${from.toISOString()}::timestamptz AND created_at <= ${now.toISOString()}::timestamptz
            GROUP BY day, kind
        `;
        const byDay = new Map(daily.map((bucket) => [bucket.label, bucket]));
        for (const row of rows) {
            const key = row.kind.replace('grafana_', '') as keyof typeof totals;
            const bucket = byDay.get(row.day);
            if (!bucket || !(key in totals)) continue;
            const value = Number(row.total);
            bucket[key] += value;
            totals[key] += value;
        }
        return { range: { from: from.toISOString(), to: now.toISOString(), days, timeZone: 'Asia/Bangkok' }, totals, daily };
    }

    async getHealth(): Promise<{ status: string; version?: string; commit?: string }> {
        if (!this.baseUrl) throw new Error('GRAFANA_API_URL is not configured');
        const headers = this.apiToken ? { Authorization: `Bearer ${this.apiToken}` } : undefined;
        const response = await fetch(`${this.baseUrl}/api/health`, { headers, signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error(`Grafana API returned HTTP ${response.status}`);
        const body: unknown = await response.json();
        if (!body || typeof body !== 'object') throw new Error('Grafana API returned invalid health data');
        const data = body as Record<string, unknown>;
        return { status: 'ok', ...(typeof data.version === 'string' ? { version: data.version } : {}), ...(typeof data.commit === 'string' ? { commit: data.commit } : {}) };
    }

    logDeliveryError(error: unknown): void {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Alert delivery failed: ${message}`);
    }
}
