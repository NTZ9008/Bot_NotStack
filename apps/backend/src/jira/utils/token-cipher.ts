import crypto from 'node:crypto';

// ==========================================
// 🔐 เข้ารหัส Jira API token ก่อนเก็บลงฐานข้อมูล (AES-256-GCM)
// กุญแจได้จาก JWT_SECRET — ถ้าเปลี่ยน JWT_SECRET ต้องกรอก API token ใหม่ในหน้าเว็บ
// รูปแบบที่เก็บ: v1.<iv>.<tag>.<ciphertext> (base64url)
// ==========================================
const VERSION = 'v1';

export class TokenCipher {
    private readonly key: Buffer | null;

    constructor(secret: string | undefined) {
        this.key = secret && secret.length >= 32 ? crypto.createHash('sha256').update(`jira-api-token:${secret}`).digest() : null;
    }

    get available(): boolean {
        return this.key !== null;
    }

    encrypt(plain: string): string {
        if (!this.key) throw new Error('ไม่มีกุญแจเข้ารหัส');
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
        const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
        return [VERSION, iv, cipher.getAuthTag(), data].map((part) => (typeof part === 'string' ? part : part.toString('base64url'))).join('.');
    }

    // ถอดไม่ได้ (กุญแจเปลี่ยน / ข้อมูลเสีย) = null
    decrypt(stored: string): string | null {
        if (!this.key || !stored) return null;
        const [version, iv, tag, data] = stored.split('.');
        if (version !== VERSION || !iv || !tag || data === undefined) return null;
        try {
            const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
            decipher.setAuthTag(Buffer.from(tag, 'base64url'));
            return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
        } catch {
            return null;
        }
    }
}
