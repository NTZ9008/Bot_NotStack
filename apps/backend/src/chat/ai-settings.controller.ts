import { BadRequestException, Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { bangkokDay } from '../common/utils/parse.util';
import { Audit, AuditCtx } from '../common/decorators/audit.decorator';
import type { AuditContext } from '../common/interfaces/app-request.interface';
import { GuildId } from '../guilds/decorators/guild-id.decorator';
import { GuildAccess, GuildRoute } from '../guilds/decorators/guild-route.decorator';
import { DiscordService } from '../discord/discord.service';
import { PrismaService } from '../prisma/prisma.service';
import { FREE_TIER_MODELS, GeminiService } from './gemini.service';

@GuildRoute()
@Controller('guilds/:guildId/ai')
export class AiSettingsController {
    constructor(private readonly gemini: GeminiService, private readonly prisma: PrismaService, private readonly discord: DiscordService) {}

    @GuildAccess('view')
    @Get()
    async get(@GuildId() guildId: string) {
        const config = await this.gemini.getConfig(guildId);
        const day = bangkokDay();
        const [usage, models] = await Promise.all([
            this.prisma.aiModelUsage.findMany({ where: { guildId, day } }),
            Promise.resolve(FREE_TIER_MODELS.map((spec) => {
                const row = this.gemini.getRateStatus(guildId, spec.name);
                const daily = 0;
                return { name: spec.name, category: 'Text-out models', rpm: { current: row.rpm, limit: spec.rpm }, tpm: { current: row.tpm, limit: spec.tpm }, rpd: { current: daily, limit: spec.rpd }, cooldownUntil: row.cooldownUntil, status: row.cooldownUntil ? 'cooldown' : 'ready' };
            })),
        ]);
        const byModel = new Map(usage.map((row) => [row.modelName, row.requestCount]));
        for (const model of models) model.rpd.current = byModel.get(model.name) ?? 0;
        const todayTotalRequests = usage.reduce((sum, row) => sum + row.requestCount, 0);
        const isUsingFallbackHomeKey = this.discord.isHome(guildId) && !config?.geminiApiKeyEncrypted && (!config || config.aiEnabled) && this.gemini.hasFallbackKey();
        const hasFallbackHomeKey = this.discord.isHome(guildId) && this.gemini.hasFallbackKey();
        return {
            aiEnabled: config ? config.aiEnabled : isUsingFallbackHomeKey,
            hasKey: Boolean(config?.geminiApiKeyEncrypted),
            maskedKey: this.gemini.maskKey(config?.geminiApiKeyEncrypted) ?? (isUsingFallbackHomeKey ? this.gemini.maskFallbackKey() : null),
            isUsingFallbackHomeKey,
            hasFallbackHomeKey,
            dailyLimit: config?.aiDailyLimit ?? (this.discord.isHome(guildId) ? this.gemini.dailyLimit : 500),
            todayTotalRequests,
            models,
        };
    }

    @GuildAccess('manage')
    @Audit('guild.ai.update')
    @Patch()
    async update(@GuildId() guildId: string, @Body() body: { aiEnabled?: boolean; apiKey?: string | null; dailyLimit?: number }, @AuditCtx() audit: AuditContext) {
        if (body.aiEnabled !== undefined && typeof body.aiEnabled !== 'boolean') throw new BadRequestException('aiEnabled must be a boolean');
        if (body.apiKey !== undefined && body.apiKey !== null && typeof body.apiKey !== 'string') throw new BadRequestException('apiKey must be a string or null');
        if (body.dailyLimit !== undefined && (!Number.isInteger(body.dailyLimit) || body.dailyLimit < 1 || body.dailyLimit > 100000)) throw new BadRequestException('dailyLimit must be between 1 and 100000');
        if (body.aiEnabled === true) {
            const current = await this.gemini.getConfig(guildId);
            const hasKeyAfterUpdate = body.apiKey !== undefined ? Boolean(body.apiKey?.trim()) : Boolean(current?.geminiApiKeyEncrypted);
            const canUseHomeFallback = this.discord.isHome(guildId) && this.gemini.hasFallbackKey();
            if (!hasKeyAfterUpdate && !canUseHomeFallback) throw new BadRequestException('ต้องบันทึก Gemini API Key ก่อนเปิดใช้งาน AI');
        }
        audit.targetId = guildId;
        audit.extra = {
            ...(body.aiEnabled !== undefined ? { aiEnabled: body.aiEnabled } : {}),
            credentialAction: body.apiKey === undefined ? 'unchanged' : body.apiKey?.trim() ? 'saved' : 'removed',
            ...(body.dailyLimit !== undefined ? { dailyLimit: body.dailyLimit } : {}),
        };
        await this.gemini.saveConfig(guildId, body);
        return this.get(guildId);
    }

    @GuildAccess('manage')
    @Audit('guild.ai.test-key')
    @Post('test-key')
    async test(@GuildId() guildId: string, @Body() body: { apiKey?: string }, @AuditCtx() audit: AuditContext) {
        audit.targetId = guildId;
        try {
            const key = body.apiKey?.trim();
            if (!key) {
                const config = await this.gemini.getConfig(guildId);
                if (config?.geminiApiKeyEncrypted) {
                    // Validates the key through the same persisted configuration path without returning the secret.
                    await this.gemini.testConfiguredKey(guildId);
                    audit.extra = { keySource: 'saved', testSucceeded: true };
                    return { ok: true, message: 'Gemini API Key ใช้งานได้' };
                }
                if (this.discord.isHome(guildId) && this.gemini.hasFallbackKey()) {
                    await this.gemini.testConfiguredKey(guildId);
                    audit.extra = { keySource: 'home-fallback', testSucceeded: true };
                    return { ok: true, message: 'Gemini API Key ใช้งานได้' };
                }
            }
            if (!key) throw new BadRequestException('กรุณากรอก API Key ก่อนทดสอบ');
            await this.gemini.testKey(key);
            audit.extra = { keySource: 'submitted', testSucceeded: true };
            return { ok: true, message: 'Gemini API Key ใช้งานได้' };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            audit.extra = { keySource: body.apiKey?.trim() ? 'submitted' : 'saved-or-fallback', testSucceeded: false };
            return { ok: false, message: 'ทดสอบ Key ไม่สำเร็จ กรุณาตรวจ Key และสิทธิ์การใช้งาน' };
        }
    }
}
