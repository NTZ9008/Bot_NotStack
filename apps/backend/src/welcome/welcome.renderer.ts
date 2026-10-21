import { safeImage, readBoundedResponse } from '../common/utils/safe-image';
import { renderSurface } from '../common/utils/render-surface';
import { Injectable, Logger } from '@nestjs/common';
import { loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import { fillPlaceholders, WELCOME_MAX_UPLOAD_BYTES, type WelcomeDesign, type WelcomeTextLayer, type WelcomeVars } from '@notstack/shared';
import type { User } from 'discord.js';
import { fontString, registerFonts } from '../common/canvas/fonts';
import { WelcomeStore } from './welcome.store';

const AVATAR_TIMEOUT_MS = 5000;
// รูปโปรไฟล์ที่ขอจาก Discord (ไม่เกิน 512px) ไม่ควรใหญ่เกินนี้
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
// รูปที่ใหญ่กว่านี้จะถูกย่อก่อนเก็บลงฐานข้อมูล (การ์ดกว้างได้สูงสุด 2000px อยู่แล้ว)
const ASSET_CACHE_SIZE = 8;
// /leaderboard โหลดทีละ 10 คน + ไอคอนเซิร์ฟเวอร์
const AVATAR_CACHE_SIZE = 64;

// เช็คชนิดไฟล์จาก byte แรกของไฟล์จริง (ไม่เชื่อ Content-Type ที่ส่งมา)
function sniffImageType(buffer: Buffer): string | null {
    if (buffer.length < 12) return null;
    if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer.subarray(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
    if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
    return null;
}

// LRU แบบง่าย: ย้ายตัวที่เพิ่งใช้ไปท้ายสุด แล้วตัดตัวแรกทิ้งเมื่อเกินขนาด
function remember<K, V>(cache: Map<K, V>, key: K, value: V, max: number): void {
    cache.delete(key);
    cache.set(key, value);
    if (cache.size > max) cache.delete(cache.keys().next().value as K);
}

// ==========================================
// 🖼️ RENDER — วาดการ์ดต้อนรับเป็นไฟล์ PNG ด้วย @napi-rs/canvas (ไม่ต้องติดตั้งโปรแกรมอื่นในเครื่อง)
// ลำดับชั้น: สีพื้น → รูปพื้นหลัง → ชั้นสีทับ (overlay) → avatar → ข้อความทีละชั้น
// ใช้ฟังก์ชันเดียวกันทั้งตอนส่งจริงและตอนดูตัวอย่างใน Dashboard ภาพที่เห็นจึงตรงกับของจริงเสมอ
// ==========================================
@Injectable()
export class WelcomeRenderer {
    private readonly logger = new Logger('Welcome');
    // รูปในคลังแก้ไม่ได้ มีแต่เพิ่ม/ลบ จึง cache ตาม id ได้เลย
    private readonly assetCache = new Map<number, Image>();
    // รูปโปรไฟล์ที่เพิ่งโหลด — URL มี hash ของรูปอยู่แล้ว ถ้าสมาชิกเปลี่ยนรูป URL ก็เปลี่ยนตาม
    private readonly avatarCache = new Map<string, Image>();

    constructor(private readonly store: WelcomeStore) {
        registerFonts();
    }

    async loadAssetImage(assetId: number | null | undefined): Promise<Image | null> {
        if (!assetId) return null;
        const cached = this.assetCache.get(assetId);
        if (cached) {
            remember(this.assetCache, assetId, cached, ASSET_CACHE_SIZE);
            return cached;
        }
        const file = await this.store.getAssetFile(assetId);
        if (!file) return null;
        // รูปในคลังผ่าน safeImage (ตรวจพิกเซล + ย่อไม่เกิน 2400px) ตั้งแต่ตอนอัปโหลดแล้ว — เปิดตรงได้เลย ไม่ต้องรอคิวประมวลผลซ้ำ
        const image = await loadImage(Buffer.from(file.data));
        remember(this.assetCache, assetId, image, ASSET_CACHE_SIZE);
        return image;
    }

    forgetAsset(assetId: number): void {
        this.assetCache.delete(assetId);
    }

    // ดึงรูปโปรไฟล์จาก Discord CDN — ถ้าช้า/ล้ม ให้วาดสี่เหลี่ยมสีแทน ไม่ให้การ์ดทั้งใบส่งไม่ออก
    async loadAvatarImage(user: User | null | undefined, size: 128 | 256 | 512 = 512): Promise<Image | null> {
        if (!user) return null;
        return this.loadImageUrl(user.displayAvatarURL({ extension: 'png', size, forceStatic: true }), `avatar ของ ${user.id}`);
    }

    // รูปจาก Discord CDN (avatar / ไอคอนเซิร์ฟเวอร์) — URL มี hash ของรูปอยู่แล้วจึง cache ตาม URL ได้
    async loadImageUrl(url: string | null | undefined, label: string): Promise<Image | null> {
        if (!url) return null;
        try {
            const cached = this.avatarCache.get(url);
            if (cached) return cached;

            const parsed = new URL(url);
            if (
                parsed.protocol !== 'https:' ||
                !['cdn.discordapp.com', 'media.discordapp.net'].includes(parsed.hostname) ||
                parsed.port ||
                parsed.username ||
                parsed.password
            )
                throw new Error('Unsupported image host');
            const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(AVATAR_TIMEOUT_MS) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const image = await loadImage((await safeImage(await readBoundedResponse(res, AVATAR_MAX_BYTES), 512)).data);
            remember(this.avatarCache, url, image, AVATAR_CACHE_SIZE);
            return image;
        } catch (err) {
            this.logger.warn(`โหลด ${label} ไม่สำเร็จ: ${(err as Error).message}`);
            return null;
        }
    }

    // ตรวจไฟล์ที่อัปโหลด แล้วย่อรูปใหญ่ลงก่อนเก็บ
    async prepareAssetUpload(buffer: unknown): Promise<{ mimeType: string; width: number; height: number; data: Buffer }> {
        if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('ไม่พบไฟล์รูปที่อัปโหลด');
        if (buffer.length > WELCOME_MAX_UPLOAD_BYTES) throw new Error('ไฟล์รูปใหญ่เกิน 8 MB');

        const mimeType = sniffImageType(buffer);
        if (!mimeType) throw new Error('รองรับเฉพาะไฟล์ PNG, JPG, WEBP และ GIF');

        return safeImage(buffer);
    }

    // ==========================================
    // วาดแต่ละชั้น
    // ==========================================
    private drawBackground(ctx: SKRSContext2D, design: WelcomeDesign, image: Image | null): void {
        const { width, height, background } = design;
        ctx.fillStyle = background.color;
        ctx.fillRect(0, 0, width, height);

        if (image) {
            let w = width;
            let h = height;
            if (background.fit !== 'stretch') {
                const pick = background.fit === 'cover' ? Math.max : Math.min;
                const scale = pick(width / image.width, height / image.height);
                w = image.width * scale;
                h = image.height * scale;
            }
            let x = (width - w) / 2;
            let y = (height - h) / 2;

            ctx.save();
            if (background.blur > 0) {
                // ขยายรูปออกเลยขอบเล็กน้อย ไม่งั้นขอบภาพที่เบลอจะจางเป็นสีพื้น
                const pad = background.blur * 2;
                if (background.fit !== 'contain') {
                    x -= pad;
                    y -= pad;
                    w += pad * 2;
                    h += pad * 2;
                }
                ctx.filter = `blur(${background.blur}px)`;
            }
            ctx.drawImage(image, x, y, w, h);
            ctx.restore();
        }

        if (background.overlayOpacity > 0) {
            ctx.save();
            ctx.globalAlpha = background.overlayOpacity;
            ctx.fillStyle = background.overlayColor;
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
        }
    }

    private shapePath(ctx: SKRSContext2D, cx: number, cy: number, half: number, shape: WelcomeDesign['avatar']['shape']): void {
        ctx.beginPath();
        if (shape === 'circle') {
            ctx.arc(cx, cy, half, 0, Math.PI * 2);
        } else {
            ctx.roundRect(cx - half, cy - half, half * 2, half * 2, shape === 'rounded' ? half * 0.28 : 0);
        }
    }

    private drawAvatar(ctx: SKRSContext2D, avatar: WelcomeDesign['avatar'], image: Image | null): void {
        if (!avatar.visible) return;
        const half = avatar.size / 2;

        if (avatar.borderWidth > 0) {
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
            ctx.shadowBlur = 18;
            ctx.fillStyle = avatar.borderColor;
            this.shapePath(ctx, avatar.x, avatar.y, half + avatar.borderWidth, avatar.shape);
            ctx.fill();
            ctx.restore();
        }

        ctx.save();
        this.shapePath(ctx, avatar.x, avatar.y, half, avatar.shape);
        ctx.clip();
        if (image) {
            ctx.drawImage(image, avatar.x - half, avatar.y - half, avatar.size, avatar.size);
        } else {
            ctx.fillStyle = '#5865f2';
            ctx.fillRect(avatar.x - half, avatar.y - half, avatar.size, avatar.size);
        }
        ctx.restore();
    }

    private drawText(ctx: SKRSContext2D, layer: WelcomeTextLayer, vars: WelcomeVars): void {
        const lines = fillPlaceholders(layer.text, vars, 'image')
            .split('\n')
            .map((line) => line.trimEnd());
        if (!lines.some(Boolean)) return;

        const spacing = layer.letterSpacing;
        ctx.letterSpacing = `${spacing}px`;

        // ชื่อยาวเกินกรอบ → ย่อตัวอักษรลงทีละนิดจนพอดี (ไม่ตัดชื่อทิ้ง)
        let size = layer.size;
        const widest = () => Math.max(...lines.map((line) => ctx.measureText(line).width));
        ctx.font = fontString(layer.font, layer.weight, size);
        while (layer.maxWidth > 0 && size > 8 && widest() > layer.maxWidth) {
            size = Math.max(8, Math.floor(size * 0.92));
            ctx.font = fontString(layer.font, layer.weight, size);
        }

        ctx.textAlign = layer.align;
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';

        // letterSpacing เว้นที่ท้ายตัวสุดท้ายด้วย — ขยับชดเชยให้ข้อความยังอยู่กึ่งกลาง/ชิดขวาจริง
        const x = layer.x + (layer.align === 'center' ? spacing / 2 : layer.align === 'right' ? spacing : 0);
        const lineHeight = size * 1.25;
        const top = layer.y - ((lines.length - 1) * lineHeight) / 2;

        lines.forEach((line, i) => {
            if (!line) return;
            const y = top + i * lineHeight;
            ctx.save();
            if (layer.shadow) {
                ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
                ctx.shadowBlur = Math.max(4, size * 0.18);
                ctx.shadowOffsetY = Math.max(1, size * 0.05);
            }
            if (layer.strokeWidth > 0) {
                ctx.lineWidth = layer.strokeWidth * 2;
                ctx.strokeStyle = layer.strokeColor;
                ctx.strokeText(line, x, y);
                ctx.shadowColor = 'transparent'; // เงาเดียวพอ ไม่ต้องซ้อนทั้งขอบและตัวอักษร
            }
            ctx.fillStyle = layer.color;
            ctx.fillText(line, x, y);
            ctx.restore();
        });

        ctx.letterSpacing = '0px';
    }

    // design ต้องผ่าน normalizeDesign มาแล้ว — คืนไฟล์ PNG
    async render(
        { design, background = null, avatar = null, vars }: { design: WelcomeDesign; background?: Image | null; avatar?: Image | null; vars: WelcomeVars },
        compact = false,
    ): Promise<Buffer> {
        const { ctx, encode } = renderSurface(design.width, design.height, compact);

        this.drawBackground(ctx, design, background);
        this.drawAvatar(ctx, design.avatar, avatar);
        for (const layer of design.texts) this.drawText(ctx, layer, vars);

        return encode();
    }
}
