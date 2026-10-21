import fs from 'node:fs';
import path from 'node:path';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { badRequest, notFound } from '../common/exceptions/api.exception';
import { bangkokDay } from '../common/utils/parse.util';
import type { Env } from '../config/env.validation';
import { DEFAULT_LOG_DIR } from '../config/paths';

// อ่านไฟล์ได้ทีละไม่เกินเท่านี้ — ไฟล์ใหญ่กว่านี้ส่งเฉพาะส่วนท้าย (ไม่ต้องโหลดทั้งไฟล์เข้า memory)
export const LOG_READ_MAX_BYTES = 2 * 1024 * 1024;
// ชื่อไฟล์ทุกแบบขึ้นต้นด้วยวันที่ (YYYY-MM-DD)
const DATED_FILE = /^(\d{4}-\d{2}-\d{2})[._]/;

// ==========================================
// 🗒️ LOG FILES — ไฟล์ log แบบข้อความรายวัน (ตามวันที่เวลาไทย) ในโฟลเดอร์ logs/ (ดูได้ในหน้า Logs)
//   YYYY-MM-DD.log          ข้อความแชทของเซิร์ฟเวอร์หลัก
//   YYYY-MM-DD_history.log  เข้า/ออก/ย้ายห้องเสียงของเซิร์ฟเวอร์หลัก
//   special/YYYY-MM-DD_specialrole.txt  การขอยศพิเศษ (/addroles)
// ไฟล์ที่เก่ากว่า LOG_RETENTION_DAYS วันถูกลบเอง (ตอนเปิดเซิร์ฟเวอร์ และทุก 6 ชั่วโมง)
// ==========================================
@Injectable()
export class LogFilesService implements OnApplicationBootstrap {
    private readonly logger = new Logger('LogFiles');
    readonly dir: string;
    private readonly retentionDays: number;

    constructor(config: ConfigService<Env, true>) {
        this.dir = config.get('LOG_DIR', { infer: true }) ?? DEFAULT_LOG_DIR;
        this.retentionDays = config.get('LOG_RETENTION_DAYS', { infer: true });
    }

    onApplicationBootstrap(): void {
        this.deleteOld();
    }

    private append(relative: string, line: string): void {
        const file = path.join(this.dir, relative);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.appendFile(file, line, (err) => {
            if (err) this.logger.error(`เขียนไฟล์ ${relative} ไม่สำเร็จ: ${err.message}`);
        });
    }

    appendMessage(line: string): void {
        this.append(`${bangkokDay()}.log`, line);
    }

    appendVoiceHistory(line: string): void {
        this.append(`${bangkokDay()}_history.log`, line);
    }

    appendSpecialRole(line: string): void {
        this.append(path.join('special', `${bangkokDay()}_specialrole.txt`), line);
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

        const { size } = fs.statSync(file);
        if (size <= LOG_READ_MAX_BYTES) return fs.readFileSync(file, 'utf8');

        // ไฟล์ใหญ่: อ่านเฉพาะส่วนท้าย แล้วตัดบรรทัดแรกที่อาจขาดครึ่งทิ้ง (กันตัวอักษร UTF-8 ขาดกลางตัวด้วย)
        const buffer = Buffer.alloc(LOG_READ_MAX_BYTES);
        const fd = fs.openSync(file, 'r');
        try {
            fs.readSync(fd, buffer, 0, LOG_READ_MAX_BYTES, size - LOG_READ_MAX_BYTES);
        } finally {
            fs.closeSync(fd);
        }
        const firstLine = buffer.indexOf(0x0a);
        const tail = buffer.subarray(firstLine + 1).toString('utf8');
        const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
        return `… ไฟล์ใหญ่ ${mb(size)} MB — แสดงเฉพาะ ${mb(LOG_READ_MAX_BYTES)} MB สุดท้าย …\n${tail}`;
    }

    // ลบไฟล์ที่วันที่ในชื่อเก่ากว่ากำหนด (ทั้งในโฟลเดอร์หลักและ special/)
    @Interval(6 * 3600000)
    deleteOld(): void {
        const cutoff = bangkokDay(new Date(Date.now() - this.retentionDays * 86400000));
        let removed = 0;
        for (const dir of [this.dir, path.join(this.dir, 'special')]) {
            if (!fs.existsSync(dir)) continue;
            for (const name of fs.readdirSync(dir)) {
                const day = DATED_FILE.exec(name)?.[1];
                if (!day || day >= cutoff) continue;
                try {
                    fs.rmSync(path.join(dir, name), { force: true });
                    removed++;
                } catch (err) {
                    this.logger.error(`ลบไฟล์ log เก่า ${name} ไม่สำเร็จ: ${(err as Error).message}`);
                }
            }
        }
        if (removed) this.logger.log(`🧹 ลบไฟล์ log ที่เก่ากว่า ${this.retentionDays} วันแล้ว ${removed} ไฟล์`);
    }
}
