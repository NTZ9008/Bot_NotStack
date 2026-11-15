import { Injectable, Logger } from '@nestjs/common';
import {
    PR_CONFIG_KEYS,
    type CustomSummaryChannelGroup,
    type CustomSummaryChannelOption,
    type CustomSummaryChannelRow,
    type CustomSummaryContributorRow,
    type CustomSummaryLogRow,
    type CustomSummaryModule,
    type CustomSummaryPrChannelRow,
    type CustomSummaryPrRepoRow,
    type CustomSummaryRequest,
    type CustomSummaryResponse,
    type CustomSummaryTimelinePoint,
} from '@notstack/shared';
import { ChannelType } from 'discord.js';
import { BotConfigService } from '../bot-config/bot-config.service';
import { DiscordService } from '../discord/discord.service';
import { Prisma } from '../generated/prisma/client';
import { activityEventLabel } from '../log-manager/utils/activity-humanize.util';
import { SERVER_JOIN_KEYS, SERVER_LEAVE_KEYS } from '../log-manager/utils/activity-stats.util';
import { PrismaService } from '../prisma/prisma.service';
import {
    VOICE_LIFECYCLE_EVENTS,
    bangkokBucketKey,
    bangkokBucketLabel,
    buildBangkokBuckets,
    pairVoiceSessions,
    type ActiveVoiceStateInput,
    type VoiceEventInput,
} from './voice-pairing.util';

const DEFAULT_RANGE_DAYS = 7;
const MAX_RANGE_DAYS = 365;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const VOICE_LOOKBACK_MS = 24 * HOUR_MS;
const DEVOPS_CHANNEL_NAME_RE = /(?:^|[-_])(pr|pull-?request|github|grafana|alert|devops|jira|deploy|ci|webhook)(?:$|[-_])/i;

const TEXT_TYPES = new Set<ChannelType>([ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum]);
const VOICE_TYPES = new Set<ChannelType>([ChannelType.GuildVoice, ChannelType.GuildStageVoice]);

const MESSAGE_KEYS = ['messageSent', 'messageDelete', 'messageUpdate', 'messageBulkDelete', 'messagePin', 'invitePosted', 'filterUsed'] as const;
const DEVOPS_ACTIVITY_KEYS = [...SERVER_JOIN_KEYS, ...SERVER_LEAVE_KEYS, 'commandUsed'] as const;

function safeJsonRecord(raw: string | null | undefined): Record<string, string> {
    if (!raw) return {};
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(entry[1])));
    } catch {
        return {};
    }
}

interface DevopsChannelConfig {
    prDefaultChannelId: string;
    prChannelIds: Set<string>;
    grafanaDefaultChannelId: string;
    grafanaChannelIds: Set<string>;
    jiraChannelIds: Set<string>;
    jiraLogChannelId: string;
    jiraPanelChannelId: string;
}

@Injectable()
export class CustomSummaryService {
    private readonly logger = new Logger('CustomSummary');

    constructor(
        private readonly prisma: PrismaService,
        private readonly discord: DiscordService,
        private readonly botConfig: BotConfigService,
    ) {}

    private async loadDevopsConfig(guildId: string): Promise<DevopsChannelConfig> {
        const [prDefault, prOrgMapRaw, grafanaDefault, grafanaMapRaw, jiraSetting, prMsgChannels] = await Promise.all([
            this.botConfig.get(guildId, PR_CONFIG_KEYS.defaultChannel),
            this.botConfig.get(guildId, PR_CONFIG_KEYS.orgChannelMap),
            this.botConfig.get(guildId, 'GRAFANA_CHANNEL_ID'),
            this.botConfig.get(guildId, 'GRAFANA_LABEL_CHANNEL_MAP'),
            this.prisma.jiraSetting.findUnique({ where: { guildId }, select: { panelChannelId: true, logChannelId: true } }),
            this.prisma.prMessage.findMany({ where: { guildId }, distinct: ['channelId'], select: { channelId: true } }),
        ]);

        const prOrgMap = safeJsonRecord(prOrgMapRaw);
        const grafanaMap = safeJsonRecord(grafanaMapRaw);
        const prChannelIds = new Set<string>([
            ...(prDefault ? [prDefault] : []),
            ...Object.values(prOrgMap),
            ...prMsgChannels.map((row) => row.channelId).filter(Boolean),
        ]);
        const grafanaChannelIds = new Set<string>([...(grafanaDefault ? [grafanaDefault] : []), ...Object.values(grafanaMap)]);
        const jiraChannelIds = new Set<string>([
            ...(jiraSetting?.panelChannelId ? [jiraSetting.panelChannelId] : []),
            ...(jiraSetting?.logChannelId ? [jiraSetting.logChannelId] : []),
        ]);

        return {
            prDefaultChannelId: prDefault ?? '',
            prChannelIds,
            grafanaDefaultChannelId: grafanaDefault ?? '',
            grafanaChannelIds,
            jiraChannelIds,
            jiraLogChannelId: jiraSetting?.logChannelId ?? '',
            jiraPanelChannelId: jiraSetting?.panelChannelId ?? '',
        };
    }

    private classifyChannel(
        id: string,
        name: string,
        isVoice: boolean,
        devopsCfg: DevopsChannelConfig,
    ): { group: CustomSummaryChannelGroup; isDevops: boolean; devopsTags: ('pr' | 'grafana' | 'jira')[] } {
        const devopsTags: ('pr' | 'grafana' | 'jira')[] = [];
        if (devopsCfg.prChannelIds.has(id)) devopsTags.push('pr');
        if (devopsCfg.grafanaChannelIds.has(id)) devopsTags.push('grafana');
        if (devopsCfg.jiraChannelIds.has(id)) devopsTags.push('jira');
        const isDevops = !isVoice && (devopsTags.length > 0 || DEVOPS_CHANNEL_NAME_RE.test(name));
        const group: CustomSummaryChannelGroup = isVoice ? 'voice' : isDevops ? 'devops' : 'text';
        return { group, isDevops, devopsTags };
    }

