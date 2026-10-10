import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';
import { ApiException } from '../../common/exceptions/api.exception';

// เกินลิมิต → ตอบ 429 ผ่าน exception filter ตัวเดียวกับ error อื่น ({ error: "..." })
function createLimiter(options: { windowMs: number; limit: number; skipSuccessfulRequests?: boolean; message: string }): RateLimitRequestHandler {
    return rateLimit({
        windowMs: options.windowMs,
        limit: options.limit,
        skipSuccessfulRequests: options.skipSuccessfulRequests ?? false,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        handler: (_req, _res, next) => next(new ApiException(HttpStatus.TOO_MANY_REQUESTS, options.message)),
    });
}

// นับเฉพาะครั้งที่ login ไม่สำเร็จ (คนใส่รหัสถูกไม่โดนจำกัด) — ทำงานคู่กับการล็อกบัญชีใน AuthService
const loginLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    message: 'คุณพยายามเข้าสู่ระบบผิดพลาดบ่อยเกินไป กรุณารอสักครู่',
});

const authLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    message: 'เรียกใช้งานบ่อยเกินไป กรุณารอสักครู่',
});

// รูปตัวอย่างที่วาดใหม่ทุกครั้ง (การ์ด Rank) — หน้าเว็บรอให้หยุดแก้ก่อนค่อยขอ ใช้จริงไม่ถึงลิมิตนี้ แต่กันการยิงรัวให้เซิร์ฟเวอร์วาดรูปไม่หยุด
const renderLimiter = createLimiter({
    windowMs: 60 * 1000,
    limit: 90,
    message: 'ขอรูปตัวอย่างบ่อยเกินไป กรุณารอสักครู่',
});

// เรียก middleware ของ express-rate-limit จากใน guard (ใช้ store ร่วมกันทุก route ที่ใช้ guard เดียวกัน)
function runLimiter(limiter: RateLimitRequestHandler, context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    return new Promise((resolve, reject) => {
        void limiter(http.getRequest<Request>(), http.getResponse<Response>(), (err?: unknown) => (err ? reject(err) : resolve(true)));
    });
}

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
    canActivate(context: ExecutionContext): Promise<boolean> {
        return runLimiter(loginLimiter, context);
    }
}

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
    canActivate(context: ExecutionContext): Promise<boolean> {
        return runLimiter(authLimiter, context);
    }
}

@Injectable()
export class RenderRateLimitGuard implements CanActivate {
    canActivate(context: ExecutionContext): Promise<boolean> {
        return runLimiter(renderLimiter, context);
    }
}
