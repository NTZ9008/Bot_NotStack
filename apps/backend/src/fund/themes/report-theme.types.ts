import { loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import { formatBaht, type FundReportCardData, type FundReportThemeId } from '@notstack/shared';

export interface ReportThemeRenderer {
    readonly id: FundReportThemeId;
    render(data: FundReportCardData, compact?: boolean): Promise<Buffer>;
}

const spriteCache = new Map<string, Promise<Image>>();

export function loadSvgSprite(cacheKey: string, svgMarkup: string): Promise<Image> {
    let pending = spriteCache.get(cacheKey);
    if (!pending) {
        pending = loadImage(Buffer.from(svgMarkup)).catch((err) => {
            spriteCache.delete(cacheKey);
            throw err;
        });
        spriteCache.set(cacheKey, pending);
    }
    return pending;
}

export function truncateText(ctx: SKRSContext2D, text: string, maxWidth: number): string {
    if (maxWidth <= 0) return '';
    if (ctx.measureText(text).width <= maxWidth) return text;
    const chars = [...text];
    while (chars.length > 1 && ctx.measureText(`${chars.join('')}…`).width > maxWidth) {
        chars.pop();
    }
    return `${chars.join('')}…`;
}

export function fitText(
    ctx: SKRSContext2D,
    makeFont: (size: number) => string,
    text: string,
    maxSize: number,
    minSize: number,
    maxWidth: number,
): { text: string; size: number } {
    let size = maxSize;
    ctx.font = makeFont(size);
    while (size > minSize && ctx.measureText(text).width > maxWidth) {
        size = Math.max(minSize, Math.floor(size * 0.92));
        ctx.font = makeFont(size);
    }
    return { text: truncateText(ctx, text, maxWidth), size };
}

export function plainAmount(value: number): string {
    return formatBaht(value).replace(/บาท\s*$/, '').trimEnd();
}

export function rgba(hex: string, alpha: number): string {
    const clean = hex.replace('#', '');
    const n = Number.parseInt(clean, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function drawPill(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    h: number,
    radius: number,
    label: string,
    opts: {
        font: string;
        bg?: string;
        border?: string;
        borderWidth?: number;
        textColor: string;
        padX?: number;
        alignRight?: number;
    },
): number {
    ctx.font = opts.font;
    const padX = opts.padX ?? 12;
    const w = Math.ceil(ctx.measureText(label).width + padX * 2);
    const left = opts.alignRight !== undefined ? opts.alignRight - w : x;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(left, y, w, h, radius);
    if (opts.bg) {
        ctx.fillStyle = opts.bg;
        ctx.fill();
    }
    if (opts.border) {
        ctx.strokeStyle = opts.border;
        ctx.lineWidth = opts.borderWidth ?? 1;
        ctx.stroke();
    }
    ctx.fillStyle = opts.textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, left + w / 2, y + h / 2 + 1);
    ctx.restore();
    return w;
}

export function drawProgressTrack(
    ctx: SKRSContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    ratio: number,
    trackColor: string,
    fillStyle: SKRSContext2D['fillStyle'],
    radius = h / 2,
): void {
    ctx.save();
    ctx.fillStyle = trackColor;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fill();
    const clamped = Math.max(0, Math.min(1, ratio));
    if (clamped > 0) {
        ctx.fillStyle = fillStyle;
        ctx.beginPath();
        ctx.roundRect(x, y, Math.max(h, w * clamped), h, radius);
        ctx.fill();
    }
    ctx.restore();
}
