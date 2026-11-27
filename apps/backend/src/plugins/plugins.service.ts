import { HttpStatus, Injectable, Logger, OnApplicationBootstrap, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    isPluginId,
    PLUGIN_MAP,
    PLUGIN_NOT_INSTALLED_CODE,
    PLUGIN_REGISTRY,
    PR_CONFIG_KEYS,
    type GuildPluginsResponse,
    type GuildPluginState,
    type PluginId,
} from '@notstack/shared';
import { ApiException, notFound } from '../common/exceptions/api.exception';
import type { Env } from '../config/env.validation';
import { DiscordService } from '../discord/discord.service';
import { PrismaService } from '../prisma/prisma.service';

const CACHE_TTL_MS = 60 * 1000;
const MAX_CACHE_GUILDS = 1000;

const LEGACY_PR_CONFIG_KEYS = [
    PR_CONFIG_KEYS.defaultChannel,
    PR_CONFIG_KEYS.orgChannelMap,
    PR_CONFIG_KEYS.repoMentionMap,
    PR_CONFIG_KEYS.webhookSecret,
    'PR_CHANNEL_PEGASUS',
    'PR_MENTION_PEGASUS_TCG_WEB',
] as const;

const LEGACY_GRAFANA_CONFIG_KEYS = ['GRAFANA_CHANNEL_ID', 'GRAFANA_WEBHOOK_SECRET', 'GRAFANA_LABEL_CHANNEL_MAP'] as const;

const isConfiguredConfigValue = (value: string | null | undefined): boolean => Boolean(value && value !== '{}');

