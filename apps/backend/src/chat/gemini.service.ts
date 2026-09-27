import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import type { Env } from '../config/env.validation';

// Gemini Flash ให้ใช้ฟรีประมาณ 250 ครั้ง/วัน
export const AI_DAILY_LIMIT = 250;

// ==========================================
// 🧠 GEMINI — ใช้ทั้ง AI Chat (แท็กบอท) และตัวช่วยตัดสินคำหยาบตามบริบท
// ==========================================
@Injectable()
export class GeminiService {
    private readonly logger = new Logger('AI');
    private readonly model: GenerativeModel | null;
    // โควตาของ AI Chat (รีเซ็ตเมื่อขึ้นวันใหม่)
    private usage = { date: new Date().toDateString(), count: 0 };

    constructor(config: ConfigService<Env, true>) {
        const key = config.get('GEMINI_KEY', { infer: true });
        this.model = key ? new GoogleGenerativeAI(key).getGenerativeModel({ model: 'gemini-2.5-flash' }) : null;
        if (!key) this.logger.warn('ยังไม่ได้ตั้ง GEMINI_KEY — AI Chat และตัวกรองคำหยาบแบบ AI จะใช้งานไม่ได้');
    }

    async generate(prompt: string): Promise<string> {
        if (!this.model) throw new Error('ยังไม่ได้ตั้ง GEMINI_KEY');
        const result = await this.model.generateContent(prompt);
        return result.response.text();
    }

    // เช็ควันใหม่ก่อน (ถ้าวันที่เปลี่ยน ให้รีเซ็ตโควตาเป็น 0)
    quotaExhausted(): boolean {
        const today = new Date().toDateString();
        if (this.usage.date !== today) {
            this.usage = { date: today, count: 0 };
            this.logger.log('🔄 รีเซ็ตโควตา AI สำหรับวันใหม่แล้ว');
        }
        return this.usage.count >= AI_DAILY_LIMIT;
    }

    countUsage(): void {
        this.usage.count++;
        this.logger.log(`🧠 AI Used: ${this.usage.count}/${AI_DAILY_LIMIT}`);
    }
}
