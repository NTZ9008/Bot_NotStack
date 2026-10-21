import sharp from 'sharp';
import { serviceUnavailable } from '../exceptions/api.exception';

export const MAX_IMAGE_PIXELS = 16_000_000;
const MAX_BYTES = 8 * 1024 * 1024;
let active = 0;
// Reject overload rather than retaining arbitrary uploaded buffers in a waiting queue.
export async function safeImage(buffer: Buffer, side = 2400): Promise<{ data: Buffer; width: number; height: number; mimeType: string }> {
    if (buffer.length > MAX_BYTES) throw new Error('ไฟล์รูปใหญ่เกิน 8 MB');
    if (active >= 2) throw serviceUnavailable('กำลังประมวลผลรูปหลายรายการ กรุณาลองใหม่');
    active++;
    try {
        const input = sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'warning', animated: false });
        const metadata = await input.metadata();
        if (
            !['png', 'jpeg', 'webp', 'gif'].includes(metadata.format ?? '') ||
            !metadata.width ||
            !metadata.height ||
            metadata.width * metadata.height > MAX_IMAGE_PIXELS ||
            (metadata.pages ?? 1) > 1
        ) {
            throw new Error('รูปต้องเป็น PNG/JPG/WEBP/GIF แบบภาพนิ่ง ไม่เกิน 16 ล้านพิกเซล');
        }
        const { data, info } = await input
            .rotate()
            .resize(side, side, { fit: 'inside', withoutEnlargement: true })
            .png()
            .timeout({ seconds: 5 })
            .toBuffer({ resolveWithObject: true });
        if (data.length > MAX_BYTES) throw new Error('รูปหลังประมวลผลใหญ่เกิน 8 MB');
        return { data, width: info.width, height: info.height, mimeType: 'image/png' };
    } finally {
        active--;
    }
}

export async function readBoundedResponse(res: Response, maxBytes = MAX_BYTES): Promise<Buffer> {
    if (!res.ok || !res.body) throw new Error('Image download failed');
    if (Number(res.headers.get('content-length')) > maxBytes) {
        await res.body.cancel();
        throw new Error('Image too large');
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.length;
            if (bytes > maxBytes) {
                await reader.cancel();
                throw new Error('Image too large');
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }
    return Buffer.concat(chunks);
}
