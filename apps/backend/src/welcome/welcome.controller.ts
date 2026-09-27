import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Logger, Param, Post, Query, Res } from '@nestjs/common';
import {
    ALIGNS,
    defaultDesign,
    defaultText,
    FITS,
    PLACEHOLDERS,
    SHAPES,
    WELCOME_FONTS,
    WELCOME_LIMITS,
    WELCOME_MAX_UPLOAD_BYTES,
    WELCOME_WEIGHTS,
    welcomeCardInputSchema,
    type SuccessResponse,
    type WelcomeAsset,
    type WelcomeAssetResponse,
    type WelcomeCard,
    type WelcomeCardData,
    type WelcomeCardResponse,
    type WelcomeMeta,
    type WelcomePreviewResponse,
} from '@notstack/shared';
import type { Response } from 'express';
import { Audit, AuditCtx, SkipAudit } from '../common/decorators/audit.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiException, badRequest, notFound } from '../common/exceptions/api.exception';
import type { AuditContext } from '../common/interfaces/app-request.interface';
import { parseId } from '../common/utils/parse.util';
import { DiscordService } from '../discord/discord.service';
import type { User } from '../generated/prisma/client';
import { GuildId } from '../guilds/decorators/guild-id.decorator';
import { GuildRoute } from '../guilds/decorators/guild-route.decorator';
import { WelcomeCardInputDto } from './dto/welcome-card-input.dto';
import { WelcomeCreateDto } from './dto/welcome-create.dto';
import { WelcomePreviewDto } from './dto/welcome-preview.dto';
import { WelcomeRenameAssetDto } from './dto/welcome-rename-asset.dto';
import { WelcomeTestDto } from './dto/welcome-test.dto';
import { WelcomeRenderer } from './welcome.renderer';
import { WelcomeService } from './welcome.service';
import { WelcomeStore } from './welcome.store';

const DEFAULT_CARD_NAME = 'การ์ดต้อนรับใหม่';
const DEFAULT_CONTENT = 'ยินดีต้อนรับ {mention} เข้าสู่ **{server}** 🎉';

// ==========================================
// 🌐 WELCOME API — /api/guilds/:guildId/welcome/* (ผู้ที่จัดการเซิร์ฟเวอร์นั้นได้)
// ใช้แค่ GET/POST เพราะชั้นหน้าเว็บจริง (Cloudflare / web server) ตอบ 403 กับ PATCH / DELETE
// การ์ด:      GET/POST cards, POST cards/:id/update, POST cards/:id/delete
// คลังรูป:    GET/POST assets, GET assets/:id/image, POST assets/:id/rename, POST assets/:id/delete
// ตัวอย่าง:   POST preview (วาดรูปจากค่าที่กำลังแก้ ยังไม่บันทึก), POST test (ส่งเข้าห้องจริง)
// ==========================================
@GuildRoute()
@Controller('guilds/:guildId/welcome')
export class WelcomeController {
    private readonly logger = new Logger('Welcome');

    constructor(
        private readonly store: WelcomeStore,
        private readonly renderer: WelcomeRenderer,
        private readonly welcome: WelcomeService,
        private readonly discord: DiscordService,
    ) {}

