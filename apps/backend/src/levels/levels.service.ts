import fs from 'node:fs';
import path from 'node:path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
    defaultXpSettings,
    levelForXp,
    isSnowflake,
    matchingXpRules,
    MAX_XP,
    rollXp,
    xpSettingsSchema,
    type LevelPage,
    type LevelQuery,
    type LevelRow,
    type XpContext,
    type XpHistoryPage,
    type XpMemberMutation,
    type XpMemberMutationResult,
    type XpResetGuildResult,
    type XpSettingsResponse,
} from '@notstack/shared';
import type { Message } from 'discord.js';
import { badRequest, conflict } from '../common/exceptions/api.exception';
import { REPO_ROOT } from '../config/paths';
import { DiscordService } from '../discord/discord.service';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;
const dayInBangkok = (now: Date): string => new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);

@Injectable()
export class LevelsService implements OnModuleInit {
    private readonly logger = new Logger('Levels');
    private loaded = false;
    constructor(
        private readonly prisma: PrismaService,
        private readonly discord: DiscordService,
    ) {}

    async onModuleInit(): Promise<void> {
        const file = path.join(REPO_ROOT, 'levels.json');
        if (fs.existsSync(file)) {
            const data = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, { xp: number }>;
            const settings = defaultXpSettings();
            await this.prisma.level.createMany({
                data: Object.entries(data).map(([userId, d]) => {
                    if (!Number.isInteger(d.xp) || d.xp < 0 || d.xp > MAX_XP) throw new Error(`Invalid legacy XP for ${userId}`);
                    return { guildId: this.discord.homeGuildId, userId, xp: d.xp, level: levelForXp(d.xp, settings) };
                }),
                skipDuplicates: true,
            });
            fs.renameSync(file, path.join(REPO_ROOT, 'levels_migrated.json'));
        }
        this.loaded = true;
    }
    isLoaded(): boolean {
        return this.loaded;
    }