    async listChannels(guildId: string, devopsCfg?: DevopsChannelConfig): Promise<CustomSummaryChannelOption[]> {
        const cfg = devopsCfg ?? (await this.loadDevopsConfig(guildId));
        const guild = this.discord.guild(guildId);
        const byId = new Map<string, CustomSummaryChannelOption & { position: number }>();

        if (guild) {
            for (const channel of guild.channels.cache.values()) {
                const isVoice = VOICE_TYPES.has(channel.type);
                const isText = TEXT_TYPES.has(channel.type);
                if (!isVoice && !isText) continue;
                const { group, isDevops, devopsTags } = this.classifyChannel(channel.id, channel.name, isVoice, cfg);
                byId.set(channel.id, {
                    id: channel.id,
                    name: channel.name,
                    category: channel.parent?.name || 'ไม่มีหมวดหมู่',
                    group,
                    isVoice,
                    isDevops,
                    devopsTags,
                    position: 'rawPosition' in channel ? channel.rawPosition : 0,
                });
            }
        }

        // เพิ่มห้องในประวัติที่อาจถูกลบหรือบอทยังไม่ได้ cache
        const historicalRows = await this.prisma.$queryRaw<{ channel_id: string; channel_name: string | null; has_voice: boolean }[]>`
            SELECT channel_id,
                   MAX(channel_name) AS channel_name,
                   bool_or(event_key IN ('voiceJoin', 'voiceLeave', 'voiceSwitch', 'voiceMoved', 'voiceDisconnected')) AS has_voice
            FROM activity_events
            WHERE guild_id = ${guildId}
              AND channel_id IS NOT NULL
            GROUP BY channel_id
            ORDER BY MAX(created_at) DESC
            LIMIT 250`;

        for (const row of historicalRows) {
            if (byId.has(row.channel_id)) continue;
            const name = row.channel_name || row.channel_id;
            const isVoice = Boolean(row.has_voice);
            const { group, isDevops, devopsTags } = this.classifyChannel(row.channel_id, name, isVoice, cfg);
            byId.set(row.channel_id, {
                id: row.channel_id,
                name,
                category: 'ห้องในประวัติ / ที่ถูกลบ',
                group,
                isVoice,
                isDevops,
                devopsTags,
                historicalOnly: true,
                position: 9999,
            });
        }

        const groupOrder: Record<CustomSummaryChannelGroup, number> = { devops: 0, text: 1, voice: 2 };
        return [...byId.values()]
            .sort((a, b) => groupOrder[a.group] - groupOrder[b.group] || a.category.localeCompare(b.category, 'th') || a.position - b.position || a.name.localeCompare(b.name, 'th'))
            .map(({ position: _position, ...rest }) => rest);
    }

    private resolveRange(request: CustomSummaryRequest, now = new Date()) {
        const to = request.to ?? now;
        const rawFrom = request.from ?? new Date(to.getTime() - (request.hours ?? DEFAULT_RANGE_DAYS * 24) * HOUR_MS);
        const from = new Date(Math.max(rawFrom.getTime(), to.getTime() - MAX_RANGE_DAYS * DAY_MS));
        const cutoff = new Date(Math.min(to.getTime(), now.getTime()));
        const spanHours = Math.max(0, (cutoff.getTime() - from.getTime()) / HOUR_MS);
        const interval: 'hour' | 'day' = request.interval === 'auto' ? (spanHours <= 72 ? 'hour' : 'day') : request.interval;
        return { from, to, cutoff, interval };
    }

    private async guildInfo(guildId: string) {
        const live = this.discord.guild(guildId);
        if (live) return { id: live.id, name: live.name, iconUrl: live.iconURL({ size: 128 }) };
        const row = await this.prisma.guild.findUnique({ where: { id: guildId }, select: { id: true, name: true, iconUrl: true } });
        return { id: guildId, name: row?.name || guildId, iconUrl: row?.iconUrl ?? null };
    }

    private activeVoiceStates(
        guildId: string,
        includeBots: boolean,
        userId?: string,
        userQuery?: string,
    ): ActiveVoiceStateInput[] {
        const guild = this.discord.guild(guildId);
        if (!guild) return [];
        const queryLower = userQuery?.toLowerCase() ?? '';
        const list: ActiveVoiceStateInput[] = [];
        for (const state of guild.voiceStates.cache.values()) {
            if (!state.channelId) continue;
            const member = state.member;
            const isBot = Boolean(member?.user?.bot);
            if (!includeBots && isBot) continue;
            const name = member?.displayName || member?.user?.globalName || member?.user?.username || state.id;
            if (userId && state.id !== userId) continue;
            if (queryLower && state.id !== userQuery && !name.toLowerCase().includes(queryLower) && !(member?.user?.username?.toLowerCase().includes(queryLower))) {
                continue;
            }
            list.push({
                userId: state.id,
                userName: name,
                isBot,
                channelId: state.channelId,
                channelName: state.channel?.name ?? state.channelId,
            });
        }
        return list;
    }

