import { Injectable } from '@nestjs/common';
import {
    RELATION_CHAT_WINDOW_MINUTES,
    relationKind,
    relationScore,
    relationTier,
    type RelationBoard,
    type RelationHistoryPage,
    type RelationLinkDetail,
    type RelationPerson,
    type RelationRole,
    type RelationTimelineItem,
} from '@notstack/shared';
import type { GuildMember, Role } from 'discord.js';
import { mapConcurrent } from '../common/utils/map-concurrent';
import { DiscordService } from '../discord/discord.service';
import { Prisma } from '../generated/prisma/client';
import { ActivityService } from '../log-manager/services/activity.service';
import { activityEventLabel } from '../log-manager/utils/activity-humanize.util';
import { VOICE_KEYS } from '../log-manager/utils/activity-stats.util';
import { PrismaService } from '../prisma/prisma.service';
import {
    buildVoiceSessions,
    createLink,
    forEachVoiceOverlap,
    groupChatExchanges,
    pairKey,
    resolveStatus,
    type MembershipEvent,
    type VoiceEvent,
} from './relations.util';

const DAY_MS = 86_400_000;
const MAX_PEOPLE = 200; // มากกว่านี้กระดานอ่านไม่รู้เรื่องและลาก/ซูมไม่ลื่น
const MAX_LINKS = 500;
const MAX_VOICE_ROWS = 100_000;
const MAX_CHAT_ROWS = 20_000;
const MAX_TIMELINE = 300;
const DISCORD_LOOKUPS = 5;
const MEMBER_CHUNK = 100; // จำนวน user id สูงสุดต่อคำขอของ Discord gateway
const MEMBER_FETCH_MS = 8_000;

const MOD_KEYS = [
    'memberBan',
    'memberUnban',
    'memberKick',
    'memberTimeout',
    'nicknameUpdate',
    'roleGiven',
    'roleRemoved',
    'voiceMoved',
    'voiceDisconnected',
    'messageDelete',
];
const MEMBERSHIP_KEYS = ['memberJoin', 'memberLeave', 'memberKick', 'memberBan', 'memberUnban'];

const CHAT_WINDOW = Prisma.raw(`interval '${RELATION_CHAT_WINDOW_MINUTES} minutes'`);
const botFilter = (includeBots: boolean) => (includeBots ? Prisma.empty : Prisma.sql` AND is_bot = false`);

interface Range {
    guildId: string;
    from: Date;
    to: Date;
    includeBots: boolean;
}

interface Tally {
    voiceMs: number;
    chatExchanges: number;
    modActions: number;
}

