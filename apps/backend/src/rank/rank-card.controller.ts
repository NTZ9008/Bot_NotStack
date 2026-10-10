import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Logger, Param, Post, Res, UseGuards } from '@nestjs/common';
import {
    allowedMemberStyle,
    defaultLevelUpSettings,
    defaultRankTheme,
    LEVEL_UP_DESTINATION_LABELS,
    LEVEL_UP_PLACEHOLDERS,
    levelUpInputSchema,
    myRankPreviewSchema,
    RANK_CARD_SIZES,
    RANK_COLOR_PRESETS,
    RANK_LAYOUT_LABELS,
    RANK_LAYOUTS,
    RANK_LIMITS,
    rankMemberStyleInputSchema,
    rankPreviewSchema,
    rankThemeInputSchema,
    SHAPES,
    SNOWFLAKE_RE,
    WELCOME_FONTS,
    type LevelUpSettingsResponse,
    type MyRankCardResponse,
    type RankCardMeta,
    type RankCardTheme,
    type RankPreviewResponse,
    type RewardSyncResponse,
} from '@notstack/shared';
import type { Response } from 'express';
import { RenderRateLimitGuard } from '../auth/guards/rate-limit.guard';
import { Audit, SkipAudit } from '../common/decorators/audit.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { createZodDto } from '../common/dto/create-zod-dto';
import { ApiException, badRequest, notFound } from '../common/exceptions/api.exception';
import { parseId } from '../common/utils/parse.util';
import { DiscordService } from '../discord/discord.service';
import type { User } from '../generated/prisma/client';
import { GuildId } from '../guilds/decorators/guild-id.decorator';
import { GuildAccess, GuildRoute } from '../guilds/decorators/guild-route.decorator';
import { WelcomeStore } from '../welcome/welcome.store';
import { LevelUpService } from './level-up.service';
import { RankCardService, themeAssetIds } from './rank-card.service';
import { RankCardStore } from './rank-card.store';

class ThemeDto extends createZodDto(rankThemeInputSchema) {}
class MemberStyleDto extends createZodDto(rankMemberStyleInputSchema) {}
class LevelUpDto extends createZodDto(levelUpInputSchema) {}
class PreviewDto extends createZodDto(rankPreviewSchema) {}
class MyPreviewDto extends createZodDto(myRankPreviewSchema) {}

const dataUrl = (image: Buffer) => `data:image/png;base64,${image.toString('base64')}`;

// ==========================================
// 🌐 RANK CARD API — /api/guilds/:guildId/rank-card/*
// แอดมิน (manage): theme, preview, level-up, level-up/sync
// สมาชิก (view):   meta, me, me/preview, me/reset, backgrounds/:id/image — แต่งการ์ดของตัวเองตามที่ธีมอนุญาต
// ==========================================
@GuildRoute()
@Controller('guilds/:guildId/rank-card')
export class RankCardController {
    private readonly logger = new Logger('RankCard');

    constructor(
        private readonly store: RankCardStore,
        private readonly cards: RankCardService,
        private readonly levelUp: LevelUpService,
        private readonly assets: WelcomeStore,
        private readonly discord: DiscordService,
    ) {}

