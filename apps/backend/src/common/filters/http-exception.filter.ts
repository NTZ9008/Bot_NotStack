import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

// แปลงทุก error เป็น { error: "ข้อความ" } — ไม่ส่ง stack trace ออกไปให้ผู้ใช้เห็น
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger('Server');

    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const res = ctx.getResponse<Response>();
        const req = ctx.getRequest<Request>();
        if (res.headersSent) return;

        if (exception instanceof HttpException) {
            const status = exception.getStatus();
            const body = exception.getResponse();
            if (typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string' && !('statusCode' in body)) {
                res.status(status).json(body);
                return;
            }
            // exception มาตรฐานของ Nest ({ statusCode, message, error })
            const message =
                typeof body === 'string'
                    ? body
                    : Array.isArray((body as { message?: unknown }).message)
                      ? String((body as { message: unknown[] }).message[0])
                      : String((body as { message?: unknown }).message ?? exception.message);
            res.status(status).json({ error: message });
            return;
        }

        this.logger.error(`${req.method} ${req.originalUrl}: ${exception instanceof Error ? exception.stack : String(exception)}`);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Internal Server Error' });
    }
}