    // All XP/config mutations share a PostgreSQL transaction lock per guild.
    // No buffered absolute writes; concurrent awards/admin edits cannot overwrite one another.
    private locked<T>(guildId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
        return this.prisma.$transaction(
            async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`xp:${guildId}`}))`;
                return work(tx);
            },
            { timeout: 15000 },
        );
    }
    private async readSettings(db: Pick<Tx, 'xpSetting'>, guildId: string): Promise<XpSettingsResponse> {
        const row = await db.xpSetting.findUnique({ where: { guildId } });
        return row ? { revision: row.revision, settings: xpSettingsSchema.parse(row.settings) } : { revision: 0, settings: defaultXpSettings() };
    }
    settings(guildId: string): Promise<XpSettingsResponse> {
        return this.readSettings(this.prisma, guildId);
    }

    updateSettings(guildId: string, input: XpSettingsResponse): Promise<XpSettingsResponse> {
        return this.locked(guildId, async (tx) => {
            const previous = await this.readSettings(tx, guildId);
            if (previous.revision !== input.revision) throw conflict('การตั้งค่าถูกแก้จากที่อื่นแล้ว กรุณาโหลดใหม่ก่อนบันทึก');
            const settings = xpSettingsSchema.parse(input.settings);
            const data = { settings: settings as unknown as Prisma.InputJsonValue, revision: previous.revision + 1 };
            await tx.xpSetting.upsert({ where: { guildId }, create: { guildId, ...data }, update: data });
            // Levels are derived from total XP; a curve change never destroys XP.
            if (settings.curveBase !== previous.settings.curveBase || settings.curveExponent !== previous.settings.curveExponent) {
                // Use the exact shared boundary correction, including fractional exponents.
                // SQL POWER can round an exact cube root below its integer level.
                let afterUserId: string | undefined;
                while (true) {
                    const rows = await tx.level.findMany({
                        where: { guildId, ...(afterUserId === undefined ? {} : { userId: { gt: afterUserId } }) },
                        select: { userId: true, xp: true },
                        orderBy: { userId: 'asc' },
                        take: 500,
                    });
                    if (!rows.length) break;
                    const values = Prisma.join(rows.map((row) => Prisma.sql`(${row.userId}::text, ${levelForXp(row.xp, settings)}::int)`));
                    await tx.$executeRaw`UPDATE levels AS l SET level = v.level
                        FROM (VALUES ${values}) AS v(user_id, level)
                        WHERE l.guild_id = ${guildId} AND l.user_id = v.user_id`;
                    afterUserId = rows[rows.length - 1]!.userId;
                }
            }
            return { revision: data.revision, settings };
        });
    }

    async list(guildId: string, query: LevelQuery = { page: 1, pageSize: 25 }): Promise<LevelPage> {
        const { settings } = await this.settings(guildId);
        const where: Prisma.LevelWhereInput = { guildId };
        let filtered = false,
            searchLimited = false;
        if (query.userId || (query.q && isSnowflake(query.q))) {
            where.userId = query.userId ?? query.q;
            filtered = true;
        } else if (query.q) {
            const members = await this.discord.requireGuild(guildId).members.fetch({ query: query.q, limit: 100 });
            where.userId = { in: [...members.keys()] };
            filtered = true;
            searchLimited = members.size === 100;
        }
        const [total, rows] = await this.prisma.$transaction([
            this.prisma.level.count({ where }),
            this.prisma.level.findMany({
                where,
                orderBy: [{ xp: 'desc' }, { userId: 'asc' }],
                skip: (query.page - 1) * query.pageSize,
                take: query.pageSize,
            }),
        ]);
        const items: LevelRow[] = [];
        // Bounded batches for Discord lookups; only fetch the requested page.
        for (let offset = 0; offset < rows.length; offset += 5) {
            const batch = await Promise.all(
                rows.slice(offset, offset + 5).map(async (row, i) => {
                    const cached = this.discord.guild(guildId)?.members.cache.get(row.userId);
                    const username = cached?.displayName ?? (this.discord.ready ? await this.discord.displayName(row.userId) : null) ?? row.userId;
                    const rank = filtered
                        ? 1 +
                          (await this.prisma.level.count({
                              where: { guildId, OR: [{ xp: { gt: row.xp } }, { xp: row.xp, userId: { lt: row.userId } }] },
                          }))
                        : (query.page - 1) * query.pageSize + offset + i + 1;
                    return { userId: row.userId, xp: row.xp, level: levelForXp(row.xp, settings), username, rank };
                }),
            );
            items.push(...batch);
        }
        return {
            items,
            total,
            page: query.page,
            pageSize: query.pageSize,
            searchLimited,
            settings: { curveBase: settings.curveBase, curveExponent: settings.curveExponent },
        };
    }

    async award(guildId: string, userId: string, context: XpContext): Promise<number> {
        if (!this.loaded) return 0;
        return this.locked(guildId, async (tx) => {
            const { settings } = await this.readSettings(tx, guildId);
            const rules = matchingXpRules(settings, context);
            if (!rules.length) return 0;
            const now = new Date(),
                day = dayInBangkok(now);
            const levelKey = { guildId_userId: { guildId, userId } };
            const current = await tx.level.findUnique({ where: levelKey });
            const dailyKey = { guildId_userId_day: { guildId, userId, day } };
            const daily = await tx.xpDaily.findUnique({ where: dailyKey });
            let balance = current?.xp ?? 0,
                earned = daily?.earned ?? 0,
                total = 0;
            // Matching rules stack in their displayed order; the shared daily cap bounds their sum.
            for (const rule of rules) {
                const key = { guildId_userId_ruleId: { guildId, userId, ruleId: rule.id } };
                const progress = await tx.xpProgress.findUnique({ where: key });
                if (progress && now.getTime() - progress.lastAttemptAt.getTime() < rule.cooldownSeconds * 1000) continue;
                const ruleEarned = progress?.day === day ? progress.earned : 0;
                const amount = Math.max(
                    0,
                    Math.min(
                        rollXp(rule, settings.multiplierPercent),
                        MAX_XP - balance,
                        MAX_XP - earned,
                        MAX_XP - ruleEarned,
                        settings.dailyCap ? settings.dailyCap - earned : MAX_XP,
                        rule.dailyCap ? rule.dailyCap - ruleEarned : MAX_XP,
                    ),
                );
                const data = { day, earned: ruleEarned + amount, lastAttemptAt: now };
                await tx.xpProgress.upsert({ where: key, create: { guildId, userId, ruleId: rule.id, ...data }, update: data });
                if (!amount) continue;
                balance += amount;
                earned += amount;
                total += amount;
                await tx.xpHistory.create({ data: { guildId, userId, source: context.source, delta: amount, balance, reason: rule.name } });
            }
            if (total) {
                await tx.level.upsert({
                    where: levelKey,
                    create: { guildId, userId, xp: balance, level: levelForXp(balance, settings) },
                    update: { xp: balance, level: levelForXp(balance, settings) },
                });
                await tx.xpDaily.upsert({ where: dailyKey, create: { guildId, userId, day, earned }, update: { earned } });
            }
            return total;
        });
    }

    async awardMessageXp(message: Message): Promise<void> {
        if (!message.guildId || message.author.bot || message.webhookId) return;
        try {
            await this.award(message.guildId, message.author.id, {
                source: 'message',
                channelId: message.channelId,
                parentId: 'parentId' in message.channel ? message.channel.parentId : null,
                categoryId: 'parent' in message.channel ? message.channel.parent?.parentId : null,
                roleIds: [...(message.member?.roles.cache.keys() ?? [])],
                messageLength: message.content.trim().length,
            });
        } catch (err) {
            this.logger.error(`Message XP failed: ${(err as Error).message}`);
        }
    }

    mutateMember(guildId: string, input: XpMemberMutation, actorId: number): Promise<XpMemberMutationResult> {
        return this.locked(guildId, async (tx) => {
            const { settings } = await this.readSettings(tx, guildId);
            const where = { guildId_userId: { guildId, userId: input.userId } };
            const old = await tx.level.findUnique({ where });
            const before = old?.xp ?? 0;
            const after =
                input.action === 'add'
                    ? before + input.amount
                    : input.action === 'subtract'
                      ? Math.max(0, before - input.amount)
                      : input.action === 'set'
                        ? input.amount
                        : 0;
            if (after > MAX_XP) throw badRequest(`XP ต้องไม่เกิน ${MAX_XP}`);
            if (input.action === 'delete') await tx.level.deleteMany({ where: { guildId, userId: input.userId } });
            else
                await tx.level.upsert({
                    where,
                    create: { guildId, userId: input.userId, xp: after, level: levelForXp(after, settings) },
                    update: { xp: after, level: levelForXp(after, settings) },
                });
            // Keep today's earned cap/cooldowns: admin resets must not enable XP farming.
            await tx.xpHistory.create({
                data: {
                    guildId,
                    userId: input.userId,
                    source: `admin.${input.action}`,
                    delta: after - before,
                    balance: after,
                    reason: input.reason,
                    actorId,
                },
            });
            return { success: true, userId: input.userId, action: input.action, beforeXp: before, afterXp: after, delta: after - before };
        });
    }

    resetGuild(guildId: string, reason: string, actorId: number): Promise<XpResetGuildResult> {
        return this.locked(guildId, async (tx) => {
            const totals = await tx.level.aggregate({ where: { guildId }, _sum: { xp: true }, _count: true });
            const beforeXp = totals._sum.xp ?? 0;
            await tx.$executeRaw`INSERT INTO xp_history (guild_id, user_id, source, delta, balance, reason, actor_id)
                SELECT guild_id, user_id, 'admin.reset_all', -xp, 0, ${reason}, ${actorId} FROM levels WHERE guild_id = ${guildId}`;
            await tx.level.deleteMany({ where: { guildId } });
            return { success: true, affectedMembers: totals._count, beforeXp, afterXp: 0, delta: 0 - beforeXp };
        });
    }

    async history(guildId: string, query: { userId?: string; cursor?: number }): Promise<XpHistoryPage> {
        const rows = await this.prisma.xpHistory.findMany({
            where: { guildId, ...(query.userId ? { userId: query.userId } : {}), ...(query.cursor ? { id: { lt: query.cursor } } : {}) },
            orderBy: { id: 'desc' },
            take: 51,
        });
        const items = rows.slice(0, 50).map(({ guildId: _guild, ...row }) => ({ ...row, createdAt: row.createdAt.toISOString() }));
        return { items, nextCursor: rows.length > 50 ? items.at(-1)!.id : null };
    }

    @Interval(6 * 3600000)
    async cleanup(): Promise<void> {
        try {
            const cutoff = new Date(Date.now() - 90 * 86400000);
            await this.prisma.xpHistory.deleteMany({ where: { createdAt: { lt: cutoff } } });
            await this.prisma.xpDaily.deleteMany({ where: { day: { lt: dayInBangkok(new Date(Date.now() - 2 * 86400000)) } } });
            await this.prisma.xpProgress.deleteMany({ where: { lastAttemptAt: { lt: cutoff } } });
        } catch (err) {
            this.logger.error(`XP cleanup failed: ${(err as Error).message}`);
        }
    }
}
