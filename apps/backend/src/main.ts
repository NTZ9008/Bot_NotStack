import 'reflect-metadata';
import { Logger, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { WELCOME_MAX_UPLOAD_BYTES } from '@notstack/shared';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import type { Env } from './config/env.validation';

// ==========================================
// 🚀 BOOTSTRAP — API (/api/*) + GitHub webhook (/webhook/github*) และบอท Discord ในโปรเซสเดียวกัน
// (บอท login หลังจากทุกโมดูลพร้อม) — หน้า Dashboard deploy แยก (หรือเสิร์ฟจาก FRONTEND_DIST ถ้าตั้งไว้)
// ==========================================
async function bootstrap(): Promise<void> {
    // ปิด body parser ของ Nest แล้วตั้งเองตามลำดับด้านล่าง (webhook ต้องได้ raw body ก่อนถูก parse เป็น JSON)
    const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
    const logger = new Logger('Server');
    const config = app.get<ConfigService<Env, true>>(ConfigService);

    app.set('trust proxy', 1); // อยู่หลัง Nginx / Cloudflare

    app.use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", 'https://static.cloudflareinsights.com'],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    fontSrc: ["'self'", 'data:'],
                    // รูปจาก Discord CDN / ไอคอน OpenWeatherMap + รูปประกอบข่าวที่แอดมินใส่ลิงก์มาเอง
                    imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
                    connectSrc: ["'self'", 'https://cloudflareinsights.com'],
                    objectSrc: ["'none'"],
                },
            },
            // หน้าเว็บที่อยู่คนละ origin (CORS_ORIGINS) ต้องโหลดรูปจาก API ได้ (รูปพื้นหลังการ์ด / เรดาร์)
            crossOriginResourcePolicy: { policy: 'same-site' },
        }),
    );

    // หน้าเว็บอยู่คนละ origin กับ API (เช่น dashboard.example.com → api.example.com) — ต้องอยู่ domain เดียวกัน (same-site)
    // เพราะ cookie ของ session เป็น SameSite=Lax/Strict
    const corsOrigins = config.get('CORS_ORIGINS', { infer: true });
    if (corsOrigins.length) app.enableCors({ origin: corsOrigins, credentials: true, methods: ['GET', 'POST'] });

    app.use(cookieParser());

    // GitHub webhook: ต้องใช้ raw body ตรวจลายเซ็น HMAC
    app.use('/webhook', express.raw({ type: 'application/json', limit: '5mb' }));
    app.use(express.json({ limit: '1mb' }));
    // อัปโหลดรูปพื้นหลังการ์ดต้อนรับเป็นไฟล์ดิบ (body = ตัวไฟล์รูป)
    app.use(express.raw({ type: 'image/*', limit: WELCOME_MAX_UPLOAD_BYTES }));

    // error จาก body parser (เช่นไฟล์ใหญ่เกิน, JSON พัง) — ตอบเป็น JSON เหมือน error อื่น
    app.use((err: Error & { status?: number; statusCode?: number; expose?: boolean }, req: Request, res: Response, next: NextFunction) => {
        if (res.headersSent) return next(err);
        const status = err.status ?? err.statusCode ?? 500;
        if (status >= 500) logger.error(`${req.method} ${req.originalUrl}: ${err.stack ?? err.message}`);
        const message = status === 413 ? 'ไฟล์ใหญ่เกินกำหนด' : err.expose ? err.message : 'Internal Server Error';
        res.status(status).json({ error: message });
    });

    app.setGlobalPrefix('api', {
        exclude: [
            { path: 'webhook/github', method: RequestMethod.POST },
            { path: 'webhook/github/:guildId', method: RequestMethod.POST },
        ],
    });
    app.enableShutdownHooks();

    const port = config.get('PORT', { infer: true });
    await app.listen(port);
    logger.log(`🚀 API running on http://localhost:${port}`);
}

void bootstrap();
