import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const PREFIX = 'v1';

function encryptionKey(secret: string): Buffer {
    if (!secret) throw new Error('AI key encryption secret is not configured');
    return createHash('sha256').update(secret).digest();
}

export function encryptGeminiKey(value: string, secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [PREFIX, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptGeminiKey(value: string, secret: string): string {
    const [version, iv, tag, encrypted] = value.split('.');
    if (version !== PREFIX || !iv || !tag || !encrypted) throw new Error('Unsupported encrypted AI key format');
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}

export function maskGeminiKey(value: string): string {
    return value.length < 10 ? `${value.slice(0, 2)}...` : `${value.slice(0, 6)}...${value.slice(-4)}`;
}