    private fail(err: unknown, message: string): never {
        if (err instanceof HttpException) throw err;
        this.logger.error(`${message}: ${err instanceof Error ? err.stack : String(err)}`);
        throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, message);
    }

    // ตัดรูปที่ถูกลบออกจากคลังแล้วออกจากรายการพื้นหลังที่สมาชิกเลือกได้
    private async withExistingAssets(guildId: string, theme: RankCardTheme): Promise<RankCardTheme> {
        if (!theme.members.backgroundIds.length) return theme;
        const existing = new Set((await this.assets.listAssets(guildId)).map((asset) => asset.id));
        return { ...theme, members: { ...theme.members, backgroundIds: theme.members.backgroundIds.filter((id) => existing.has(id)) } };
    }

    @GuildAccess('view')
    @Get('meta')
    meta(): RankCardMeta {
        return {
            layouts: RANK_LAYOUTS,
            layoutLabels: RANK_LAYOUT_LABELS,
            sizes: RANK_CARD_SIZES,
            fonts: WELCOME_FONTS,
            shapes: SHAPES,
            colorPresets: RANK_COLOR_PRESETS,
            limits: RANK_LIMITS,
            placeholders: LEVEL_UP_PLACEHOLDERS,
            destinations: LEVEL_UP_DESTINATION_LABELS,
            defaultTheme: defaultRankTheme(),
            defaultLevelUp: defaultLevelUpSettings(),
        };
    }

    // ==========================================
    // ธีมของเซิร์ฟเวอร์ (แอดมิน)
    // ==========================================
    @Get('theme')
    async theme(@GuildId() guildId: string): Promise<RankCardTheme> {
        return this.withExistingAssets(guildId, await this.store.theme(guildId));
    }

    @Audit('rank.theme_update')
    @Post('theme')
    @HttpCode(HttpStatus.OK)
    async saveTheme(@GuildId() guildId: string, @Body() body: ThemeDto): Promise<RankCardTheme> {
        try {
            await this.cards.assertOwnedAssets(guildId, themeAssetIds(body.theme));
            return await this.store.saveTheme(guildId, body.theme);
        } catch (err) {
            this.fail(err, 'บันทึกธีมการ์ดไม่สำเร็จ');
        }
    }

    // วาดตัวอย่างจากค่าที่กำลังแก้ (ยังไม่บันทึก) — ถูกเรียกบ่อยตอนขยับ slider จึงไม่ลง audit log
    @SkipAudit()
    @UseGuards(RenderRateLimitGuard)
    @Post('preview')
    @HttpCode(HttpStatus.OK)
    async preview(@GuildId() guildId: string, @Body() body: PreviewDto, @CurrentUser() user: User, @Res({ passthrough: true }) res: Response): Promise<RankPreviewResponse> {
        try {
            await this.cards.assertOwnedAssets(guildId, themeAssetIds(body.theme));
            const image = await this.cards.preview(guildId, body.kind, body.theme.style, user.discordId, body.levelUp);
            res.set('Cache-Control', 'no-store');
            return { image: dataUrl(image) };
        } catch (err) {
            this.fail(err, 'สร้างรูปตัวอย่างไม่สำเร็จ');
        }
    }

    // ==========================================
    // การ์ดของฉัน (สมาชิกทุกคน)
    // ==========================================
    private async myContext(guildId: string, user: User): Promise<{ discordId: string | null; reason: string | null }> {
        if (!user.discordId) return { discordId: null, reason: 'เชื่อมบัญชี Discord ที่หน้า My Account ก่อน จึงจะแต่งการ์ดของตัวเองได้' };
        const guild = this.discord.guild(guildId);
        const member = guild ? await guild.members.fetch(user.discordId).catch(() => null) : null;
        if (!member) return { discordId: null, reason: 'บัญชี Discord ที่เชื่อมไว้ไม่ได้เป็นสมาชิกของเซิร์ฟเวอร์นี้' };
        return { discordId: user.discordId, reason: null };
    }

    private async myCard(guildId: string, user: User): Promise<MyRankCardResponse> {
        const theme = await this.withExistingAssets(guildId, await this.store.theme(guildId));
        const { discordId, reason } = await this.myContext(guildId, user);
        const saved = discordId ? await this.store.memberStyle(guildId, discordId) : null;
        const disabled = !theme.members.enabled ? 'แอดมินของเซิร์ฟเวอร์นี้ปิดการแต่งการ์ดเอง — ทุกคนใช้ธีมของเซิร์ฟเวอร์' : null;
        return {
            available: Boolean(discordId) && theme.members.enabled,
            reason: reason ?? disabled,
            permissions: theme.members,
            style: allowedMemberStyle(theme, saved),
            themeStyle: theme.style,
        };
    }

    @GuildAccess('view')
    @Get('me')
    async me(@GuildId() guildId: string, @CurrentUser() user: User): Promise<MyRankCardResponse> {
        try {
            return await this.myCard(guildId, user);
        } catch (err) {
            this.fail(err, 'โหลดการ์ดของคุณไม่สำเร็จ');
        }
    }

    @GuildAccess('view')
    @Audit('rank.my_card_update')
    @Post('me')
    @HttpCode(HttpStatus.OK)
    async saveMine(@GuildId() guildId: string, @Body() body: MemberStyleDto, @CurrentUser() user: User): Promise<MyRankCardResponse> {
        try {
            const { discordId, reason } = await this.myContext(guildId, user);
            if (!discordId) throw badRequest(reason ?? 'แต่งการ์ดไม่ได้');
            if (!(await this.store.theme(guildId)).members.enabled) throw badRequest('แอดมินของเซิร์ฟเวอร์นี้ปิดการแต่งการ์ดเอง');
            await this.store.saveMemberStyle(guildId, discordId, body.style);
            return await this.myCard(guildId, user);
        } catch (err) {
            this.fail(err, 'บันทึกการ์ดของคุณไม่สำเร็จ');
        }
    }

    @GuildAccess('view')
    @Audit('rank.my_card_reset')
    @Post('me/reset')
    @HttpCode(HttpStatus.OK)
    async resetMine(@GuildId() guildId: string, @CurrentUser() user: User): Promise<MyRankCardResponse> {
        try {
            const { discordId, reason } = await this.myContext(guildId, user);
            if (!discordId) throw badRequest(reason ?? 'แต่งการ์ดไม่ได้');
            await this.store.deleteMemberStyle(guildId, discordId);
            return await this.myCard(guildId, user);
        } catch (err) {
            this.fail(err, 'รีเซ็ตการ์ดของคุณไม่สำเร็จ');
        }
    }

    @GuildAccess('view')
    @SkipAudit()
    @UseGuards(RenderRateLimitGuard)
    @Post('me/preview')
    @HttpCode(HttpStatus.OK)
    async previewMine(@GuildId() guildId: string, @Body() body: MyPreviewDto, @CurrentUser() user: User, @Res({ passthrough: true }) res: Response): Promise<RankPreviewResponse> {
        try {
            const { discordId, reason } = await this.myContext(guildId, user);
            if (!discordId) throw badRequest(reason ?? 'แต่งการ์ดไม่ได้');
            const image = await this.cards.previewMember(guildId, discordId, body.style, body.kind);
            res.set('Cache-Control', 'no-store');
            return { image: dataUrl(image) };
        } catch (err) {
            this.fail(err, 'สร้างรูปตัวอย่างไม่สำเร็จ');
        }
    }

    // รูปตัวเลือกพื้นหลังสำหรับสมาชิก — ให้ดูได้เฉพาะรูปที่แอดมินเปิดให้เลือก
    @GuildAccess('view')
    @Get('backgrounds/:id/image')
    async background(@GuildId() guildId: string, @Param('id') idParam: string, @Res() res: Response): Promise<void> {
        try {
            const id = parseId(idParam);
            const theme = await this.store.theme(guildId);
            if (!id || !theme.members.backgrounds || !theme.members.backgroundIds.includes(id)) throw notFound('ไม่พบรูปนี้');
            const file = await this.assets.getGuildAssetFile(guildId, id);
            if (!file) throw notFound('ไม่พบรูปนี้');
            res.set('Cache-Control', 'private, max-age=31536000, immutable').type(file.mimeType).send(Buffer.from(file.data));
        } catch (err) {
            this.fail(err, 'โหลดรูปไม่สำเร็จ');
        }
    }

    // ==========================================
    // ประกาศเลเวลอัป + ยศรางวัล (แอดมิน)
    // ==========================================
    @Get('level-up')
    async levelUpSettings(@GuildId() guildId: string): Promise<LevelUpSettingsResponse> {
        const settings = await this.store.levelUp(guildId);
        return { settings, warnings: await this.levelUp.warnings(guildId, settings) };
    }

    @Audit('rank.level_up_update')
    @Post('level-up')
    @HttpCode(HttpStatus.OK)
    async saveLevelUp(@GuildId() guildId: string, @Body() body: LevelUpDto): Promise<LevelUpSettingsResponse> {
        try {
            const settings = body.settings;
            const guild = this.discord.guild(guildId);
            if (guild) {
                // ห้อง / ยศต้องเป็นของเซิร์ฟเวอร์นี้
                if (settings.channelId && !(await this.discord.fetchGuildChannel(guildId, settings.channelId))) throw badRequest('ไม่พบห้องประกาศนี้ในเซิร์ฟเวอร์');
                const missing = settings.rewards.find((reward) => !guild.roles.cache.has(reward.roleId));
                if (missing) throw badRequest(`ไม่พบยศรางวัลของเลเวล ${missing.level} ในเซิร์ฟเวอร์`);
                if (settings.rewards.some((reward) => reward.roleId === guild.id)) throw badRequest('ใช้ @everyone เป็นยศรางวัลไม่ได้');
            } else if (settings.channelId && !SNOWFLAKE_RE.test(settings.channelId)) {
                throw badRequest('Channel ID ไม่ถูกต้อง');
            }
            const saved = await this.store.saveLevelUp(guildId, settings);
            return { settings: saved, warnings: await this.levelUp.warnings(guildId, saved) };
        } catch (err) {
            this.fail(err, 'บันทึกการตั้งค่าเลเวลอัปไม่สำเร็จ');
        }
    }

    @Audit('rank.rewards_sync')
    @Post('level-up/sync')
    @HttpCode(HttpStatus.OK)
    async syncRewards(@GuildId() guildId: string): Promise<RewardSyncResponse> {
        try {
            if ((await this.store.levelUp(guildId)).rewards.length === 0) throw badRequest('ยังไม่ได้ตั้งยศรางวัล');
            const queued = await this.levelUp.syncAll(guildId);
            return {
                success: true,
                queued,
                message: queued ? `กำลังปรับยศรางวัลให้สมาชิกที่มี XP ${queued.toLocaleString()} คน (ทำงานเบื้องหลัง)` : 'กำลังปรับยศอยู่แล้ว หรือยังไม่มีสมาชิกที่มี XP',
            };
        } catch (err) {
            this.fail(err, 'ปรับยศรางวัลไม่สำเร็จ');
        }
    }
}
