import { Controller, Get, HttpStatus, Query, Req, Res } from '@nestjs/common';
import { AUTH_ERROR_CODES, isSnowflake } from '@notstack/shared';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiException, notFound } from '../common/exceptions/api.exception';
import type { User } from '../generated/prisma/client';
import { GuildAccessService } from '../guilds/guild-access.service';
import { GuildsService } from '../guilds/guilds.service';
import { LiveService, type LiveSink } from './live.service';

const MAX_PER_USER = 4;
// ผู้ชมที่รับไม่ทัน (เน็ตช้า / แท็บค้าง) — ข้อมูลค้างในบัฟเฟอร์เกินนี้ตัดทิ้งเลย ไม่ให้กินหน่วยความจำ
const MAX_BUFFERED_BYTES = 512 * 1024;
const ACCESS_RECHECK_MS = 5 * 60 * 1000;

// ==========================================
// 🌏 LIVE — Server-Sent Events ของลูกโลก 3D
// GET /api/live  ต้อง login — เฉพาะเซิร์ฟเวอร์ที่ผู้ใช้จัดการได้ (สิทธิ์ manage เหมือนหน้า Activity Log) — ?guild=<id> ดูเซิร์ฟเวอร์เดียว
// ไม่มี endpoint สาธารณะ: ลูกโลกในหน้า landing ใช้ข้อมูลจำลองฝั่งหน้าเว็บ (ไม่เปิดเผยกิจกรรมจริงให้คนนอก)
// ==========================================
@Controller('live')
export class LiveController {
    private readonly connections = new Map<string, number>();

    constructor(
        private readonly live: LiveService,
        private readonly guilds: GuildsService,
        private readonly access: GuildAccessService,
    ) {}

    @Get()
    async privateStream(@CurrentUser() user: User, @Req() req: Request, @Res() res: Response, @Query('guild') guild?: string): Promise<void> {
        const only = typeof guild === 'string' && guild ? guild : null;
        if (only && !isSnowflake(only)) throw notFound('ไม่พบเซิร์ฟเวอร์นี้');
        const key = `user:${user.id}`;
        this.acquire(key, MAX_PER_USER);
        let guildIds: Set<string> | null;
        try {
            guildIds = await this.managedGuilds(user, only);
        } catch (err) {
            this.release(key);
            throw err;
        }
        // สิทธิ์ในเซิร์ฟเวอร์เปลี่ยนได้ระหว่างที่เปิดหน้าค้างไว้ (ถูกถอดยศ / บอทออกจากเซิร์ฟเวอร์)
        let sink: LiveSink | null = null;
        const recheck = setInterval(() => {
            if (!sink) return;
            const target = sink;
            void this.managedGuilds(user, only)
                .then((ids) => this.live.updateScope(target, ids))
                // ตรวจไม่ผ่าน (ถูกถอดสิทธิ์) → หยุดส่งจนกว่าจะตรวจผ่านอีกครั้ง
                .catch(() => this.live.updateScope(target, new Set()));
        }, ACCESS_RECHECK_MS);
        recheck.unref?.();
        sink = this.open(req, res, guildIds, () => {
            clearInterval(recheck);
            this.release(key);
        });
    }

    // null = ทุกเซิร์ฟเวอร์ (ADMIN) ; only = ดูเซิร์ฟเวอร์เดียว (ต้องจัดการเซิร์ฟเวอร์นั้นได้)
    private async managedGuilds(user: User, only: string | null): Promise<Set<string> | null> {
        if (only) {
            if ((await this.access.resolve(user, only)) !== 'manage') {
                throw new ApiException(HttpStatus.FORBIDDEN, 'คุณไม่มีสิทธิ์ดูกิจกรรมของเซิร์ฟเวอร์นี้', AUTH_ERROR_CODES.forbidden);
            }
            return new Set([only]);
        }
        if (user.role === 'ADMIN') return null;
        const { guilds } = await this.guilds.listForUser(user);
        return new Set(guilds.filter((guild) => guild.access === 'manage').map((guild) => guild.id));
    }

    private acquire(key: string, max: number): void {
        const count = this.connections.get(key) ?? 0;
        if (count >= max) throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, 'เปิดหน้านี้ค้างไว้หลายแท็บเกินไป');
        this.connections.set(key, count + 1);
    }

    private release(key: string): void {
        const count = (this.connections.get(key) ?? 1) - 1;
        if (count <= 0) this.connections.delete(key);
        else this.connections.set(key, count);
    }

    private open(req: Request, res: Response, guildIds: Set<string> | null, onClose: () => void): LiveSink | null {
        // ปิดแท็บไปก่อนตรวจสิทธิ์เสร็จ — event close ผ่านไปแล้ว จะไม่มีใครเรียก onClose ให้
        if (res.destroyed || req.socket.destroyed) {
            onClose();
            return null;
        }
        res.status(200);
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store, no-transform');
        res.setHeader('Connection', 'keep-alive');
        // nginx ไม่ต้องพักข้อมูลไว้ก่อนส่ง
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();
        res.write('retry: 5000\n\n');

        const write = (chunk: string) => {
            if (res.writableEnded || res.destroyed) throw new Error('closed');
            if (res.writableLength > MAX_BUFFERED_BYTES) {
                res.destroy();
                throw new Error('slow consumer');
            }
            res.write(chunk);
        };
        const sink: LiveSink = {
            send: (event, data) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
            ping: () => write(': ping\n\n'),
        };

        let closed = false;
        let unsubscribe = () => {};
        const close = () => {
            if (closed) return;
            closed = true;
            unsubscribe();
            onClose();
        };
        req.on('close', close);
        res.on('error', close);
        try {
            unsubscribe = this.live.subscribe(guildIds, sink);
        } catch {
            close();
            res.end();
            return null;
        }
        if (closed) unsubscribe();
        return sink;
    }
}
