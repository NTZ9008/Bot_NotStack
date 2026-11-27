import { Injectable, Logger } from '@nestjs/common';
import {
    UPTIME_LIMITS,
    type CreateUptimeTargetInput,
    type UpdateUptimeTargetInput,
    type UptimeIntervalMinutes,
    type UptimeLatencyPoint,
    type UptimeOverviewResponse,
    type UptimeStatus,
    type UptimeTargetDetailResponse,
    type UptimeTargetSummary,
} from '@notstack/shared';
import { EmbedBuilder } from 'discord.js';
import { badRequest, notFound } from '../common/exceptions/api.exception';
import { assertSafeExternalUrl, probeExternalUrl, SsrfBlockedError, type DnsLookupAll } from '../common/utils/ssrf-guard';
import { DiscordService } from '../discord/discord.service';
import type { UptimeTarget } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

interface LogAggregate {
    total: number;
    up: number;
    latencySum: number;
    latencyCount: number;
}

const normalizeInterval = (minutes: number): UptimeIntervalMinutes => (minutes === 1 || minutes === 15 ? minutes : 5);
const normalizeStatus = (status: string): UptimeStatus => (status === 'UP' || status === 'DOWN' ? status : 'UNKNOWN');

// ==========================================
// 💓 UPTIME SERVICE — CRUD เป้าหมาย, ยิงตรวจสอบ, เก็บสถิติ 24 ชม. และแจ้งเตือน Discord เมื่อสถานะเปลี่ยน
// ==========================================
@Injectable()
export class UptimeService {
    private readonly logger = new Logger('Uptime');
    // ปรับสลับใน unit test ได้
    fetchImpl: typeof fetch = (...args) => fetch(...args);
    lookupImpl?: DnsLookupAll;

    constructor(
        private readonly prisma: PrismaService,
        private readonly discord: DiscordService,
    ) {}

    private async validateTargetUrl(url: string): Promise<string> {
        try {
            const safe = await assertSafeExternalUrl(url, this.lookupImpl);
            return safe.toString();
        } catch (err) {
            if (err instanceof SsrfBlockedError) throw badRequest(err.message);
            throw badRequest(err instanceof Error ? err.message : 'URL ไม่ถูกต้อง');
        }
    }

    private async assertValidAlertChannel(guildId: string, channelId: string): Promise<void> {
        if (!this.discord.ready) return;
        const channel = await this.discord.fetchGuildChannel(guildId, channelId);
        if (!channel?.isSendable()) {
            throw badRequest('ไม่พบห้องแจ้งเตือนนี้ในเซิร์ฟเวอร์ หรือบอทไม่สามารถส่งข้อความในห้องนี้ได้');
        }
    }

    private async requireTarget(guildId: string, id: number): Promise<UptimeTarget> {
        const target = await this.prisma.uptimeTarget.findFirst({ where: { id, guildId } });
        if (!target) throw notFound('ไม่พบรายการตรวจสอบสถานะนี้');
        return target;
    }

    private aggregate24h(logs: Array<{ targetId: number; status: string; latencyMs: number | null }>): Map<number, LogAggregate> {
        const stats = new Map<number, LogAggregate>();
        for (const row of logs) {
            let agg = stats.get(row.targetId);
            if (!agg) {
                agg = { total: 0, up: 0, latencySum: 0, latencyCount: 0 };
                stats.set(row.targetId, agg);
            }
            agg.total += 1;
            if (row.status === 'UP') agg.up += 1;
            if (row.latencyMs !== null && row.latencyMs >= 0) {
                agg.latencySum += row.latencyMs;
                agg.latencyCount += 1;
            }
        }
        return stats;
    }

    private toSummary(row: UptimeTarget, agg?: LogAggregate): UptimeTargetSummary {
        const checks24hCount = agg?.total ?? 0;
        const up24hCount = agg?.up ?? 0;
        const uptime24hPercent = checks24hCount > 0 ? Math.round((up24hCount / checks24hCount) * 1000) / 10 : null;
        const avgLatency24hMs = agg && agg.latencyCount > 0 ? Math.round(agg.latencySum / agg.latencyCount) : null;

        return {
            id: row.id,
            guildId: row.guildId,
            name: row.name,
            url: row.url,
            intervalMinutes: normalizeInterval(row.intervalMinutes),
            channelId: row.channelId,
            mentionRoleId: row.mentionRoleId,
            enabled: row.enabled,
            lastStatus: normalizeStatus(row.lastStatus),
            lastStatusCode: row.lastStatusCode,
            lastLatencyMs: row.lastLatencyMs,
            lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
            nextCheckAt: row.nextCheckAt.toISOString(),
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
            uptime24hPercent,
            checks24hCount,
            up24hCount,
            avgLatency24hMs,
        };
    }

