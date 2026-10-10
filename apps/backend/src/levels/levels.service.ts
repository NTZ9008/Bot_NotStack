import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
    defaultXpSettings,
    levelForXp,
    isSnowflake,
    matchingXpRules,
    MAX_XP,
    rollXp,
    xpSettingsSchema,
    type XpRule,
    type XpSettings,
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
import { Subject } from 'rxjs';
import { badRequest, conflict } from '../common/exceptions/api.exception';
import { bangkokDay } from '../common/utils/parse.util';
import { DiscordService } from '../discord/discord.service';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

// เลเวลของสมาชิกเปลี่ยน (หลัง transaction commit แล้ว) — ระบบประกาศเลเวลอัป / ยศรางวัลฟังจากตรงนี้
export interface LevelChange {
    guildId: string;
    userId: string;
    previousLevel: number;
    level: number;
    xp: number;
    // message / voice / command = ได้จากกิจกรรม, admin.* = แอดมินแก้จาก Dashboard
    source: string;
    // ห้องที่เกิดกิจกรรม (ห้องข้อความ / ห้องเสียง) — null เมื่อแอดมินแก้
    channelId: string | null;
}

// Settings are read on every message/voice tick; edits through this service refresh the cache at once.
const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000;
const cooldownKey = (guildId: string, userId: string, ruleId: string) => `${guildId}:${userId}:${ruleId}`;

@Injectable()
export class LevelsService {
    private readonly logger = new Logger('Levels');
    private readonly settingsCache = new Map<string, { value: XpSettingsResponse; at: number }>();
    // Last attempt per guild/user/rule, mirrored from xp_progress after each committed award.
    // Only used to skip transactions that would certainly be in cooldown; the database stays authoritative.
    private readonly cooldowns = new Map<string, number>();
    // แจ้งเมื่อเลเวลเปลี่ยนจากการได้ XP หรือแอดมินแก้ XP (ไม่รวมรีเซ็ตทั้งเซิร์ฟเวอร์ / เปลี่ยนสูตรเลเวล)
    readonly levelChanges = new Subject<LevelChange>();
    constructor(
        private readonly prisma: PrismaService,
        private readonly discord: DiscordService,
    ) {}

