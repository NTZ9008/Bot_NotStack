import { Global, MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditController, GuildAuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditInterceptor } from './interceptors/audit.interceptor';
import { AuditRecorderMiddleware } from './middleware/audit-recorder.middleware';

@Global()
@Module({
    controllers: [AuditController, GuildAuditController],
    providers: [AuditService, { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
    exports: [AuditService],
})
export class AuditModule implements NestModule {
    // บันทึก audit log ของทุก API ที่แก้ข้อมูล (ดูรายละเอียดใน middleware)
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(AuditRecorderMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
    }
}