// ==========================================
// 🕵️ RELATIONS — รวม activity_events เป็นคนและเส้นความสัมพันธ์สำหรับหน้ากระดานนักสืบ
// ==========================================
@Injectable()
export class RelationsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly discord: DiscordService,
        private readonly activity: ActivityService,
    ) {}

    private range(guildId: string, days: number, includeBots: boolean): Range {
        const to = new Date();
        return { guildId, from: new Date(to.getTime() - days * DAY_MS), to, includeBots };
    }

    private async voiceEvents({ guildId, from, to, includeBots }: Range, userIds?: string[]): Promise<VoiceEvent[]> {
        const rows = await this.prisma.activityEvent.findMany({
            where: {
                guildId,
                eventKey: { in: VOICE_KEYS },
                createdAt: { gte: from, lte: to },
                channelId: { not: null },
                userId: userIds ? { in: userIds } : { not: null },
                ...(includeBots ? {} : { isBot: false }),
            },
            select: { eventKey: true, userId: true, channelId: true, channelName: true, createdAt: true },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: MAX_VOICE_ROWS,
        });
        return rows.map((row) => ({
            eventKey: row.eventKey,
            userId: row.userId!,
            channelId: row.channelId!,
            channelName: row.channelName,
            at: row.createdAt.getTime(),
        }));
    }

    private peopleRows({ guildId, from, to, includeBots }: Range) {
        return this.prisma.$queryRaw<{ user_id: string; user_name: string | null; is_bot: boolean; events: number; last_seen: Date }[]>`
            SELECT user_id, MAX(user_name) AS user_name, bool_or(is_bot) AS is_bot, COUNT(*)::int AS events, MAX(created_at) AS last_seen
            FROM activity_events
            WHERE guild_id = ${guildId}
              AND created_at >= ${from}
              AND created_at <= ${to}
              AND user_id IS NOT NULL${botFilter(includeBots)}
            GROUP BY user_id`;
    }

    // คนสองคนส่งข้อความต่อกันในห้องเดียวกันภายในช่วงเวลาสั้นๆ
    private chatPairs({ guildId, from, to }: Range) {
        return this.prisma.$queryRaw<{ a: string; b: string; total: number }[]>`
            SELECT LEAST(user_id, previous_user) AS a, GREATEST(user_id, previous_user) AS b, COUNT(*)::int AS total
            FROM (
                SELECT user_id, created_at,
                       LAG(user_id) OVER channel_order AS previous_user,
                       LAG(created_at) OVER channel_order AS previous_at
                FROM activity_events
                WHERE guild_id = ${guildId}
                  AND event_key = 'messageSent'
                  AND created_at >= ${from}
                  AND created_at <= ${to}
                  AND user_id IS NOT NULL
                  AND channel_id IS NOT NULL
                WINDOW channel_order AS (PARTITION BY channel_id ORDER BY created_at, id)
            ) messages
            WHERE previous_user IS NOT NULL
              AND previous_user <> user_id
              AND created_at - previous_at <= ${CHAT_WINDOW}
            GROUP BY 1, 2`;
    }

    private modRows({ guildId, from, to }: Range) {
        return this.prisma.$queryRaw<{ executor_id: string; executor_name: string | null; user_id: string; total: number }[]>`
            SELECT executor_id, MAX(executor_name) AS executor_name, user_id, COUNT(*)::int AS total
            FROM activity_events
            WHERE guild_id = ${guildId}
              AND created_at >= ${from}
              AND created_at <= ${to}
              AND executor_id IS NOT NULL
              AND user_id IS NOT NULL
              AND executor_id <> user_id
              AND event_key = ANY(${MOD_KEYS}::text[])
            GROUP BY executor_id, user_id`;
    }

    private async membershipEvents(guildId: string, userIds: string[]): Promise<Map<string, MembershipEvent[]>> {
        const rows = await this.prisma.activityEvent.findMany({
            where: { guildId, eventKey: { in: MEMBERSHIP_KEYS }, userId: { in: userIds } },
            select: { userId: true, eventKey: true, createdAt: true },
        });
        const byUser = new Map<string, MembershipEvent[]>();
        for (const row of rows) {
            const events = byUser.get(row.userId!) ?? [];
            events.push({ eventKey: row.eventKey, at: row.createdAt });
            byUser.set(row.userId!, events);
        }
        return byUser;
    }

    // members.cache มีเฉพาะคนที่ยังอยู่ — คนที่ไม่อยู่ใน cache ต้องถาม Discord ก่อนจึงจะกากบาทได้
    private async lookupMembers(guildId: string, userIds: string[]): Promise<{ members: Map<string, GuildMember>; complete: boolean }> {
        const guild = this.discord.guild(guildId);
        const members = new Map<string, GuildMember>();
        if (!guild) return { members, complete: false };
        const missing: string[] = [];
        for (const userId of userIds) {
            const member = guild.members.cache.get(userId);
            if (member) members.set(userId, member);
            else missing.push(userId);
        }
        let complete = true;
        for (let i = 0; i < missing.length; i += MEMBER_CHUNK) {
            try {
                const found = await guild.members.fetch({ user: missing.slice(i, i + MEMBER_CHUNK), time: MEMBER_FETCH_MS });
                for (const [userId, member] of found) members.set(userId, member);
            } catch {
                complete = false;
            }
        }
        return { members, complete };
    }

    private async buildPeople(
        guildId: string,
        candidates: { userId: string; name: string | null; isBot: boolean; events: number; lastSeen: Date | null }[],
    ): Promise<{ people: RelationPerson[]; rolesById: Map<string, Role> }> {
        const userIds = candidates.map((person) => person.userId);
        const [{ members, complete }, membership] = await Promise.all([this.lookupMembers(guildId, userIds), this.membershipEvents(guildId, userIds)]);
        const formerUsers = new Map(
            await mapConcurrent(
                userIds.filter((userId) => !members.has(userId)),
                DISCORD_LOOKUPS,
                async (userId) => [userId, await this.discord.fetchUser(userId)] as const,
            ),
        );
        const rolesById = new Map<string, Role>();
        const people = candidates.map((person) => {
            const member = members.get(person.userId);
            const roles = member ? [...member.roles.cache.values()].filter((role) => role.id !== guildId).sort((a, b) => b.comparePositionTo(a)) : [];
            for (const role of roles) rolesById.set(role.id, role);
            const user = member?.user ?? formerUsers.get(person.userId) ?? null;
            return {
                userId: person.userId,
                name: member?.displayName || user?.globalName || user?.username || person.name || person.userId,
                avatarUrl: member?.displayAvatarURL({ size: 128 }) ?? user?.displayAvatarURL({ size: 128 }) ?? null,
                isBot: user?.bot ?? person.isBot,
                roleIds: roles.map((role) => role.id),
                ...resolveStatus(member ? true : complete ? false : null, membership.get(person.userId) ?? []),
                events: person.events,
                lastSeen: person.lastSeen ? new Date(person.lastSeen).toISOString() : null,
            };
        });
        return { people, rolesById };
    }

    async board(guildId: string, days: number, includeBots: boolean): Promise<RelationBoard> {
        const range = this.range(guildId, days, includeBots);
        const [peopleRows, chatRows, modRows, voiceEvents] = await Promise.all([
            this.peopleRows(range),
            this.chatPairs(range),
            this.modRows(range),
            this.voiceEvents(range),
        ]);

        const tallies = new Map<string, Tally & { a: string; b: string }>();
        const tally = (a: string, b: string) => {
            const key = pairKey(a, b);
            let entry = tallies.get(key);
            if (!entry) tallies.set(key, (entry = { a, b, voiceMs: 0, chatExchanges: 0, modActions: 0 }));
            return entry;
        };
        forEachVoiceOverlap(buildVoiceSessions(voiceEvents, range.to.getTime()), ({ a, b, start, end }) => {
            tally(a, b).voiceMs += end - start;
        });
        for (const row of chatRows) tally(row.a, row.b).chatExchanges += Number(row.total);
        for (const row of modRows) tally(row.executor_id, row.user_id).modActions += Number(row.total);

        const links = [...tallies.values()]
            .map((entry) =>
                createLink(entry.a, entry.b, {
                    voiceMinutes: Math.round(entry.voiceMs / 60_000),
                    chatExchanges: entry.chatExchanges,
                    modActions: entry.modActions,
                }),
            )
            .filter((link) => link.score > 0);

        const candidates = new Map(
            peopleRows.map((row) => [
                row.user_id,
                { userId: row.user_id, name: row.user_name, isBot: row.is_bot, events: Number(row.events), lastSeen: row.last_seen as Date | null },
            ]),
        );
        // ผู้ลงมือบางคนไม่เคยเป็นเจ้าของเหตุการณ์ในช่วงนี้ แต่ต้องมีตัวตนบนกระดาน
        for (const row of modRows) {
            if (!candidates.has(row.executor_id))
                candidates.set(row.executor_id, { userId: row.executor_id, name: row.executor_name, isBot: false, events: 0, lastSeen: null });
        }
        const weight = new Map<string, number>();
        for (const link of links) {
            weight.set(link.a, (weight.get(link.a) ?? 0) + link.score);
            weight.set(link.b, (weight.get(link.b) ?? 0) + link.score);
        }
        const ranked = [...candidates.values()].sort((x, y) => (weight.get(y.userId) ?? 0) - (weight.get(x.userId) ?? 0) || y.events - x.events);
        const { people: resolved, rolesById } = await this.buildPeople(guildId, ranked.slice(0, MAX_PEOPLE));
        const people = includeBots ? resolved : resolved.filter((person) => !person.isBot);
        const usedRoles = new Set(people.flatMap((person) => person.roleIds));
        const roles: RelationRole[] = [...rolesById.values()]
            .filter((role) => usedRoles.has(role.id))
            .sort((a, b) => b.comparePositionTo(a))
            .map((role) => ({ id: role.id, name: role.name, color: role.hexColor === '#000000' ? null : role.hexColor }));
        const onBoard = new Set(people.map((person) => person.userId));

        return {
            from: range.from.toISOString(),
            to: range.to.toISOString(),
            people,
            roles,
            links: links
                .filter((link) => onBoard.has(link.a) && onBoard.has(link.b))
                .sort((x, y) => y.score - x.score)
                .slice(0, MAX_LINKS),
            hiddenPeople: Math.max(0, ranked.length - MAX_PEOPLE),
        };
    }

    private chatExchanges({ guildId, from, to }: Range, a: string, b: string) {
        return this.prisma.$queryRaw<{ created_at: Date; channel_id: string; channel_name: string | null }[]>`
            SELECT created_at, channel_id, channel_name
            FROM (
                SELECT user_id, created_at, channel_id, channel_name,
                       LAG(user_id) OVER channel_order AS previous_user,
                       LAG(created_at) OVER channel_order AS previous_at
                FROM activity_events
                WHERE guild_id = ${guildId}
                  AND event_key = 'messageSent'
                  AND created_at >= ${from}
                  AND created_at <= ${to}
                  AND user_id IS NOT NULL
                  AND channel_id IS NOT NULL
                WINDOW channel_order AS (PARTITION BY channel_id ORDER BY created_at, id)
            ) messages
            WHERE ((user_id = ${a} AND previous_user = ${b}) OR (user_id = ${b} AND previous_user = ${a}))
              AND created_at - previous_at <= ${CHAT_WINDOW}
            ORDER BY created_at DESC
            LIMIT ${MAX_CHAT_ROWS}`;
    }

    async linkDetail(guildId: string, a: string, b: string, days: number): Promise<RelationLinkDetail> {
        const range = this.range(guildId, days, true);
        const [voiceEvents, chatRows, modRows] = await Promise.all([
            this.voiceEvents(range, [a, b]),
            this.chatExchanges(range, a, b),
            this.prisma.activityEvent.findMany({
                where: {
                    guildId,
                    eventKey: { in: MOD_KEYS },
                    createdAt: { gte: range.from, lte: range.to },
                    OR: [
                        { executorId: a, userId: b },
                        { executorId: b, userId: a },
                    ],
                },
                orderBy: { id: 'desc' },
                take: MAX_TIMELINE,
            }),
        ]);

        const timeline: RelationTimelineItem[] = [];
        let voiceMs = 0;
        forEachVoiceOverlap(buildVoiceSessions(voiceEvents, range.to.getTime()), ({ channelName, start, end }) => {
            voiceMs += end - start;
            timeline.push({
                type: 'voice',
                at: new Date(start).toISOString(),
                endAt: new Date(end).toISOString(),
                minutes: Math.max(1, Math.round((end - start) / 60_000)),
                channelName,
            });
        });
        for (const group of groupChatExchanges(
            chatRows.map((row) => ({ at: new Date(row.created_at), channelId: row.channel_id, channelName: row.channel_name })),
        )) {
            timeline.push({ type: 'chat', at: group.at.toISOString(), exchanges: group.exchanges, channelName: group.channelName });
        }
        for (const row of modRows) {
            timeline.push({
                type: 'mod',
                at: row.createdAt.toISOString(),
                label: activityEventLabel(row.eventKey).label,
                actorId: row.executorId!,
                actorName: row.executorName,
                targetName: row.userName,
                summary: row.summary,
            });
        }
        timeline.sort((x, y) => y.at.localeCompare(x.at));

        const counts = { voiceMinutes: Math.round(voiceMs / 60_000), chatExchanges: chatRows.length, modActions: modRows.length };
        const score = relationScore(counts);
        return {
            ...(a < b ? { a, b } : { a: b, b: a }),
            ...counts,
            score,
            kind: relationKind(counts),
            tier: relationTier(score),
            timeline: timeline.slice(0, MAX_TIMELINE),
            truncated: timeline.length > MAX_TIMELINE,
        };
    }

    // ทุกเหตุการณ์ที่คนนี้เป็นเจ้าของหรือเป็นผู้ลงมือ ย้อนหลังเท่าที่ฐานข้อมูลเก็บไว้
    history(guildId: string, userId: string, cursor?: number): Promise<RelationHistoryPage> {
        return this.activity.query({ guildId, participantId: userId, includeBots: true, cursor, limit: 40 });
    }
}