    // Guild-wide changes (settings, reset all) take the guild lock exclusively.
    // Per-member work takes it shared plus an exclusive member lock, so different members are awarded in parallel
    // while two writes to the same member (award vs admin edit) still serialize. Lock order is always guild → member.
    private lockedGuild<T>(guildId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
        return this.prisma.$transaction(
            async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`xp:${guildId}`}))`;
                return work(tx);
            },
            { timeout: 15000 },
        );
    }
    private lockedMember<T>(guildId: string, userId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
        return this.prisma.$transaction(
            async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtext(${`xp:${guildId}`}))`;
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`xp:${guildId}:${userId}`}))`;
                return work(tx);
            },
            { timeout: 15000 },
        );
    }

    private async cachedSettings(guildId: string): Promise<XpSettings> {
        const hit = this.settingsCache.get(guildId);
        if (hit && Date.now() - hit.at < SETTINGS_CACHE_TTL_MS) return hit.value.settings;
        const value = await this.readSettings(this.prisma, guildId);
        this.settingsCache.set(guildId, { value, at: Date.now() });
        return value.settings;
    }

    private inCooldown(guildId: string, userId: string, rule: XpRule, now: number): boolean {
        const last = this.cooldowns.get(cooldownKey(guildId, userId, rule.id));
        return last !== undefined && now - last < rule.cooldownSeconds * 1000;
    }

    private rememberAttempts(attempts: [string, number][]): void {
        const now = Date.now();
        for (const [key, at] of attempts) this.cooldowns.set(key, at);
        if (this.cooldowns.size > 20000) {
            // Forgetting an entry only costs one extra transaction; it never grants extra XP.
            for (const [key, at] of this.cooldowns) if (now - at > 3600000) this.cooldowns.delete(key);
        }
    }
    private async readSettings(db: Pick<Tx, 'xpSetting'>, guildId: string): Promise<XpSettingsResponse> {
        const row = await db.xpSetting.findUnique({ where: { guildId } });
        return row ? { revision: row.revision, settings: xpSettingsSchema.parse(row.settings) } : { revision: 0, settings: defaultXpSettings() };
    }
    settings(guildId: string): Promise<XpSettingsResponse> {
        return this.readSettings(this.prisma, guildId);
    }

    async updateSettings(guildId: string, input: XpSettingsResponse): Promise<XpSettingsResponse> {
        const result = await this.lockedGuild(guildId, async (tx) => {
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
        this.settingsCache.set(guildId, { value: result, at: Date.now() });
        return result;
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
        // Cheap pre-check without a transaction: XP off / no matching rule / every matching rule still cooling down.
        const startedAt = Date.now();
        const candidates = matchingXpRules(await this.cachedSettings(guildId), context);
        if (!candidates.length || candidates.every((rule) => this.inCooldown(guildId, userId, rule, startedAt))) return 0;

        const attempts: [string, number][] = [];
        let change = null as LevelChange | null;
        const total = await this.lockedMember(guildId, userId, async (tx) => {
            const { settings } = await this.readSettings(tx, guildId);
            const rules = matchingXpRules(settings, context);
            if (!rules.length) return 0;
            const now = new Date(),
                day = bangkokDay(now);
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
                if (progress && now.getTime() - progress.lastAttemptAt.getTime() < rule.cooldownSeconds * 1000) {
                    attempts.push([cooldownKey(guildId, userId, rule.id), progress.lastAttemptAt.getTime()]);
                    continue;
                }
                attempts.push([cooldownKey(guildId, userId, rule.id), now.getTime()]);
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
                const previousLevel = levelForXp(current?.xp ?? 0, settings);
                const level = levelForXp(balance, settings);
                if (level !== previousLevel) {
                    change = { guildId, userId, previousLevel, level, xp: balance, source: context.source, channelId: context.channelId ?? null };
                }
                await tx.level.upsert({
                    where: levelKey,
                    create: { guildId, userId, xp: balance, level: levelForXp(balance, settings) },
                    update: { xp: balance, level: levelForXp(balance, settings) },
                });
                await tx.xpDaily.upsert({ where: dailyKey, create: { guildId, userId, day, earned }, update: { earned } });
            }
            return total;
        });
        // Only after commit: a rolled-back attempt must not block the next one.
        this.rememberAttempts(attempts);
        if (change) this.levelChanges.next(change);
        return total;
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

    async mutateMember(guildId: string, input: XpMemberMutation, actorId: number): Promise<XpMemberMutationResult> {
        let change = null as LevelChange | null;
        const result = await this.lockedMember(guildId, input.userId, async (tx) => {
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
            const previousLevel = levelForXp(before, settings);
            const level = levelForXp(after, settings);
            if (level !== previousLevel) {
                change = { guildId, userId: input.userId, previousLevel, level, xp: after, source: `admin.${input.action}`, channelId: null };
            }
            return { success: true as const, userId: input.userId, action: input.action, beforeXp: before, afterXp: after, delta: after - before };
        });
        if (change) this.levelChanges.next(change);
        return result;
    }

    resetGuild(guildId: string, reason: string, actorId: number): Promise<XpResetGuildResult> {
        return this.lockedGuild(guildId, async (tx) => {
            const totals = await tx.level.aggregate({ where: { guildId }, _sum: { xp: true }, _count: true });
            const beforeXp = totals._sum.xp ?? 0;
            await tx.$executeRaw`INSERT INTO xp_history (guild_id, user_id, source, delta, balance, reason, actor_id)
                SELECT guild_id, user_id, 'admin.reset_all', -xp, 0, ${reason}, ${actorId} FROM levels WHERE guild_id = ${guildId}`;
            await tx.level.deleteMany({ where: { guildId } });
            return { success: true, affectedMembers: totals._count, beforeXp, afterXp: 0, delta: 0 - beforeXp };
        });
    }

    // XP ที่ได้วันนี้ (ตัดวันตามเวลาไทย) เทียบกับเพดานต่อวันของเซิร์ฟเวอร์ (0 = ไม่จำกัด)
    async today(guildId: string, userId: string): Promise<{ earned: number; dailyCap: number }> {
        const [daily, { settings }] = await Promise.all([
            this.prisma.xpDaily.findUnique({ where: { guildId_userId_day: { guildId, userId, day: bangkokDay() } } }),
            this.settings(guildId),
        ]);
        return { earned: daily?.earned ?? 0, dailyCap: settings.dailyCap };
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
            await this.prisma.xpDaily.deleteMany({ where: { day: { lt: bangkokDay(new Date(Date.now() - 2 * 86400000)) } } });
            await this.prisma.xpProgress.deleteMany({ where: { lastAttemptAt: { lt: cutoff } } });
        } catch (err) {
            this.logger.error(`XP cleanup failed: ${(err as Error).message}`);
        }
    }
}
