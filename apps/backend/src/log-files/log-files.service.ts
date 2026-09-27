import fs from 'node:fs';
import path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { badRequest, notFound } from '../common/exceptions/api.exception';
import type { Env } from '../config/env.validation';
import { DEFAULT_LOG_DIR } from '../config/paths';

// ==========================================
// 🗒️ LOG FILES — ไฟล์ log แบบข้อความรายวันในโฟลเดอร์ logs/ (ดูได้ในหน้า Logs)
//   YYYY-MM-DD.log          ข้อความแชททุกข้อความ
//   YYYY-MM-DD_history.log  เข้า/ออก/ย้ายห้องเสียง
//   special/YYYY-MM-DD_specialrole.txt  การขอยศพิเศษ (/addroles)
// ==========================================
@Injectable()
export class LogFilesService {
    private readonly logger = new Logger('LogFiles');
    readonly dir: string;

    constructor(config: ConfigService<Env, true>) {
        this.dir = config.get('LOG_DIR', { infer: true }) ?? DEFAULT_LOG_DIR;
    }

    private append(relative: string, line: string): void {
        const file = path.join(this.dir, relative);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.appendFile(file, line, (err) => {
            if (err) this.logger.error(`เขียนไฟล์ ${relative} ไม่สำเร็จ: ${err.message}`);
        });
    }

    private today(): string {
        return new Date().toISOString().split('T')[0]!;
    }

    appendMessage(line: string): void {
        this.append(`${this.today()}.log`, line);
    }

    appendVoiceHistory(line: string): void {
        this.append(`${this.today()}_history.log`, line);
    }

    appendSpecialRole(line: string): void {
        this.append(path.join('special', `${this.today()}_specialrole.txt`), line);
    }

    // เฉพาะไฟล์ .log เรียงจากใหม่ไปเก่า
    list(): string[] {
        if (!fs.existsSync(this.dir)) return [];
        return fs
            .readdirSync(this.dir)
            .filter((file) => file.endsWith('.log'))
            .sort()
            .reverse();
    }

    read(filename: string): string {
        // ป้องกัน Directory Traversal
        const name = path.basename(filename);
        if (!name.endsWith('.log')) throw badRequest('Invalid file type');
        const file = path.join(this.dir, name);
        if (!fs.existsSync(file)) throw notFound('Log file not found');
        return fs.readFileSync(file, 'utf8');
    }
}