    async list(guildId: string): Promise<UptimeOverviewResponse> {
        const since = new Date(Date.now() - TWENTY_FOUR_HOURS_MS);
        const rows = await this.prisma.uptimeTarget.findMany({ where: { guildId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
        const targetIds = rows.map((r) => r.id);
        const logs = targetIds.length
            ? await this.prisma.uptimeCheckLog.findMany({
                  where: { targetId: { in: targetIds }, checkedAt: { gte: since } },
                  select: { targetId: true, status: true, latencyMs: true },
              })
            : [];

        const statsByTarget = this.aggregate24h(logs);
        const targets = rows.map((row) => this.toSummary(row, statsByTarget.get(row.id)));

        let enabledTargets = 0;
        let upCount = 0;
        let downCount = 0;
        let unknownCount = 0;
        let totalChecks = 0;
        let totalUp = 0;

        for (const t of targets) {
            if (t.enabled) enabledTargets += 1;
            if (t.lastStatus === 'UP') upCount += 1;
            else if (t.lastStatus === 'DOWN') downCount += 1;
            else unknownCount += 1;
            totalChecks += t.checks24hCount;
            totalUp += t.up24hCount;
        }

        return {
            targets,
            summary: {
                totalTargets: targets.length,
                enabledTargets,
                upCount,
                downCount,
                unknownCount,
                overallUptime24hPercent: totalChecks > 0 ? Math.round((totalUp / totalChecks) * 1000) / 10 : null,
            },
        };
    }

    async detail(guildId: string, id: number): Promise<UptimeTargetDetailResponse> {
        const target = await this.requireTarget(guildId, id);
        const since = new Date(Date.now() - TWENTY_FOUR_HOURS_MS);
        const logs = await this.prisma.uptimeCheckLog.findMany({
            where: { targetId: target.id, checkedAt: { gte: since } },
            orderBy: { checkedAt: 'asc' },
            select: { checkedAt: true, status: true, statusCode: true, latencyMs: true, error: true },
        });
        const agg = this.aggregate24h(logs.map((l) => ({ targetId: target.id, status: l.status, latencyMs: l.latencyMs }))).get(target.id);
        const series24h: UptimeLatencyPoint[] = logs.map((l) => ({
            checkedAt: l.checkedAt.toISOString(),
            status: l.status === 'DOWN' ? 'DOWN' : 'UP',
            statusCode: l.statusCode,
            latencyMs: l.latencyMs,
            error: l.error,
        }));

        return {
            target: this.toSummary(target, agg),
            series24h,
        };
    }

    async create(guildId: string, input: CreateUptimeTargetInput): Promise<UptimeTargetSummary> {
        const existingCount = await this.prisma.uptimeTarget.count({ where: { guildId } });
        if (existingCount >= UPTIME_LIMITS.maxTargetsPerGuild) {
            throw badRequest(`เพิ่มรายการตรวจสอบได้สูงสุด ${UPTIME_LIMITS.maxTargetsPerGuild} รายการต่อเซิร์ฟเวอร์`);
        }

        const safeUrl = await this.validateTargetUrl(input.url);
        await this.assertValidAlertChannel(guildId, input.channelId);

        const row = await this.prisma.uptimeTarget.create({
            data: {
                guildId,
                name: input.name,
                url: safeUrl,
                intervalMinutes: input.intervalMinutes,
                channelId: input.channelId,
                mentionRoleId: input.mentionRoleId ?? null,
                enabled: input.enabled ?? true,
                nextCheckAt: new Date(),
            },
        });
        return this.toSummary(row);
    }

    async update(guildId: string, id: number, input: UpdateUptimeTargetInput): Promise<UptimeTargetSummary> {
        const current = await this.requireTarget(guildId, id);
        const nextUrl = input.url !== undefined ? await this.validateTargetUrl(input.url) : current.url;
        if (input.channelId !== undefined) await this.assertValidAlertChannel(guildId, input.channelId);

        const intervalMinutes = input.intervalMinutes ?? current.intervalMinutes;
        const enabled = input.enabled ?? current.enabled;
        const shouldResetSchedule = input.intervalMinutes !== undefined || (input.enabled === true && !current.enabled);
        const nextCheckAt = shouldResetSchedule ? new Date() : current.nextCheckAt;

        const updated = await this.prisma.uptimeTarget.update({
            where: { id: current.id },
            data: {
                ...(input.name !== undefined ? { name: input.name } : {}),
                url: nextUrl,
                intervalMinutes,
                ...(input.channelId !== undefined ? { channelId: input.channelId } : {}),
                ...(input.mentionRoleId !== undefined ? { mentionRoleId: input.mentionRoleId } : {}),
                enabled,
                nextCheckAt,
            },
        });
        const since = new Date(Date.now() - TWENTY_FOUR_HOURS_MS);
        const logs = await this.prisma.uptimeCheckLog.findMany({
            where: { targetId: updated.id, checkedAt: { gte: since } },
            select: { targetId: true, status: true, latencyMs: true },
        });
        return this.toSummary(updated, this.aggregate24h(logs).get(updated.id));
    }

    async remove(guildId: string, id: number): Promise<void> {
        await this.requireTarget(guildId, id);
        await this.prisma.uptimeTarget.delete({ where: { id } });
    }

    async checkNow(guildId: string, id: number): Promise<UptimeTargetSummary> {
        const target = await this.requireTarget(guildId, id);
        await this.executeCheck(target);
        const { target: summary } = await this.detail(guildId, id);
        return summary;
    }

    async executeCheck(target: UptimeTarget): Promise<void> {
        const previousStatus = target.lastStatus;
        const result = await probeExternalUrl(target.url, {
            timeoutMs: UPTIME_LIMITS.timeoutMs,
            fetchImpl: this.fetchImpl,
            lookupImpl: this.lookupImpl,
        });
        const now = new Date();
        const nextCheckAt = new Date(now.getTime() + target.intervalMinutes * 60_000);

        await this.prisma.$transaction([
            this.prisma.uptimeCheckLog.create({
                data: {
                    targetId: target.id,
                    status: result.status,
                    statusCode: result.statusCode,
                    latencyMs: result.latencyMs,
                    error: result.error,
                    checkedAt: now,
                },
            }),
            this.prisma.uptimeTarget.update({
                where: { id: target.id },
                data: {
                    lastStatus: result.status,
                    lastStatusCode: result.statusCode,
                    lastLatencyMs: result.latencyMs,
                    lastCheckedAt: now,
                    nextCheckAt,
                },
            }),
        ]);

        const transitioned = (previousStatus === 'UP' && result.status === 'DOWN') || (previousStatus === 'DOWN' && result.status === 'UP');
        if (transitioned) {
            await this.notifyStatusTransition(target, result, now);
        }
    }

    private async notifyStatusTransition(
        target: UptimeTarget,
        result: { status: 'UP' | 'DOWN'; statusCode: number | null; latencyMs: number | null; error: string | null },
        checkedAt: Date,
    ): Promise<void> {
        if (!this.discord.ready) return;
        try {
            const channel = await this.discord.fetchGuildChannel(target.guildId, target.channelId);
            if (!channel?.isSendable()) return;

            const isDown = result.status === 'DOWN';
            const embed = new EmbedBuilder()
                .setColor(isDown ? 0xe03131 : 0x2f9e44)
                .setTitle(isDown ? `🔴 [DOWN] ${target.name}` : `🟢 [UP] ${target.name} กลับมาออนไลน์แล้ว`)
                .setURL(target.url)
                .addFields(
                    { name: 'URL', value: target.url },
                    { name: 'HTTP Status', value: result.statusCode !== null ? String(result.statusCode) : 'N/A', inline: true },
                    { name: 'Response Time', value: result.latencyMs !== null ? `${result.latencyMs} ms` : 'N/A', inline: true },
                    ...(result.error ? [{ name: 'สาเหตุ', value: result.error }] : []),
                )
                .setTimestamp(checkedAt);

            const content = target.mentionRoleId ? `<@&${target.mentionRoleId}>` : undefined;
            const allowedMentions = target.mentionRoleId ? { roles: [target.mentionRoleId] } : { parse: [] as [] };
            await channel.send({ content, embeds: [embed], allowedMentions });
        } catch (err) {
            this.logger.warn(`ส่งแจ้งเตือน Uptime (${target.guildId}/${target.id}) ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    async pruneOldLogs(retentionHours: number = UPTIME_LIMITS.retentionHours): Promise<number> {
        const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000);
        const result = await this.prisma.uptimeCheckLog.deleteMany({ where: { checkedAt: { lt: cutoff } } });
        return result.count;
    }
}
