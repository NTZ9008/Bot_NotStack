import { Controller, Get, Header, Param } from '@nestjs/common';
import { AdminOnly } from '../common/decorators/roles.decorator';
import { LogFilesService } from './log-files.service';

// ไฟล์ log ของบอท (ข้อความแชทจากทุกเซิร์ฟเวอร์) — ADMIN ของระบบเท่านั้น
@AdminOnly()
@Controller('logs')
export class LogFilesController {
    constructor(private readonly files: LogFilesService) {}

    @Get()
    list(): string[] {
        return this.files.list();
    }

    // ส่งเป็นข้อความธรรมดา (text/plain) — เปิดลิงก์ตรงๆ แล้วเนื้อหาใน log จะไม่ถูกตีความเป็น HTML
    @Get(':filename')
    @Header('Content-Type', 'text/plain; charset=utf-8')
    @Header('X-Content-Type-Options', 'nosniff')
    read(@Param('filename') filename: string): string {
        return this.files.read(filename);
    }
}