    // error ที่ตั้งใจส่งให้ผู้ใช้อ่านส่งต่อตามเดิม ที่เหลือ log ไว้แล้วตอบข้อความกลางๆ
    private fail(err: unknown, fallbackMessage: string): never {
        if (err instanceof HttpException) throw err;
        this.logger.error(`${fallbackMessage}: ${err instanceof Error ? err.stack : String(err)}`);
        throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, fallbackMessage);
    }

    // รูปพื้นหลังต้องอยู่ในคลังรูปของเซิร์ฟเวอร์นี้เท่านั้น
    private async validateBackground(guildId: string, data: Pick<WelcomeCardData, 'backgroundId'>): Promise<void> {
        if (data.backgroundId && !(await this.store.getAssetInfo(guildId, data.backgroundId))) {
            throw badRequest('ไม่พบรูปพื้นหลังนี้ในคลังรูป (อาจถูกลบไปแล้ว)');
        }
    }

    // ค่าคงที่สำหรับสร้างฟอร์มในหน้าเว็บ (ฟอนต์ ตัวแปร ขีดจำกัด ค่าเริ่มต้น)
    @Get('meta')
    meta(): WelcomeMeta {
        const botUser = this.discord.ready?.user;
        return {
            bot: botUser ? { name: botUser.displayName || botUser.username, avatar: botUser.displayAvatarURL({ size: 64 }) } : null,
            fonts: WELCOME_FONTS,
            weights: WELCOME_WEIGHTS,
            fits: FITS,
            shapes: SHAPES,
            aligns: ALIGNS,
            placeholders: PLACEHOLDERS,
            limits: { ...WELCOME_LIMITS, maxUploadBytes: WELCOME_MAX_UPLOAD_BYTES },
            defaultDesign: defaultDesign(),
            defaultText: defaultText(),
        };
    }

    // ==========================================
    // การ์ดต้อนรับ
    // ==========================================
    @Get('cards')
    async listCards(@GuildId() guildId: string): Promise<WelcomeCard[]> {
        try {
            return await this.store.listCards(guildId);
        } catch (err) {
            this.fail(err, 'โหลดรายการการ์ดไม่สำเร็จ');
        }
    }

    // สร้างใหม่จากค่าเริ่มต้น หรือคัดลอกจากการ์ดเดิม (duplicateOf) — การ์ดใหม่ปิดไว้ก่อนเสมอ
    @Audit('welcome.card_create')
    @Post('cards')
    async createCard(@GuildId() guildId: string, @Body() body: WelcomeCreateDto, @AuditCtx() audit: AuditContext): Promise<WelcomeCardResponse> {
        try {
            const sourceId = parseId(body.duplicateOf);
            const source = sourceId ? await this.store.getCard(guildId, sourceId) : null;
            if (sourceId && !source) throw notFound('ไม่พบการ์ดที่ต้องการคัดลอก');
            await this.validateBackground(guildId, body);

            const card = await this.store.createCard(guildId, {
                name: body.name || (source ? `${source.name} (สำเนา)`.slice(0, WELCOME_LIMITS.maxNameLength) : DEFAULT_CARD_NAME),
                enabled: false,
                channelId: body.channelId ?? source?.channelId ?? '',
                content: body.content ?? source?.content ?? DEFAULT_CONTENT,
                design: body.design ?? source?.design ?? defaultDesign(),
                backgroundId: body.backgroundId !== undefined ? body.backgroundId : (source?.backgroundId ?? null),
            });
            audit.targetId = card.id;
            return { success: true, card };
        } catch (err) {
            this.fail(err, 'สร้างการ์ดไม่สำเร็จ');
        }
    }

    // แก้เฉพาะฟิลด์ที่ส่งมา (หน้าแก้ไขส่งมาทั้งก้อน ส่วนสวิตช์ในรายการส่งมาแค่ enabled)
    @Audit('welcome.card_update')
    @Post('cards/:id/update')
    @HttpCode(HttpStatus.OK)
    async updateCard(
        @GuildId() guildId: string,
        @Param('id') idParam: string,
        @Body() data: WelcomeCardInputDto,
        @AuditCtx() audit: AuditContext,
    ): Promise<WelcomeCardResponse> {
        audit.targetId = idParam;
        try {
            const id = parseId(idParam);
            const current = id ? await this.store.getCard(guildId, id) : null;
            if (!id || !current) throw notFound('ไม่พบการ์ดนี้ (อาจถูกลบไปแล้ว)');
            await this.validateBackground(guildId, data);

            // การ์ดที่เปิดใช้งานต้องมีห้องปลายทางเสมอ
            const enabled = data.enabled ?? current.enabled;
            const channelId = data.channelId ?? current.channelId;
            if (enabled && !channelId) throw badRequest('ต้องเลือกห้องที่จะส่งก่อนเปิดใช้งานการ์ด');

            const card = await this.store.updateCard(guildId, id, data);
            if (!card) throw notFound('ไม่พบการ์ดนี้ (อาจถูกลบไปแล้ว)');
            const warning = card.enabled ? await this.welcome.channelWarning(guildId, card.channelId) : null;
            return { success: true, card, warning };
        } catch (err) {
            this.fail(err, 'บันทึกการ์ดไม่สำเร็จ');
        }
    }

    @Audit('welcome.card_delete')
    @Post('cards/:id/delete')
    @HttpCode(HttpStatus.OK)
    async deleteCard(@GuildId() guildId: string, @Param('id') idParam: string, @AuditCtx() audit: AuditContext): Promise<SuccessResponse> {
        audit.targetId = idParam;
        try {
            const id = parseId(idParam);
            if (!id || !(await this.store.deleteCard(guildId, id))) throw notFound('ไม่พบการ์ดนี้ (อาจถูกลบไปแล้ว)');
            return { success: true };
        } catch (err) {
            this.fail(err, 'ลบการ์ดไม่สำเร็จ');
        }
    }

    // ==========================================
    // ตัวอย่าง / ทดสอบส่ง — ใช้ค่าที่กำลังแก้อยู่ในหน้าเว็บ (ยังไม่ต้องบันทึก)
    // ==========================================

    // วาดรูปตัวอย่างอย่างเดียว ไม่ได้แก้ข้อมูล — ไม่ต้องลง audit log (ถูกเรียกทุกครั้งที่ขยับ slider)
    @SkipAudit()
    @Post('preview')
    @HttpCode(HttpStatus.OK)
    async preview(
        @GuildId() guildId: string,
        @Body() body: WelcomePreviewDto,
        @CurrentUser() user: User,
        @Res({ passthrough: true }) res: Response,
    ): Promise<WelcomePreviewResponse> {
        try {
            const backgroundId = parseId(body.backgroundId);
            await this.validateBackground(guildId, { backgroundId });
            const sample = await this.welcome.resolveSample(guildId, body.userId, user.discordId);
            const { image, vars } = await this.welcome.renderImage(body.design, backgroundId, sample);
            res.set('Cache-Control', 'no-store');
            // vars ส่งกลับไปให้หน้าเว็บแทนค่าตัวแปรในข้อความเองได้ทันทีขณะพิมพ์ (ไม่ต้องรอวาดรูปใหม่)
            return { image: `data:image/png;base64,${image.toString('base64')}`, vars };
        } catch (err) {
            this.fail(err, 'สร้างรูปตัวอย่างไม่สำเร็จ');
        }
    }

    @Audit('welcome.test_send')
    @Post('test')
    @HttpCode(HttpStatus.OK)
    async testSend(@GuildId() guildId: string, @Body() body: WelcomeTestDto, @CurrentUser() user: User): Promise<SuccessResponse> {
        try {
            if (!this.discord.ready) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, 'บอทยังไม่ออนไลน์ กรุณาลองใหม่อีกครั้ง');

            const parsed = welcomeCardInputSchema.safeParse({
                channelId: body.channelId,
                content: body.content ?? '',
                design: body.design ?? {},
                backgroundId: body.backgroundId ?? null,
            });
            if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
            const input = parsed.data;
            await this.validateBackground(guildId, input);
            if (!input.channelId) throw badRequest('กรุณาเลือกห้องที่จะส่งก่อน');

            const guild = this.discord.requireGuild(guildId);
            const { channel, error } = await this.welcome.resolveTargetChannel(guild, input.channelId);
            if (!channel) throw badRequest(error);

            const sample = await this.welcome.resolveSample(guildId, body.userId, user.discordId);
            await channel.send(
                await this.welcome.buildPayload({ content: input.content ?? '', design: input.design!, backgroundId: input.backgroundId ?? null }, sample),
            );
            return { success: true, message: `ส่งการ์ดทดสอบเข้า #${'name' in channel ? channel.name : input.channelId} แล้ว` };
        } catch (err) {
            this.fail(err, 'ส่งการ์ดทดสอบไม่สำเร็จ');
        }
    }

    // ==========================================
    // คลังรูปพื้นหลัง
    // ==========================================
    @Get('assets')
    async listAssets(@GuildId() guildId: string): Promise<WelcomeAsset[]> {
        try {
            return await this.store.listAssets(guildId);
        } catch (err) {
            this.fail(err, 'โหลดคลังรูปไม่สำเร็จ');
        }
    }

    // รูปในคลังแก้ไม่ได้ (มีแต่เพิ่ม/ลบ) id เดิมจึงเป็นรูปเดิมตลอด → ให้เบราว์เซอร์ cache ได้ยาว
    @Get('assets/:id/image')
    async assetImage(@GuildId() guildId: string, @Param('id') idParam: string, @Res() res: Response): Promise<void> {
        try {
            const id = parseId(idParam);
            const file = id ? await this.store.getGuildAssetFile(guildId, id) : null;
            if (!file) throw notFound('ไม่พบรูปนี้');
            res.set('Cache-Control', 'private, max-age=31536000, immutable').type(file.mimeType).send(Buffer.from(file.data));
        } catch (err) {
            this.fail(err, 'โหลดรูปไม่สำเร็จ');
        }
    }

    // อัปโหลดเป็นไฟล์ดิบ (body = ตัวไฟล์รูป, ชื่อไฟล์อยู่ใน ?name=) — ไม่ต้องพึ่ง library multipart
    @Audit('welcome.asset_upload')
    @Post('assets')
    async uploadAsset(@GuildId() guildId: string, @Body() body: unknown, @Query('name') rawName: unknown, @AuditCtx() audit: AuditContext): Promise<WelcomeAssetResponse> {
        try {
            const file = await this.renderer.prepareAssetUpload(body).catch((err: Error) => {
                throw badRequest(err.message);
            });
            const name =
                String(rawName ?? '')
                    .replace(/\.[a-z0-9]{2,5}$/i, '')
                    .trim()
                    .slice(0, WELCOME_LIMITS.maxNameLength) || 'รูปพื้นหลัง';
            const asset = await this.store.createAsset(guildId, { name, ...file, size: file.data.length });
            audit.targetId = asset.id;
            audit.extra = { asset: { name, mimeType: asset.mimeType, width: asset.width, height: asset.height, size: asset.size } };
            return { success: true, asset };
        } catch (err) {
            this.fail(err, 'อัปโหลดรูปไม่สำเร็จ');
        }
    }

    @Audit('welcome.asset_rename')
    @Post('assets/:id/rename')
    @HttpCode(HttpStatus.OK)
    async renameAsset(
        @GuildId() guildId: string,
        @Param('id') idParam: string,
        @Body() body: WelcomeRenameAssetDto,
        @AuditCtx() audit: AuditContext,
    ): Promise<WelcomeAssetResponse> {
        audit.targetId = idParam;
        try {
            const id = parseId(idParam);
            const asset = id ? await this.store.renameAsset(guildId, id, body.name) : null;
            if (!asset) throw notFound('ไม่พบรูปนี้ (อาจถูกลบไปแล้ว)');
            return { success: true, asset };
        } catch (err) {
            this.fail(err, 'เปลี่ยนชื่อรูปไม่สำเร็จ');
        }
    }

    @Audit('welcome.asset_delete')
    @Post('assets/:id/delete')
    @HttpCode(HttpStatus.OK)
    async deleteAsset(@GuildId() guildId: string, @Param('id') idParam: string, @AuditCtx() audit: AuditContext): Promise<SuccessResponse> {
        audit.targetId = idParam;
        try {
            const id = parseId(idParam);
            if (!id || !(await this.store.deleteAsset(guildId, id))) throw notFound('ไม่พบรูปนี้ (อาจถูกลบไปแล้ว)');
            this.renderer.forgetAsset(id);
            return { success: true };
        } catch (err) {
            this.fail(err, 'ลบรูปไม่สำเร็จ');
        }
    }
}
