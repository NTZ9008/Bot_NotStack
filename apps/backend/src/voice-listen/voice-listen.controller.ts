import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import type { SuccessResponse, VoiceListenStatus } from '@notstack/shared';
import { voiceListenJoinSchema } from '@notstack/shared';
import type { Request, Response } from 'express';
import { AuditCtx } from '../common/decorators/audit.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { createZodDto } from '../common/dto/create-zod-dto';
import { ApiException } from '../common/exceptions/api.exception';
import type { AuditContext } from '../common/interfaces/app-request.interface';
import type { User } from '../generated/prisma/client';
import { GuildId } from '../guilds/decorators/guild-id.decorator';
import { GuildRoute } from '../guilds/decorators/guild-route.decorator';
import { GuildAccessService } from '../guilds/guild-access.service';
import { VoiceListenService } from './voice-listen.service';

class VoiceListenJoinDto extends createZodDto(voiceListenJoinSchema) {}

const MAX_PER_USER = 3;
// ผู้ฟังที่รับไม่ทัน — เสียงค้างเกิน ~5 วินาที (48KB/s) ตัดทิ้ง ไม่ให้กินหน่วยความจำ
const MAX_BUFFERED_BYTES = 256 * 1024;
const ACCESS_RECHECK_MS = 5 * 60 * 1000;

// ==========================================
// 🎧 VOICE LISTEN — /api/guilds/:guildId/voice-listen (ต้องจัดการเซิร์ฟเวอร์ได้)
// GET  /         สถานะ: ห้องที่บอทอยู่ / ใครกำลังพูด / จำนวนผู้ฟัง
// POST /join     ให้บอทเข้าห้อง (หรือย้ายห้อง)
// POST /leave    ให้บอทออกจากห้อง
// GET  /stream   เสียงสด (PCM ดิบ ดูรูปแบบใน @notstack/shared voice-listen)
// ==========================================
@GuildRoute()
@Controller('guilds/:guildId/voice-listen')
export class VoiceListenController {
    private readonly connections = new Map<number, number>();

    constructor(
        private readonly voice: VoiceListenService,
        private readonly access: GuildAccessService,
    ) {}

    @Get()
    status(@GuildId() guildId: string): VoiceListenStatus {
        return this.voice.status(guildId);
    }

    @Post('join')
    @HttpCode(HttpStatus.OK)
    join(@GuildId() guildId: string, @Body() body: VoiceListenJoinDto, @AuditCtx() audit: AuditContext): Promise<VoiceListenStatus> {
        audit.action = 'voice_listen.join';
        return this.voice.join(guildId, body.channelId);
    }

    @Post('leave')
    @HttpCode(HttpStatus.OK)
    leave(@GuildId() guildId: string, @AuditCtx() audit: AuditContext): SuccessResponse {
        audit.action = 'voice_listen.leave';
        this.voice.leave(guildId);
        return { success: true };
    }

    @Get('stream')
    stream(@GuildId() guildId: string, @CurrentUser() user: User, @Req() req: Request, @Res() res: Response): void {
        const count = this.connections.get(user.id) ?? 0;
        if (count >= MAX_PER_USER) throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, 'เปิดฟังค้างไว้หลายแท็บเกินไป');
        this.connections.set(user.id, count + 1);

        let closed = false;
        let unsubscribe = () => {};
        // สิทธิ์เปลี่ยนได้ระหว่างที่เปิดฟังค้างไว้ (ถูกถอดยศ / บอทออกจากเซิร์ฟเวอร์)
        const recheck = setInterval(() => {
            void this.access
                .resolve(user, guildId)
                .then((level) => level === 'manage' || close())
                .catch(close);
        }, ACCESS_RECHECK_MS);
        recheck.unref?.();
        const close = () => {
            if (closed) return;
            closed = true;
            clearInterval(recheck);
            unsubscribe();
            const left = (this.connections.get(user.id) ?? 1) - 1;
            if (left <= 0) this.connections.delete(user.id);
            else this.connections.set(user.id, left);
            if (!res.writableEnded) res.end();
        };

        try {
            unsubscribe = this.voice.subscribe(guildId, {
                write: (frame) => {
                    if (res.writableEnded || res.destroyed) throw new Error('closed');
                    if (res.writableLength > MAX_BUFFERED_BYTES) {
                        res.destroy();
                        throw new Error('slow consumer');
                    }
                    res.write(frame);
                },
                close,
            });
        } catch (err) {
            close();
            throw err;
        }

        // application/octet-stream ไม่ผ่าน compression (ไม่ใช่ชนิดที่บีบอัดได้) — ข้อมูลไปถึงหน้าเว็บทันที
        res.status(200);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store, no-transform');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();
        req.on('close', close);
        res.on('error', close);
    }
}
