import { Injectable } from '@nestjs/common';
import { createCanvas, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import { LEVEL_UP_CARD_SIZE, RANK_CARD_SIZES, type RankCardBackground, type RankCardStyle } from '@notstack/shared';
import { fontString, registerFonts } from '../common/canvas/fonts';

// ข้อมูลที่ใช้วาด (รูปโหลดมาแล้ว — ตัววาดไม่ยิงเน็ตเอง จึงเทสต์ได้โดยไม่ต้องต่อ Discord)
export interface RankProgress {
    level: number;
    xp: number;
    // XP สะสมที่เริ่มเลเวลนี้ / ที่ต้องมีเพื่อขึ้นเลเวลถัดไป
    levelStartXp: number;
    nextLevelXp: number;
}

export interface RankCardData extends RankProgress {
    displayName: string;
    username: string;
    avatar: Image | null;
    // null = ยังไม่มี XP ในเซิร์ฟเวอร์นี้
    rank: number | null;
    serverName: string;
}

export interface LeaderboardRow extends RankProgress {
    rank: number;
    displayName: string;
    avatar: Image | null;
}

export interface LeaderboardData {
    serverName: string;
    serverIcon: Image | null;
    page: number;
    totalPages: number;
    rows: LeaderboardRow[];
}

export interface LevelUpCardData {
    displayName: string;
    avatar: Image | null;
    previousLevel: number;
    level: number;
    rewardNames: string[];
}

export interface CardImages {
    background: Image | null;
}

// lib ของ backend ไม่มี DOM จึงไม่มี type CanvasTextAlign / CanvasTextBaseline ให้ใช้
type TextAlign = 'left' | 'right' | 'center' | 'start' | 'end';
type TextBaseline = 'top' | 'hanging' | 'middle' | 'alphabetic' | 'ideographic' | 'bottom';

const MEDALS = ['#fbbf24', '#e2e8f0', '#f59e0b'];
const LB_HEADER = 140;
const LB_ROW = 88;
const LB_GAP = 10;

// 1234567 → "1.2M" (ใช้ในที่แคบ) / ตัวเลขทั่วไปใส่ comma
export function compactNumber(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
    if (value >= 10_000) return `${(value / 1000).toFixed(value >= 100_000 ? 0 : 1)}K`;
    return value.toLocaleString('en-US');
}

export const progressOf = ({ xp, levelStartXp, nextLevelXp }: RankProgress): number =>
    nextLevelXp > levelStartXp ? Math.max(0, Math.min(1, (xp - levelStartXp) / (nextLevelXp - levelStartXp))) : 1;

function hexToRgb(hex: string): [number, number, number] {
    const n = Number.parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const rgba = (hex: string, alpha: number) => `rgba(${hexToRgb(hex).join(', ')}, ${alpha})`;

// สีเดิมแต่สว่างขึ้น (ใช้ทำปลายหลอดความคืบหน้าแบบไล่สี)
function lighten(hex: string, amount: number): string {
    const [r, g, b] = hexToRgb(hex).map((c) => Math.round(c + (255 - c) * amount));
    return `rgb(${r}, ${g}, ${b})`;
}

// ==========================================
// 🏆 RANK CARD RENDERER — วาดการ์ด /rank (3 แบบ), ตาราง /leaderboard และการ์ดเลเวลอัป เป็น PNG
// ทุกแบบใช้สไตล์ชุดเดียวกัน (พื้นหลัง สี ฟอนต์ รูปทรง avatar) และใช้ทั้งตอนส่งจริงและตอนดูตัวอย่างในหน้าเว็บ
// ข้อความยาวเกินพื้นที่ → ย่อตัวอักษรลงก่อน แล้วค่อยตัดท้ายเป็น "…" (ชื่อยาว / ตัวเลขใหญ่ไม่ล้นกรอบ)
// ==========================================
@Injectable()
export class RankCardRenderer {
    constructor() {
        registerFonts();
    }

    // ==========================================
    // ชิ้นส่วนที่ใช้ร่วมกัน
    // ==========================================
    private background(ctx: SKRSContext2D, width: number, height: number, bg: RankCardBackground, image: Image | null): void {
        if (bg.type === 'gradient') {
            const rad = (bg.angle * Math.PI) / 180;
            const dx = (Math.cos(rad) * width) / 2;
            const dy = (Math.sin(rad) * height) / 2;
            const gradient = ctx.createLinearGradient(width / 2 - dx, height / 2 - dy, width / 2 + dx, height / 2 + dy);
            gradient.addColorStop(0, bg.color);
            gradient.addColorStop(1, bg.color2);
            ctx.fillStyle = gradient;
        } else {
            ctx.fillStyle = bg.color;
        }
        ctx.fillRect(0, 0, width, height);

        if (bg.type === 'image' && image) {
            // เต็มกรอบแบบครอป — เบลอแล้วขยายเลยขอบนิดหน่อย ไม่ให้ขอบจางเป็นสีพื้น
            const pad = bg.blur * 2;
            const scale = Math.max((width + pad * 2) / image.width, (height + pad * 2) / image.height);
            const w = image.width * scale;
            const h = image.height * scale;
            ctx.save();
            if (bg.blur > 0) ctx.filter = `blur(${bg.blur}px)`;
            ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
            ctx.restore();
        }

        if (bg.overlayOpacity > 0) {
            ctx.fillStyle = `rgba(0, 0, 0, ${bg.overlayOpacity})`;
            ctx.fillRect(0, 0, width, height);
        }
    }

    private panel(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, radius: number, opacity: number): void {
        if (opacity <= 0) return;
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, radius);
        ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }

    private shapePath(ctx: SKRSContext2D, cx: number, cy: number, half: number, shape: RankCardStyle['avatarShape']): void {
        ctx.beginPath();
        if (shape === 'circle') ctx.arc(cx, cy, half, 0, Math.PI * 2);
        else ctx.roundRect(cx - half, cy - half, half * 2, half * 2, shape === 'rounded' ? half * 0.28 : 0);
    }

    private avatar(ctx: SKRSContext2D, style: RankCardStyle, image: Image | null, cx: number, cy: number, size: number, ring: number): void {
        const half = size / 2;
        if (ring > 0) {
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
            ctx.shadowBlur = 16;
            ctx.fillStyle = style.accentColor;
            this.shapePath(ctx, cx, cy, half + ring, style.avatarShape);
            ctx.fill();
            ctx.restore();
        }
        ctx.save();
        this.shapePath(ctx, cx, cy, half, style.avatarShape);
        ctx.clip();
        if (image) {
            ctx.drawImage(image, cx - half, cy - half, size, size);
        } else {
            ctx.fillStyle = '#5865f2';
            ctx.fillRect(cx - half, cy - half, size, size);
        }
        ctx.restore();
    }

    // ตั้งฟอนต์ให้ข้อความพอดี maxWidth (ย่อจนถึง minSize แล้วตัดท้ายเป็น …) — คืนข้อความที่จะวาด
    private fit(ctx: SKRSContext2D, style: RankCardStyle, text: string, weight: number, size: number, maxWidth: number, minSize = Math.round(size * 0.6)): string {
        let current = size;
        ctx.font = fontString(style.font, weight, current);
        while (current > minSize && ctx.measureText(text).width > maxWidth) {
            current = Math.max(minSize, Math.floor(current * 0.92));
            ctx.font = fontString(style.font, weight, current);
        }
        if (ctx.measureText(text).width <= maxWidth) return text;
        const chars = [...text];
        while (chars.length > 1 && ctx.measureText(`${chars.join('')}…`).width > maxWidth) chars.pop();
        return `${chars.join('')}…`;
    }

    private text(
        ctx: SKRSContext2D,
        style: RankCardStyle,
        text: string,
        x: number,
        y: number,
        opts: { size: number; weight?: number; color?: string; align?: TextAlign; maxWidth?: number; baseline?: TextBaseline; shadow?: boolean },
    ): number {
        const weight = opts.weight ?? 400;
        const value = opts.maxWidth ? this.fit(ctx, style, text, weight, opts.size, opts.maxWidth) : text;
        if (!opts.maxWidth) ctx.font = fontString(style.font, weight, opts.size);
        ctx.save();
        ctx.textAlign = opts.align ?? 'left';
        ctx.textBaseline = opts.baseline ?? 'middle';
        if (opts.shadow !== false) {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
            ctx.shadowBlur = 6;
            ctx.shadowOffsetY = 1;
        }
        ctx.fillStyle = opts.color ?? style.textColor;
        ctx.fillText(value, x, y);
        const width = ctx.measureText(value).width;
        ctx.restore();
        return width;
    }

    private bar(ctx: SKRSContext2D, style: RankCardStyle, x: number, y: number, w: number, h: number, progress: number): void {
        const r = h / 2;
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
        ctx.fillStyle = rgba(style.trackColor, 0.85);
        ctx.fill();
        if (progress > 0) {
            // ความยาวขั้นต่ำเท่าความสูง ไม่งั้นหลอดสั้นๆ จะกลายเป็นวงรีแบน
            const fill = Math.max(h, w * progress);
            const gradient = ctx.createLinearGradient(x, 0, x + fill, 0);
            gradient.addColorStop(0, style.accentColor);
            gradient.addColorStop(1, lighten(style.accentColor, 0.35));
            ctx.beginPath();
            ctx.roundRect(x, y, fill, h, r);
            ctx.fillStyle = gradient;
            ctx.fill();
        }
        ctx.restore();
    }

    // "LABEL value" ชิดขวา — คืนตำแหน่ง x ซ้ายสุดที่ใช้ไป (วางตัวถัดไปต่อทางซ้ายได้)
    private stat(ctx: SKRSContext2D, style: RankCardStyle, right: number, baseline: number, label: string, value: string, valueColor: string, valueSize: number): number {
        const valueWidth = this.text(ctx, style, value, right, baseline, { size: valueSize, weight: 900, color: valueColor, align: 'right', baseline: 'alphabetic' });
        const labelRight = right - valueWidth - 10;
        const labelWidth = this.text(ctx, style, label, labelRight, baseline, {
            size: Math.round(valueSize * 0.42),
            weight: 700,
            color: style.subTextColor,
            align: 'right',
            baseline: 'alphabetic',
        });
        return labelRight - labelWidth;
    }

    private subtitle(style: RankCardStyle, data: RankCardData): string {
        const parts = [style.show.username ? `@${data.username}` : '', style.show.serverName ? data.serverName : ''].filter(Boolean);
        return parts.join('  •  ');
    }

    private xpLine(data: RankProgress): string {
        const format = (n: number) => (n >= 10_000_000 ? compactNumber(n) : n.toLocaleString('en-US'));
        return `${format(data.xp)} / ${format(data.nextLevelXp)} XP`;
    }

    private remainingLine(data: RankProgress): string {
        return `อีก ${compactNumber(Math.max(0, data.nextLevelXp - data.xp))} XP ถึงเลเวล ${data.level + 1}`;
    }

    // ==========================================
    // การ์ด /rank
    // ==========================================
    async renderRank(style: RankCardStyle, data: RankCardData, images: CardImages): Promise<Buffer> {
        const { width, height } = RANK_CARD_SIZES[style.layout];
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        this.background(ctx, width, height, style.background, images.background);
        if (style.layout === 'centered') this.centered(ctx, style, data);
        else if (style.layout === 'minimal') this.minimal(ctx, style, data);
        else this.classic(ctx, style, data);
        return canvas.encode('png');
    }

    private classic(ctx: SKRSContext2D, style: RankCardStyle, data: RankCardData): void {
        this.panel(ctx, 20, 20, 960, 260, 28, style.panelOpacity);
        this.avatar(ctx, style, data.avatar, 160, 150, 196, 6);

        // ตัวเลขมุมขวาบน: LEVEL ชิดขวาสุด แล้ว RANK ต่อทางซ้าย
        let left = 950;
        if (style.show.level) left = this.stat(ctx, style, left, 108, 'LEVEL', compactNumber(data.level), style.accentColor, 56) - 28;
        if (style.show.rank) left = this.stat(ctx, style, left, 108, 'RANK', data.rank ? `#${compactNumber(data.rank)}` : '-', style.textColor, 56) - 28;

        const subtitle = this.subtitle(style, data);
        const nameY = subtitle ? 100 : 120;
        this.text(ctx, style, data.displayName, 290, nameY, { size: 46, weight: 700, maxWidth: Math.max(160, left - 290) });
        if (subtitle) this.text(ctx, style, subtitle, 290, 146, { size: 24, color: style.subTextColor, maxWidth: Math.max(160, left - 290) });

        if (style.show.xpText) {
            this.text(ctx, style, this.remainingLine(data), 292, 196, { size: 22, color: style.subTextColor, maxWidth: 360 });
            this.text(ctx, style, this.xpLine(data), 950, 196, { size: 24, weight: 700, align: 'right', maxWidth: 300 });
        }
        this.bar(ctx, style, 290, 220, 660, 36, progressOf(data));
    }

    private centered(ctx: SKRSContext2D, style: RankCardStyle, data: RankCardData): void {
        this.panel(ctx, 24, 24, 752, 452, 32, style.panelOpacity);
        this.avatar(ctx, style, data.avatar, 400, 138, 168, 6);
        this.text(ctx, style, data.displayName, 400, 268, { size: 44, weight: 700, align: 'center', maxWidth: 640 });
        const subtitle = this.subtitle(style, data);
        if (subtitle) this.text(ctx, style, subtitle, 400, 310, { size: 22, color: style.subTextColor, align: 'center', maxWidth: 640 });

        const stats: { label: string; value: string; color: string }[] = [];
        if (style.show.rank) stats.push({ label: 'RANK', value: data.rank ? `#${compactNumber(data.rank)}` : '-', color: style.textColor });
        if (style.show.level) stats.push({ label: 'LEVEL', value: compactNumber(data.level), color: style.accentColor });
        stats.push({ label: 'XP', value: compactNumber(data.xp), color: style.textColor });
        const column = 620 / stats.length;
        stats.forEach((stat, i) => {
            const cx = 90 + column * i + column / 2;
            this.text(ctx, style, stat.label, cx, 356, { size: 18, weight: 700, color: style.subTextColor, align: 'center' });
            this.text(ctx, style, stat.value, cx, 392, { size: 36, weight: 900, color: stat.color, align: 'center', maxWidth: column - 16 });
        });

        this.bar(ctx, style, 90, 432, 620, 28, progressOf(data));
        if (style.show.xpText) this.text(ctx, style, this.xpLine(data), 400, 447, { size: 17, weight: 700, color: '#ffffff', align: 'center', maxWidth: 600 });
    }

    private minimal(ctx: SKRSContext2D, style: RankCardStyle, data: RankCardData): void {
        this.avatar(ctx, style, data.avatar, 112, 110, 150, 5);

        let left = 960;
        if (style.show.level) {
            const valueWidth = this.text(ctx, style, compactNumber(data.level), 960, 112, { size: 76, weight: 900, color: style.accentColor, align: 'right', baseline: 'alphabetic' });
            const labelWidth = this.text(ctx, style, 'LV', 960 - valueWidth - 8, 112, { size: 26, weight: 700, color: style.subTextColor, align: 'right', baseline: 'alphabetic' });
            left = 960 - valueWidth - 8 - labelWidth;
        }
        if (style.show.rank) {
            this.text(ctx, style, data.rank ? `RANK #${compactNumber(data.rank)}` : 'RANK -', 960, 160, { size: 24, weight: 700, color: style.subTextColor, align: 'right' });
        }

        const right = Math.min(left, 800) - 30;
        this.text(ctx, style, data.displayName, 215, 78, { size: 40, weight: 700, maxWidth: right - 215 });
        const subtitle = this.subtitle(style, data);
        if (subtitle) this.text(ctx, style, subtitle, 215, 116, { size: 20, color: style.subTextColor, maxWidth: right - 215 });
        this.bar(ctx, style, 215, 142, right - 215, 14, progressOf(data));
        if (style.show.xpText) this.text(ctx, style, this.xpLine(data), 215, 182, { size: 20, color: style.subTextColor, maxWidth: right - 215 });
    }

    // ==========================================
    // ตาราง /leaderboard (สูงตามจำนวนแถว)
    // ==========================================
    async renderLeaderboard(style: RankCardStyle, data: LeaderboardData, images: CardImages): Promise<Buffer> {
        const width = 1000;
        const rows = Math.max(1, data.rows.length);
        const height = LB_HEADER + rows * (LB_ROW + LB_GAP) + 20;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        this.background(ctx, width, height, style.background, images.background);

        // หัวตาราง: ไอคอน + ชื่อเซิร์ฟเวอร์ + หน้า
        const iconStyle = { ...style, avatarShape: 'circle' as const };
        this.avatar(ctx, iconStyle, data.serverIcon, 80, 72, 80, 4);
        this.text(ctx, style, data.serverName, 140, 56, { size: 38, weight: 700, maxWidth: 820 });
        this.text(ctx, style, `LEADERBOARD  •  หน้า ${data.page}/${Math.max(1, data.totalPages)}`, 140, 98, { size: 22, weight: 700, color: style.accentColor });

        if (!data.rows.length) {
            this.panel(ctx, 30, LB_HEADER, 940, LB_ROW, 20, Math.max(0.25, style.panelOpacity));
            this.text(ctx, style, 'ยังไม่มีใครได้ XP ในเซิร์ฟเวอร์นี้', 500, LB_HEADER + LB_ROW / 2, { size: 28, color: style.subTextColor, align: 'center' });
            return canvas.encode('png');
        }

        data.rows.forEach((row, i) => {
            const top = LB_HEADER + i * (LB_ROW + LB_GAP);
            const mid = top + LB_ROW / 2;
            this.panel(ctx, 30, top, 940, LB_ROW, 20, Math.max(0.25, style.panelOpacity));
            const medal = row.rank <= 3 ? MEDALS[row.rank - 1] : undefined;
            if (medal) {
                ctx.fillStyle = medal;
                ctx.beginPath();
                ctx.roundRect(30, top, 8, LB_ROW, [20, 0, 0, 20]);
                ctx.fill();
            }
            this.text(ctx, style, `#${compactNumber(row.rank)}`, 92, mid, { size: row.rank >= 100 ? 26 : 34, weight: 900, color: medal ?? style.subTextColor, align: 'center', maxWidth: 90 });
            this.avatar(ctx, style, row.avatar, 172, mid, 60, 3);

            this.text(ctx, style, row.displayName, 220, top + 34, { size: 28, weight: 700, maxWidth: 470 });
            this.bar(ctx, style, 220, top + 58, 470, 10, progressOf(row));
            this.text(ctx, style, `LV ${compactNumber(row.level)}`, 945, top + 34, { size: 32, weight: 900, color: style.accentColor, align: 'right', maxWidth: 230 });
            this.text(ctx, style, `${compactNumber(row.xp)} XP`, 945, top + 66, { size: 20, color: style.subTextColor, align: 'right', maxWidth: 230 });
        });
        return canvas.encode('png');
    }

    // ==========================================
    // การ์ดเลเวลอัป
    // ==========================================
    async renderLevelUp(style: RankCardStyle, data: LevelUpCardData, images: CardImages): Promise<Buffer> {
        const { width, height } = LEVEL_UP_CARD_SIZE;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        this.background(ctx, width, height, style.background, images.background);
        this.panel(ctx, 18, 18, width - 36, height - 36, 26, style.panelOpacity);
        this.avatar(ctx, style, data.avatar, 140, 130, 164, 6);

        this.text(ctx, style, 'LEVEL UP!', 260, 72, { size: 50, weight: 900, color: style.accentColor, maxWidth: 600 });
        this.text(ctx, style, data.displayName, 262, 118, { size: 28, weight: 700, maxWidth: 600 });

        const previous = compactNumber(data.previousLevel);
        let x = 262;
        x += this.text(ctx, style, `LV ${previous}`, x, 182, { size: 38, weight: 700, color: style.subTextColor, baseline: 'alphabetic' });
        x += this.text(ctx, style, '  →  ', x, 182, { size: 38, weight: 700, color: style.subTextColor, baseline: 'alphabetic' });
        this.text(ctx, style, `LV ${compactNumber(data.level)}`, x, 182, { size: 56, weight: 900, color: style.textColor, baseline: 'alphabetic' });

        if (data.rewardNames.length) {
            this.text(ctx, style, `🎁 ได้รับยศ ${data.rewardNames.join(', ')}`, 262, 214, { size: 22, color: style.subTextColor, maxWidth: 600 });
        }
        return canvas.encode('png');
    }
}
