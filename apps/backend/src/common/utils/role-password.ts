import crypto from 'node:crypto';

// ==========================================
// 🔑 รหัสผ่านรับยศ (/verify, /addroles) — ค่าจริงอยู่ใน .env ไม่ใช่ในโค้ด (repo เป็น public)
// ==========================================

// เทียบแบบใช้เวลาเท่ากันทุกครั้ง (hash ก่อน ความยาวจึงเท่ากันเสมอ)
export function passwordMatches(input: string, expected: string): boolean {
    const digest = (value: string) => crypto.createHash('sha256').update(value, 'utf8').digest();
    return crypto.timingSafeEqual(digest(input.trim()), digest(expected));
}

// กันเดารหัส: ผิดครบ maxFailures ครั้งภายใน windowMs → ล็อกจนครบ windowMs นับจากครั้งแรกที่ผิด
export class AttemptLimiter {
    private readonly failures = new Map<string, { count: number; firstAt: number }>();

    constructor(
        private readonly maxFailures: number,
        private readonly windowMs: number,
    ) {}

    // เวลา (ms) ที่จะลองใหม่ได้ — null = ลองได้เลย
    blockedUntil(key: string, now = Date.now()): number | null {
        const entry = this.failures.get(key);
        if (!entry) return null;
        if (now - entry.firstAt >= this.windowMs) {
            this.failures.delete(key);
            return null;
        }
        return entry.count >= this.maxFailures ? entry.firstAt + this.windowMs : null;
    }

    fail(key: string, now = Date.now()): void {
        const entry = this.failures.get(key);
        if (entry && now - entry.firstAt < this.windowMs) entry.count++;
        else this.failures.set(key, { count: 1, firstAt: now });
        if (this.failures.size > 1000) {
            for (const [id, value] of this.failures) if (now - value.firstAt >= this.windowMs) this.failures.delete(id);
        }
    }

    reset(key: string): void {
        this.failures.delete(key);
    }
}