// ==========================================
// 🧩 PLUGINS — จัดการการติดตั้ง/ถอนการติดตั้งปลั๊กอินเสริมแยกตามเซิร์ฟเวอร์ (Per-Guild)
// ==========================================
@Injectable()
export class PluginsService implements OnApplicationBootstrap {
    private readonly logger = new Logger('Plugins');
    private readonly cache = new Map<string, { installed: Set<PluginId>; at: number }>();
    private readonly loading = new Map<string, Promise<Set<PluginId>>>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly discord: DiscordService,
        @Optional() private readonly config?: ConfigService<Env, true>,
    ) {}

    onApplicationBootstrap(): void {
        this.ensureLegacyInstallations().catch((err: unknown) =>
            this.logger.warn(`Backward-compatible plugin backfill skipped: ${err instanceof Error ? err.message : String(err)}`),
        );
    }

    // Backward compatibility: auto-install plugins for guilds with existing feature data/config,
    // without re-enabling rows explicitly uninstalled (enabled: false).
    async ensureLegacyInstallations(): Promise<number> {
        const [configRows, prMessageGuilds, prNotificationRows, jiraSettingGuilds, jiraTicketGuilds, fundTopicGuilds] = await Promise.all([
            this.prisma.config.findMany({
                where: { key: { in: [...LEGACY_PR_CONFIG_KEYS, ...LEGACY_GRAFANA_CONFIG_KEYS] } },
                select: { guildId: true, key: true, value: true },
            }),
            this.prisma.prMessage.findMany({ distinct: ['guildId'], select: { guildId: true } }),
            this.prisma.prNotification.findMany({ distinct: ['guildId', 'kind'], select: { guildId: true, kind: true } }),
            this.prisma.jiraSetting.findMany({ select: { guildId: true } }),
            this.prisma.jiraTicket.findMany({ distinct: ['guildId'], select: { guildId: true } }),
            this.prisma.fundTopic.findMany({ distinct: ['guildId'], select: { guildId: true } }),
        ]);

        const pairs = new Map<string, { guildId: string; pluginId: PluginId }>();
        const add = (guildId: string | null | undefined, pluginId: PluginId) => {
            if (!guildId) return;
            pairs.set(`${guildId}:${pluginId}`, { guildId, pluginId });
        };

        const prKeys = new Set<string>(LEGACY_PR_CONFIG_KEYS);
        const grafanaKeys = new Set<string>(LEGACY_GRAFANA_CONFIG_KEYS);
        for (const row of configRows) {
            if (!isConfiguredConfigValue(row.value)) continue;
            if (prKeys.has(row.key)) add(row.guildId, 'github-pr');
            else if (grafanaKeys.has(row.key)) add(row.guildId, 'grafana-alert');
        }

        for (const row of prMessageGuilds) add(row.guildId, 'github-pr');
        for (const row of prNotificationRows) {
            if (row.kind.startsWith('grafana_')) add(row.guildId, 'grafana-alert');
            else if (row.kind === 'sent' || row.kind === 'merged' || row.kind === 'closed') add(row.guildId, 'github-pr');
        }
        for (const row of jiraSettingGuilds) add(row.guildId, 'jira-card');
        for (const row of jiraTicketGuilds) add(row.guildId, 'jira-card');
        for (const row of fundTopicGuilds) add(row.guildId, 'savings-goal');

        const homeGuildId = this.discord.homeGuildId;
        if (this.config?.get('GITHUB_WEBHOOK_SECRET', { infer: true })) {
            add(homeGuildId, 'github-pr');
        }
        if (
            this.config?.get('GRAFANA_WEBHOOK_SECRET', { infer: true }) ||
            this.config?.get('GRAFANA_DISCORD_CHANNEL_ID', { infer: true }) ||
            this.config?.get('GRAFANA_API_URL', { infer: true })
        ) {
            add(homeGuildId, 'grafana-alert');
        }

        if (pairs.size === 0) return 0;

        const result = await this.prisma.guildPlugin.createMany({
            data: [...pairs.values()].map(({ guildId, pluginId }) => ({
                guildId,
                pluginId,
                enabled: true,
                installedBy: 'system:migration',
            })),
            skipDuplicates: true,
        });
        this.cache.clear();
        if (result.count > 0) this.logger.log(`🧩 Auto-installed ${result.count} legacy guild plugin record(s)`);
        return result.count;
    }

    private async installedSet(guildId: string): Promise<Set<PluginId>> {
        const now = Date.now();
        for (const [key, entry] of this.cache) {
            if (now - entry.at >= CACHE_TTL_MS) this.cache.delete(key);
        }
        const hit = this.cache.get(guildId);
        if (hit && now - hit.at < CACHE_TTL_MS) return hit.installed;

        let pending = this.loading.get(guildId);
        if (!pending) {
            pending = this.prisma.guildPlugin
                .findMany({ where: { guildId, enabled: true }, select: { pluginId: true } })
                .then((rows) => {
                    const installed = new Set<PluginId>();
                    for (const row of rows) {
                        if (isPluginId(row.pluginId)) installed.add(row.pluginId);
                    }
                    if (this.cache.size >= MAX_CACHE_GUILDS) {
                        const oldestKey = this.cache.keys().next().value;
                        if (oldestKey !== undefined) this.cache.delete(oldestKey);
                    }
                    this.cache.set(guildId, { installed, at: Date.now() });
                    return installed;
                })
                .finally(() => this.loading.delete(guildId));
            this.loading.set(guildId, pending);
        }
        return pending;
    }

    async getInstalledIds(guildId: string): Promise<PluginId[]> {
        const set = await this.installedSet(guildId);
        return PLUGIN_REGISTRY.filter((plugin) => set.has(plugin.id)).map((plugin) => plugin.id);
    }

    async isInstalled(guildId: string, pluginId: PluginId): Promise<boolean> {
        const set = await this.installedSet(guildId);
        return set.has(pluginId);
    }

    async assertInstalled(guildId: string, pluginId: PluginId): Promise<void> {
        if (await this.isInstalled(guildId, pluginId)) return;
        const pluginName = PLUGIN_MAP.get(pluginId)?.name ?? pluginId;
        throw new ApiException(
            HttpStatus.FORBIDDEN,
            `ต้องติดตั้งปลั๊กอิน "${pluginName}" ก่อนจึงจะใช้งานฟีเจอร์นี้ได้`,
            PLUGIN_NOT_INSTALLED_CODE,
            { pluginId },
        );
    }

    async list(guildId: string): Promise<GuildPluginsResponse> {
        const rows = await this.prisma.guildPlugin.findMany({ where: { guildId } });
        const byId = new Map(rows.map((row) => [row.pluginId, row]));
        const plugins: GuildPluginState[] = PLUGIN_REGISTRY.map((def) => {
            const row = byId.get(def.id);
            const installed = Boolean(row?.enabled);
            return {
                ...def,
                installed,
                enabled: installed,
                installedAt: installed && row ? row.installedAt.toISOString() : null,
                installedBy: installed && row ? row.installedBy : null,
            };
        });
        return {
            guildId,
            plugins,
            installedIds: plugins.filter((p) => p.installed).map((p) => p.id),
        };
    }

    async install(guildId: string, rawPluginId: string, installedBy: string | null): Promise<GuildPluginsResponse> {
        if (!isPluginId(rawPluginId)) throw notFound('ไม่พบปลั๊กอินนี้');
        await this.prisma.guildPlugin.upsert({
            where: { guildId_pluginId: { guildId, pluginId: rawPluginId } },
            create: { guildId, pluginId: rawPluginId, enabled: true, installedBy },
            update: { enabled: true, installedBy, installedAt: new Date() },
        });
        this.cache.delete(guildId);
        return this.list(guildId);
    }

    async uninstall(guildId: string, rawPluginId: string): Promise<GuildPluginsResponse> {
        if (!isPluginId(rawPluginId)) throw notFound('ไม่พบปลั๊กอินนี้');
        await this.prisma.guildPlugin.upsert({
            where: { guildId_pluginId: { guildId, pluginId: rawPluginId } },
            create: { guildId, pluginId: rawPluginId, enabled: false, installedBy: null },
            update: { enabled: false },
        });
        this.cache.delete(guildId);
        return this.list(guildId);
    }
}
