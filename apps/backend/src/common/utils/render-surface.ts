import { createCanvas } from '@napi-rs/canvas';
import { recordTiming, timeOperation } from './server-timing';

// Logical drawing coordinates stay unchanged. Discord exports keep full-size lossless PNGs.
export function renderSurface(width: number, height: number, compact = false) {
    const start = performance.now();
    const scale = compact ? Math.min(1, 800 / width, 1000 / height) : 1;
    const canvas = createCanvas(Math.round(width * scale), Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    return {
        ctx,
        encode: () => {
            recordTiming('draw', performance.now() - start);
            return timeOperation('encode', () => (compact ? canvas.encode('webp', 85) : canvas.encode('png')));
        },
    };
}