    async buildSummary(guildId: string, request: CustomSummaryRequest): Promise<CustomSummaryResponse> {
        const now = new Date();
        const { from, to, cutoff, interval } = this.resolveRange(request, now);
        const moduleSet = new Set<CustomSummaryModule>(request.modules);
        const hasVoice = moduleSet.has('voice');
        const hasMessages = moduleSet.has('messages');
        const hasPr = moduleSet.has('githubPr');
        const hasDevops = moduleSet.has('devopsOther');

        const [guildInfo, devopsCfg] = await Promise.all([this.guildInfo(guildId), this.loadDevopsConfig(guildId)]);
        const availableChannels = await this.listChannels(guildId, devopsCfg);
        const channelMetaById = new Map(availableChannels.map((ch) => [ch.id, ch]));

        const channelIds = request.channelIds;
        const channelIdSet = channelIds.length ? new Set(channelIds) : null;
        const selectedChannels: CustomSummaryChannelOption[] = channelIds.map(
            (id) =>
                channelMetaById.get(id) ?? {
                    id,
                    name: id,
                    category: 'ไม่ทราบหมวดหมู่',
                    group: 'text',
                    isVoice: false,
                    isDevops: false,
                    devopsTags: [],
                },
        );

        // User filtering snippets
        const botSql = request.includeBots ? Prisma.empty : Prisma.sql` AND is_bot = false`;
        const userIdSql = request.userId ? Prisma.sql` AND user_id = ${request.userId}` : Prisma.empty;
        const userPattern = request.userQuery ? `%${request.userQuery}%` : '';
        const userQuerySql = request.userQuery
            ? Prisma.sql` AND (user_id = ${request.userQuery} OR user_name ILIKE ${userPattern} OR executor_name ILIKE ${userPattern})`
            : Prisma.empty;
        const channelSql = channelIds.length ? Prisma.sql` AND channel_id = ANY(${channelIds}::text[])` : Prisma.empty;

        // Resolve a username hint if the user picked a specific Discord userId (used to match GitHub PR authors if applicable)
        let resolvedUserHint = request.userQuery ?? null;
        if (request.userId) {
            const member = this.discord.guild(guildId)?.members.cache.get(request.userId);
            resolvedUserHint = member?.user.username || member?.user.globalName || resolvedUserHint;
            if (!resolvedUserHint) {
                const sample = await this.prisma.activityEvent.findFirst({
                    where: { guildId, userId: request.userId, userName: { not: null } },
                    select: { userName: true },
                    orderBy: { id: 'desc' },
                });
                resolvedUserHint = sample?.userName ?? null;
            }
        }

        const bucketExpr = Prisma.sql`date_trunc(${Prisma.raw(`'${interval}'`)}, created_at AT TIME ZONE 'Asia/Bangkok')`;

        // 1) Voice Events (fetch lookback 24h before `from` so sessions active across `from` pair cleanly;
        //    fetch across ALL channels first, then filter sessions by channelIds AFTER pairing)
        const voicePromise = hasVoice
            ? this.prisma.$queryRaw<
                  {
                      id: number;
                      event_key: string;
                      user_id: string | null;
                      user_name: string | null;
                      is_bot: boolean;
                      channel_id: string | null;
                      channel_name: string | null;
                      created_at: Date;
                  }[]
              >`
                SELECT id, event_key, user_id, user_name, is_bot, channel_id, channel_name, created_at
                FROM activity_events
                WHERE guild_id = ${guildId}
                  AND created_at >= ${new Date(from.getTime() - VOICE_LOOKBACK_MS)}
                  AND created_at <= ${cutoff}
                  AND event_key = ANY(${[...VOICE_LIFECYCLE_EVENTS]}::text[])
                  AND user_id IS NOT NULL${botSql}${userIdSql}${userQuerySql}
                ORDER BY created_at ASC, id ASC`
            : Promise.resolve([]);

        // 2) Non-voice Activity Series (Messages + DevOps/Server)
        const relevantActivityKeys = [
            ...(hasMessages ? MESSAGE_KEYS : []),
            ...(hasDevops ? DEVOPS_ACTIVITY_KEYS : []),
        ];

        const activitySeriesPromise =
            relevantActivityKeys.length > 0
                ? this.prisma.$queryRaw<{ bucket: string; event_key: string; total: number }[]>`
                    SELECT to_char(${bucketExpr}, 'YYYY-MM-DD HH24:00') AS bucket,
                           event_key,
                           COUNT(*)::int AS total
                    FROM activity_events
                    WHERE guild_id = ${guildId}
                      AND created_at >= ${from}
                      AND created_at <= ${cutoff}
                      AND event_key = ANY(${relevantActivityKeys}::text[])${botSql}${userIdSql}${userQuerySql}${channelSql}
                    GROUP BY 1, 2
                    ORDER BY 1 ASC`
                : Promise.resolve([]);

        const activityChannelPromise =
            relevantActivityKeys.length > 0
                ? this.prisma.$queryRaw<
                      {
                          channel_id: string | null;
                          channel_name: string | null;
                          messages: number;
                          deleted: number;
                          edited: number;
                          other_events: number;
                      }[]
                  >`
                    SELECT channel_id,
                           MAX(channel_name) AS channel_name,
                           COUNT(*) FILTER (WHERE event_key = 'messageSent')::int AS messages,
                           COUNT(*) FILTER (WHERE event_key IN ('messageDelete', 'messageBulkDelete'))::int AS deleted,
                           COUNT(*) FILTER (WHERE event_key = 'messageUpdate')::int AS edited,
                           COUNT(*) FILTER (WHERE event_key NOT IN ('messageSent', 'messageDelete', 'messageUpdate', 'messageBulkDelete'))::int AS other_events
                    FROM activity_events
                    WHERE guild_id = ${guildId}
                      AND created_at >= ${from}
                      AND created_at <= ${cutoff}
                      AND event_key = ANY(${relevantActivityKeys}::text[])${botSql}${userIdSql}${userQuerySql}${channelSql}
                    GROUP BY channel_id`
                : Promise.resolve([]);

        const activityUserPromise =
            relevantActivityKeys.length > 0
                ? this.prisma.$queryRaw<
                      {
                          user_id: string;
                          user_name: string | null;
                          is_bot: boolean;
                          messages: number;
                          commands_used: number;
                          total_events: number;
                          last_seen: Date;
                      }[]
                  >`
                    SELECT user_id,
                           MAX(user_name) AS user_name,
                           bool_or(is_bot) AS is_bot,
                           COUNT(*) FILTER (WHERE event_key = 'messageSent')::int AS messages,
                           COUNT(*) FILTER (WHERE event_key = 'commandUsed')::int AS commands_used,
                           COUNT(*)::int AS total_events,
                           MAX(created_at) AS last_seen
                    FROM activity_events
                    WHERE guild_id = ${guildId}
                      AND created_at >= ${from}
                      AND created_at <= ${cutoff}
                      AND user_id IS NOT NULL
                      AND event_key = ANY(${relevantActivityKeys}::text[])${botSql}${userIdSql}${userQuerySql}${channelSql}
                    GROUP BY user_id`
                : Promise.resolve([]);

        // 3) GitHub PR Notifications joined with PrMessage for repo/channel/author
        const prRowsPromise = hasPr
            ? this.prisma.$queryRaw<
                  {
                      message_id: string;
                      kind: string;
                      created_at: Date;
                      repo_full_name: string | null;
                      pr_number: number | null;
                      channel_id: string | null;
                      pr_author: string | null;
                      pr_title: string | null;
                  }[]
              >`
                SELECT pn.message_id,
                       pn.kind,
                       pn.created_at,
                       pm.repo_full_name,
                       pm.pr_number,
                       pm.channel_id,
                       pm.activity->'pr'->>'author' AS pr_author,
                       pm.activity->'pr'->>'title' AS pr_title
                FROM pr_notifications pn
                LEFT JOIN pr_messages pm
                  ON pm.guild_id = pn.guild_id
                 AND pm.message_id = pn.message_id
                WHERE pn.guild_id = ${guildId}
                  AND pn.kind IN ('sent', 'merged', 'closed')
                  AND pn.created_at >= ${from}
                  AND pn.created_at <= ${cutoff}
                ORDER BY pn.created_at DESC`
            : Promise.resolve([]);

        // 4) Grafana Alerts + Jira Tickets (when devopsOther enabled)
        const grafanaRowsPromise = hasDevops
            ? this.prisma.$queryRaw<{ message_id: string; kind: string; created_at: Date }[]>`
                SELECT message_id, kind, created_at
                FROM pr_notifications
                WHERE guild_id = ${guildId}
                  AND kind IN ('grafana_sent', 'grafana_firing', 'grafana_resolved')
                  AND created_at >= ${from}
                  AND created_at <= ${cutoff}
                ORDER BY created_at DESC`
            : Promise.resolve([]);

        const jiraRowsPromise = hasDevops
            ? this.prisma.jiraTicket.findMany({
                  where: {
                      guildId,
                      OR: [
                          { createdAt: { gte: from, lte: cutoff } },
                          { closedAt: { gte: from, lte: cutoff } },
                      ],
                      ...(request.userId ? { userId: request.userId } : {}),
                      ...(request.userQuery
                          ? {
                                OR: [
                                    { userId: request.userQuery },
                                    { userName: { contains: request.userQuery, mode: 'insensitive' } },
                                ],
                            }
                          : {}),
                  },
                  orderBy: { createdAt: 'desc' },
              })
            : Promise.resolve([]);

        // 5) Detailed log rows from activity_events (only if requested)
        const detailKeys = [
            ...(hasVoice ? VOICE_LIFECYCLE_EVENTS : []),
            ...(hasMessages ? MESSAGE_KEYS : []),
            ...(hasDevops ? DEVOPS_ACTIVITY_KEYS : []),
        ];
        const detailLimit = request.includeDetailedLogs ? request.detailedLogLimit : 0;
        const activityDetailPromise =
            detailLimit > 0 && detailKeys.length > 0
                ? this.prisma.$queryRaw<
                      {
                          id: number;
                          event_key: string;
                          user_id: string | null;
                          user_name: string | null;
                          is_bot: boolean;
                          channel_id: string | null;
                          channel_name: string | null;
                          summary: string | null;
                          created_at: Date;
                      }[]
                  >`
                    SELECT id, event_key, user_id, user_name, is_bot, channel_id, channel_name, summary, created_at
                    FROM activity_events
                    WHERE guild_id = ${guildId}
                      AND created_at >= ${from}
                      AND created_at <= ${cutoff}
                      AND event_key = ANY(${detailKeys}::text[])${botSql}${userIdSql}${userQuerySql}${channelSql}
                    ORDER BY created_at DESC, id DESC
                    LIMIT ${detailLimit + 1}`
                : Promise.resolve([]);

        const [voiceRaw, activitySeries, activityChannels, activityUsers, prRaw, grafanaRaw, jiraRaw, activityDetails] = await Promise.all([
            voicePromise,
            activitySeriesPromise,
            activityChannelPromise,
            activityUserPromise,
            prRowsPromise,
            grafanaRowsPromise,
            jiraRowsPromise,
            activityDetailPromise,
        ]);

        // --- Process Voice Pairing ---
        const voiceInputs: VoiceEventInput[] = voiceRaw.map((row) => ({
            id: row.id,
            eventKey: row.event_key,
            userId: row.user_id,
            userName: row.user_name,
            isBot: row.is_bot,
            channelId: row.channel_id,
            channelName: row.channel_name,
            createdAt: row.created_at,
        }));
        const liveVoiceStates = hasVoice ? this.activeVoiceStates(guildId, request.includeBots, request.userId, request.userQuery) : [];
        const voicePaired = pairVoiceSessions(
            voiceInputs,
            {
                from,
                to,
                now,
                channelIds,
                activeVoiceStates: liveVoiceStates,
            },
            interval,
        );

        // --- Process GitHub PRs (with channel & user filtering) ---
        const prFiltered = prRaw
            .map((row) => {
                const resolvedChannelId = row.channel_id || devopsCfg.prDefaultChannelId || 'pr-default';
                const chMeta = channelMetaById.get(resolvedChannelId);
                return {
                    ...row,
                    resolvedChannelId,
                    channelName: chMeta?.name || (resolvedChannelId === 'pr-default' ? 'ห้องแจ้งเตือน PR' : resolvedChannelId),
                    repoFullName: row.repo_full_name || 'ไม่ระบุ Repository',
                };
            })
            .filter((row) => {
                if (channelIdSet && !channelIdSet.has(row.resolvedChannelId)) return false;
                if (!request.includeBots && row.pr_author && /\[bot\]$/i.test(row.pr_author)) return false;
                if (request.userId || request.userQuery) {
                    const author = (row.pr_author ?? '').toLowerCase();
                    if (!author) return false;
                    const q = (request.userQuery || resolvedUserHint || '').toLowerCase();
                    if (!q || !author.includes(q)) return false;
                }
                return true;
            });

        let prSent = 0;
        let prMerged = 0;
        let prClosed = 0;
        const uniquePrSet = new Set<string>();
        const prByRepoMap = new Map<string, CustomSummaryPrRepoRow>();
        const prByChannelMap = new Map<string, CustomSummaryPrChannelRow>();
        const prByUserMap = new Map<string, number>();

        for (const row of prFiltered) {
            if (row.kind === 'sent') prSent += 1;
            else if (row.kind === 'merged') prMerged += 1;
            else if (row.kind === 'closed') prClosed += 1;

            if (row.pr_number !== null) uniquePrSet.add(`${row.repoFullName}#${row.pr_number}`);
            else uniquePrSet.add(row.message_id);

            const repoKey = `${row.repoFullName}::${row.resolvedChannelId}`;
            const repoEntry = prByRepoMap.get(repoKey) ?? {
                repoFullName: row.repoFullName,
                channelId: row.resolvedChannelId,
                channelName: row.channelName,
                sent: 0,
                merged: 0,
                closed: 0,
                total: 0,
            };
            if (row.kind === 'sent') repoEntry.sent += 1;
            else if (row.kind === 'merged') repoEntry.merged += 1;
            else if (row.kind === 'closed') repoEntry.closed += 1;
            repoEntry.total += 1;
            prByRepoMap.set(repoKey, repoEntry);

            const chEntry = prByChannelMap.get(row.resolvedChannelId) ?? {
                channelId: row.resolvedChannelId,
                channelName: row.channelName,
                sent: 0,
                merged: 0,
                closed: 0,
                total: 0,
            };
            if (row.kind === 'sent') chEntry.sent += 1;
            else if (row.kind === 'merged') chEntry.merged += 1;
            else if (row.kind === 'closed') chEntry.closed += 1;
            chEntry.total += 1;
            prByChannelMap.set(row.resolvedChannelId, chEntry);

            if (row.pr_author) {
                prByUserMap.set(row.pr_author, (prByUserMap.get(row.pr_author) ?? 0) + 1);
            }
        }

        const prTotal = prSent + prMerged + prClosed;
        const prClosedTotal = prMerged + prClosed;
        const mergeRatePercent = prClosedTotal > 0 ? Math.round((prMerged / prClosedTotal) * 100) : prSent > 0 ? Math.round((prMerged / prSent) * 100) : 0;

        // --- Process Grafana Alerts ---
        const matchingGrafanaChannels = channelIdSet
            ? [...devopsCfg.grafanaChannelIds].filter((id) => channelIdSet.has(id))
            : [...devopsCfg.grafanaChannelIds];
        const grafanaPassesFilter = !request.userId && !request.userQuery && (!channelIdSet || matchingGrafanaChannels.length > 0);
        const filteredGrafanaRows = grafanaPassesFilter ? grafanaRaw : [];
        const grafanaPrimaryChannelId = matchingGrafanaChannels[0] || devopsCfg.grafanaDefaultChannelId || 'grafana-default';
        const grafanaPrimaryChannelName =
            channelMetaById.get(grafanaPrimaryChannelId)?.name || (grafanaPrimaryChannelId === 'grafana-default' ? 'ห้องแจ้งเตือน Grafana' : grafanaPrimaryChannelId);

        let grafanaSent = 0;
        let grafanaFiring = 0;
        let grafanaResolved = 0;
        for (const row of filteredGrafanaRows) {
            if (row.kind === 'grafana_sent') grafanaSent += 1;
            else if (row.kind === 'grafana_firing') grafanaFiring += 1;
            else if (row.kind === 'grafana_resolved') grafanaResolved += 1;
        }

        // --- Process Jira Tickets ---
        const filteredJira = jiraRaw.filter((ticket) => {
            if (!channelIdSet) return true;
            if (ticket.channelId && channelIdSet.has(ticket.channelId)) return true;
            if (devopsCfg.jiraLogChannelId && channelIdSet.has(devopsCfg.jiraLogChannelId)) return true;
            if (devopsCfg.jiraPanelChannelId && channelIdSet.has(devopsCfg.jiraPanelChannelId)) return true;
            return false;
        });

        let jiraCreated = 0;
        let jiraIssueCreated = 0;
        let jiraClosed = 0;
        const jiraPerChannel = new Map<string, number>();
        const jiraPerUser = new Map<string, { userName: string; count: number }>();

        for (const ticket of filteredJira) {
            if (ticket.createdAt >= from && ticket.createdAt <= cutoff) {
                jiraCreated += 1;
                if (ticket.issueKey) jiraIssueCreated += 1;
                const chId = ticket.channelId || devopsCfg.jiraLogChannelId || devopsCfg.jiraPanelChannelId || 'jira-default';
                jiraPerChannel.set(chId, (jiraPerChannel.get(chId) ?? 0) + 1);
                const usr = jiraPerUser.get(ticket.userId) ?? { userName: ticket.userName, count: 0 };
                usr.count += 1;
                jiraPerUser.set(ticket.userId, usr);
            }
            if (ticket.closedAt && ticket.closedAt >= from && ticket.closedAt <= cutoff) {
                jiraClosed += 1;
            }
        }

        // --- Process Messages & Member Activity KPIs ---
        let totalMessagesSent = 0;
        let totalMessagesDeleted = 0;
        let totalMessagesEdited = 0;
        let busiestChannel: { channelId: string; channelName: string; count: number } | null = null;
        for (const ch of activityChannels) {
            totalMessagesSent += ch.messages;
            totalMessagesDeleted += ch.deleted;
            totalMessagesEdited += ch.edited;
            if (ch.channel_id && ch.messages > (busiestChannel?.count ?? 0)) {
                busiestChannel = {
                    channelId: ch.channel_id,
                    channelName: channelMetaById.get(ch.channel_id)?.name || ch.channel_name || ch.channel_id,
                    count: ch.messages,
                };
            }
        }

        let memberJoin = 0;
        let memberLeave = 0;
        let commandsUsed = 0;
        for (const row of activitySeries) {
            if (SERVER_JOIN_KEYS.includes(row.event_key)) memberJoin += row.total;
            else if (SERVER_LEAVE_KEYS.includes(row.event_key)) memberLeave += row.total;
            else if (row.event_key === 'commandUsed') commandsUsed += row.total;
        }

        // --- Build Unified Timeline ---
        const buckets = buildBangkokBuckets(from.getTime(), cutoff.getTime(), interval);
        const timelineMap = new Map<string, CustomSummaryTimelinePoint>(
            buckets.map((bucket) => [
                bucket,
                {
                    bucket,
                    label: bangkokBucketLabel(bucket, interval),
                    messages: 0,
                    voiceJoins: 0,
                    voiceLeaves: 0,
                    voiceMinutes: 0,
                    prSent: 0,
                    prMerged: 0,
                    prClosed: 0,
                    grafanaAlerts: 0,
                    jiraCards: 0,
                    memberJoin: 0,
                    memberLeave: 0,
                },
            ]),
        );

        for (const [bucket, ms] of voicePaired.bucketMs.entries()) {
            const point = timelineMap.get(bucket);
            if (point) point.voiceMinutes += Math.round(ms / 60_000);
        }
        for (const ev of voiceInputs) {
            const at = ev.createdAt instanceof Date ? ev.createdAt.getTime() : new Date(ev.createdAt).getTime();
            if (at < from.getTime() || at > cutoff.getTime()) continue;
            if (channelIdSet && (!ev.channelId || !channelIdSet.has(ev.channelId))) continue;
            const point = timelineMap.get(bangkokBucketKey(at, interval));
            if (!point) continue;
            if (ev.eventKey === 'voiceJoin') point.voiceJoins += 1;
            else if (ev.eventKey === 'voiceLeave' || ev.eventKey === 'voiceDisconnected') point.voiceLeaves += 1;
        }
        for (const row of activitySeries) {
            const point = timelineMap.get(row.bucket);
            if (!point) continue;
            if (row.event_key === 'messageSent') point.messages += row.total;
            else if (SERVER_JOIN_KEYS.includes(row.event_key)) point.memberJoin += row.total;
            else if (SERVER_LEAVE_KEYS.includes(row.event_key)) point.memberLeave += row.total;
        }
        for (const row of prFiltered) {
            const point = timelineMap.get(bangkokBucketKey(row.created_at.getTime(), interval));
            if (!point) continue;
            if (row.kind === 'sent') point.prSent += 1;
            else if (row.kind === 'merged') point.prMerged += 1;
            else if (row.kind === 'closed') point.prClosed += 1;
        }
        for (const row of filteredGrafanaRows) {
            if (row.kind !== 'grafana_sent') continue;
            const point = timelineMap.get(bangkokBucketKey(row.created_at.getTime(), interval));
            if (point) point.grafanaAlerts += 1;
        }
        for (const ticket of filteredJira) {
            if (ticket.createdAt >= from && ticket.createdAt <= cutoff) {
                const point = timelineMap.get(bangkokBucketKey(ticket.createdAt.getTime(), interval));
                if (point) point.jiraCards += 1;
            }
        }

        // --- Channel Breakdown Table ---
        const channelRowsMap = new Map<string, CustomSummaryChannelRow>();
        const ensureChannelRow = (id: string, fallbackName?: string | null): CustomSummaryChannelRow => {
            const existing = channelRowsMap.get(id);
            if (existing) return existing;
            const meta = channelMetaById.get(id);
            const row: CustomSummaryChannelRow = {
                channelId: id,
                channelName: meta?.name || fallbackName || id,
                kind: meta?.group ?? 'text',
                messages: 0,
                voiceSeconds: 0,
                voiceMinutes: 0,
                voiceJoins: 0,
                voiceLeaves: 0,
                prEvents: 0,
                grafanaAlerts: 0,
                jiraCards: 0,
                otherEvents: 0,
                totalActivity: 0,
            };
            channelRowsMap.set(id, row);
            return row;
        };

        for (const vc of voicePaired.byChannel) {
            const row = ensureChannelRow(vc.channelId, vc.channelName);
            row.kind = 'voice';
            row.voiceSeconds += vc.totalSeconds;
            row.voiceMinutes += vc.totalMinutes;
            row.voiceJoins += vc.joins;
            row.voiceLeaves += vc.leaves;
        }
        for (const ac of activityChannels) {
            const id = ac.channel_id || 'server-wide';
            const row = ensureChannelRow(id, id === 'server-wide' ? 'ระดับเซิร์ฟเวอร์ (ไม่ระบุห้อง)' : ac.channel_name);
            row.messages += ac.messages;
            row.otherEvents += ac.deleted + ac.edited + ac.other_events;
        }
        for (const prCh of prByChannelMap.values()) {
            const row = ensureChannelRow(prCh.channelId, prCh.channelName);
            row.kind = 'devops';
            row.prEvents += prCh.total;
        }
        if (grafanaSent > 0) {
            const row = ensureChannelRow(grafanaPrimaryChannelId, grafanaPrimaryChannelName);
            row.kind = 'devops';
            row.grafanaAlerts += grafanaSent;
        }
        for (const [chId, count] of jiraPerChannel.entries()) {
            const row = ensureChannelRow(chId, chId === 'jira-default' ? 'ห้อง Jira Ticket' : chId);
            if (row.kind !== 'voice') row.kind = 'devops';
            row.jiraCards += count;
        }

        const channelBreakdown = [...channelRowsMap.values()]
            .map((row) => ({
                ...row,
                totalActivity: row.messages + row.voiceJoins + row.prEvents + row.grafanaAlerts + row.jiraCards + row.otherEvents,
            }))
            .sort((a, b) => b.voiceSeconds - a.voiceSeconds || b.messages - a.messages || b.totalActivity - a.totalActivity);

        // --- Top Contributors Table (merging Voice, Messages/Commands, Jira, and matched GitHub PR authors) ---
        const contributorMap = new Map<string, CustomSummaryContributorRow>();
        const nameToUserId = new Map<string, string>();
        const guildMembers = this.discord.guild(guildId)?.members.cache;
        if (guildMembers) {
            for (const m of guildMembers.values()) {
                nameToUserId.set(m.user.username.toLowerCase(), m.id);
                if (m.user.globalName) nameToUserId.set(m.user.globalName.toLowerCase(), m.id);
                if (m.nickname) nameToUserId.set(m.nickname.toLowerCase(), m.id);
            }
        }

        const ensureContributor = (userId: string, userName: string, isBot = false): CustomSummaryContributorRow => {
            const existing = contributorMap.get(userId);
            if (existing) {
                if (existing.userName === userId && userName) existing.userName = userName;
                existing.isBot ||= isBot;
                return existing;
            }
            const created: CustomSummaryContributorRow = {
                userId,
                userName: userName || userId,
                isBot,
                voiceSeconds: 0,
                voiceMinutes: 0,
                voiceSessions: 0,
                voiceJoins: 0,
                messages: 0,
                prActivity: 0,
                jiraTickets: 0,
                commandsUsed: 0,
                totalScore: 0,
                lastSeen: null,
            };
            contributorMap.set(userId, created);
            return created;
        };

        for (const vu of voicePaired.byUser) {
            const row = ensureContributor(vu.userId, vu.userName, vu.isBot);
            row.voiceSeconds += vu.totalSeconds;
            row.voiceMinutes += vu.totalMinutes;
            row.voiceSessions += vu.sessions;
            row.voiceJoins += vu.joins;
            nameToUserId.set(row.userName.toLowerCase(), vu.userId);
        }

        for (const au of activityUsers) {
            const row = ensureContributor(au.user_id, au.user_name || au.user_id, au.is_bot);
            row.messages += au.messages;
            row.commandsUsed += au.commands_used;
            const iso = au.last_seen.toISOString();
            if (!row.lastSeen || iso > row.lastSeen) row.lastSeen = iso;
            if (au.user_name) nameToUserId.set(au.user_name.toLowerCase(), au.user_id);
        }

        for (const [userId, jira] of jiraPerUser.entries()) {
            const row = ensureContributor(userId, jira.userName, false);
            row.jiraTickets += jira.count;
        }

        for (const [author, count] of prByUserMap.entries()) {
            const matchedId = nameToUserId.get(author.toLowerCase()) ?? `github:${author}`;
            const row = ensureContributor(matchedId, matchedId.startsWith('github:') ? `${author} (GitHub)` : author, false);
            row.prActivity += count;
        }

        const topContributors = [...contributorMap.values()]
            .map((row) => ({
                ...row,
                totalScore: row.voiceMinutes + row.messages + row.prActivity * 5 + row.jiraTickets * 3 + row.commandsUsed,
            }))
            .sort((a, b) => b.totalScore - a.totalScore || b.voiceSeconds - a.voiceSeconds || b.messages - a.messages)
            .slice(0, 50);

        const activeDiscordUsers = new Set(
            [...contributorMap.values()].filter((c) => !c.userId.startsWith('github:')).map((c) => c.userId),
        ).size;

        // --- Detailed Logs (optional tail table for UI & Full Detailed PDF) ---
        let detailedLogs: CustomSummaryLogRow[] = [];
        let detailedLogsTruncated = false;

        if (request.includeDetailedLogs) {
            const rows: CustomSummaryLogRow[] = [];
            if (activityDetails.length > detailLimit) detailedLogsTruncated = true;
            for (const ev of activityDetails.slice(0, detailLimit)) {
                const { label } = activityEventLabel(ev.event_key);
                rows.push({
                    id: `act-${ev.id}`,
                    createdAt: ev.created_at.toISOString(),
                    source: 'activity',
                    eventKey: ev.event_key,
                    eventLabel: label,
                    userId: ev.user_id,
                    userName: ev.user_name,
                    isBot: ev.is_bot,
                    channelId: ev.channel_id,
                    channelName: ev.channel_id ? channelMetaById.get(ev.channel_id)?.name || ev.channel_name || ev.channel_id : ev.channel_name,
                    summary: ev.summary || label,
                });
            }

            if (prFiltered.length > detailLimit) detailedLogsTruncated = true;
            for (const pr of prFiltered.slice(0, detailLimit)) {
                const label = pr.kind === 'merged' ? 'PR Merged' : pr.kind === 'closed' ? 'PR Closed' : 'PR แจ้งเตือน';
                rows.push({
                    id: `pr-${pr.message_id}-${pr.kind}`,
                    createdAt: pr.created_at.toISOString(),
                    source: 'pr',
                    eventKey: `pr_${pr.kind}`,
                    eventLabel: label,
                    userId: null,
                    userName: pr.pr_author ? `@${pr.pr_author}` : 'GitHub',
                    isBot: false,
                    channelId: pr.resolvedChannelId,
                    channelName: pr.channelName,
                    summary: `${pr.repoFullName}${pr.pr_number ? ` #${pr.pr_number}` : ''} ${pr.pr_title ?? ''}`.trim(),
                });
            }

            for (const g of filteredGrafanaRows.filter((r) => r.kind !== 'grafana_sent').slice(0, detailLimit)) {
                const isFiring = g.kind === 'grafana_firing';
                rows.push({
                    id: `graf-${g.message_id}-${g.kind}`,
                    createdAt: g.created_at.toISOString(),
                    source: 'grafana',
                    eventKey: g.kind,
                    eventLabel: isFiring ? 'Grafana Firing' : 'Grafana Resolved',
                    userId: null,
                    userName: 'Grafana Alertmanager',
                    isBot: true,
                    channelId: grafanaPrimaryChannelId,
                    channelName: grafanaPrimaryChannelName,
                    summary: isFiring ? 'ส่งแจ้งเตือน Alert สถานะ Firing' : 'ส่งแจ้งเตือน Alert สถานะ Resolved',
                });
            }

            for (const j of filteredJira.slice(0, detailLimit)) {
                rows.push({
                    id: `jira-${j.id}`,
                    createdAt: j.createdAt.toISOString(),
                    source: 'jira',
                    eventKey: j.issueKey ? 'jiraCardCreated' : 'jiraTicketOpened',
                    eventLabel: j.issueKey ? `Jira ${j.issueKey}` : 'เปิดห้อง Jira Ticket',
                    userId: j.userId,
                    userName: j.userName,
                    isBot: false,
                    channelId: j.channelId,
                    channelName: j.channelId ? channelMetaById.get(j.channelId)?.name || j.channelId : null,
                    summary: [j.issueType, j.title, j.closedAt ? '(ปิดแล้ว)' : '(เปิดอยู่)'].filter(Boolean).join(' · ') || 'Jira Card',
                });
            }

            rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            if (rows.length > detailLimit) detailedLogsTruncated = true;
            detailedLogs = rows.slice(0, detailLimit);
        }

        const totalEvents =
            (hasVoice ? voicePaired.totals.joins + voicePaired.totals.leaves + voicePaired.totals.switches : 0) +
            (hasMessages ? totalMessagesSent + totalMessagesDeleted + totalMessagesEdited : 0) +
            (hasPr ? prTotal : 0) +
            (hasDevops ? grafanaSent + jiraCreated + memberJoin + memberLeave + commandsUsed : 0);

        return {
            guild: guildInfo,
            range: {
                from: from.toISOString(),
                to: to.toISOString(),
                cutoff: cutoff.toISOString(),
                interval,
                timeZone: 'Asia/Bangkok',
            },
            filters: {
                channelIds,
                selectedChannels,
                modules: request.modules,
                userId: request.userId ?? null,
                userQuery: request.userQuery ?? null,
                includeBots: request.includeBots,
            },
            availableChannels,
            kpis: {
                voice: {
                    totalSeconds: voicePaired.totals.totalSeconds,
                    totalMinutes: voicePaired.totals.totalMinutes,
                    joins: voicePaired.totals.joins,
                    leaves: voicePaired.totals.leaves,
                    switches: voicePaired.totals.switches,
                    sessions: voicePaired.totals.sessions,
                    avgSessionMinutes: voicePaired.totals.avgSessionMinutes,
                    activeAtCutoffCount: voicePaired.totals.activeAtCutoffCount,
                },
                messages: {
                    totalSent: totalMessagesSent,
                    deleted: totalMessagesDeleted,
                    edited: totalMessagesEdited,
                    busiestChannel,
                },
                githubPr: {
                    totalNotifications: prTotal,
                    openedOrUpdated: prSent,
                    merged: prMerged,
                    closed: prClosed,
                    mergeRatePercent,
                    uniquePrCount: uniquePrSet.size,
                },
                devopsOther: {
                    grafanaSent,
                    grafanaFiring,
                    grafanaResolved,
                    jiraCreated,
                    jiraIssueCreated,
                    jiraClosed,
                    memberJoin,
                    memberLeave,
                    netMembers: memberJoin - memberLeave,
                    commandsUsed,
                },
                activeUsers: activeDiscordUsers,
                totalEvents,
            },
            timeline: [...timelineMap.values()],
            voiceChannels: voicePaired.byChannel.map(({ totalMs: _totalMs, switches: _switches, ...rest }) => rest),
            prBreakdown: {
                byRepo: [...prByRepoMap.values()].sort((a, b) => b.total - a.total),
                byChannel: [...prByChannelMap.values()].sort((a, b) => b.total - a.total),
            },
            channelBreakdown,
            topContributors,
            detailedLogs,
            detailedLogsTruncated,
            generatedAt: now.toISOString(),
        };
    }
}
