import sharp from 'sharp';
import { serviceUnavailable } from '../exceptions/api.exception';

// ==========================================
// 🖼️ เปิดรูปจากภายนอกอย่างปลอดภัย (ไฟล์อัปโหลด / รูปโปรไฟล์จาก Discord) ก่อนส่งให้ canvas วาด
// - ตรวจขนาดไฟล์ + จำนวนพิกเซลจาก header ก่อน decode (กันรูปไฟล์เล็กแต่พิกเซลมหาศาล)
// - ย่อด้านยาวไม่เกิน side และเข้ารหัสใหม่ (ตัด metadata / ส่วนเกินในไฟล์ทิ้ง)
// - ทำได้พร้อมกัน MAX_ACTIVE งาน ที่เหลือรอคิวได้ไม่เกิน MAX_QUEUED งาน — เกินนั้นตอบ 503 แทนการกินหน่วยความจำไม่จำกัด
//   (/leaderboard โหลดรูปโปรไฟล์ 10 รูป + ไอคอนเซิร์ฟเวอร์พร้อมกัน จึงต้องรอคิวได้ ไม่ใช่ปฏิเสธทันที)
// ==========================================

export const MAX_IMAGE_PIXELS = 16_000_000;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ACTIVE = 2;
const MAX_QUEUED = 24;

let active = 0;
const waiting: (() => void)[] = [];

async function acquire(): Promise<void> {
    if (active < MAX_ACTIVE) {
        active++;
        return;
    }
    if (waiting.length >= MAX_QUEUED) throw serviceUnavailable('กำลังประมวลผลรูปหลายรายการ กรุณาลองใหม่');
    // ได้สิทธิ์ต่อจากงานที่เพิ่งเสร็จ (active ไม่ลดลง จึงไม่มีงานอื่นแซงคิว)
    await new Promise<void>((resolve) => waiting.push(resolve));
}

function release(): void {
    const next = waiting.shift();
    if (next) next();
    else active--;
}

export async function safeImage(buffer: Buffer, side = 2400): Promise<{ data: Buffer; width: number; height: number; mimeType: string }> {
    if (buffer.length > MAX_BYTES) throw new Error('ไฟล์รูปใหญ่เกิน 8 MB');
    await acquire();
    try {
        // animated: false = อ่านเฉพาะเฟรมแรกของ GIF / WEBP เคลื่อนไหว (การ์ดเป็นภาพนิ่งอยู่แล้ว)
        const input = sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'warning', animated: false });
        const metadata = await input.metadata();
        const format = metadata.format ?? '';
        if (!['png', 'jpeg', 'webp', 'gif'].includes(format) || !metadata.width || !metadata.height || metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
            throw new Error('รูปต้องเป็น PNG/JPG/WEBP/GIF ไม่เกิน 16 ล้านพิกเซล');
        }
        // รูปถ่ายเก็บเป็น JPEG / WEBP ให้ไฟล์เล็ก ส่วน PNG / GIF อาจมีส่วนโปร่งใสจึงเก็บเป็น PNG
        const pipeline = input.rotate().resize(side, side, { fit: 'inside', withoutEnlargement: true }).timeout({ seconds: 5 });
        const encoded = format === 'jpeg' ? pipeline.jpeg({ quality: 90 }) : format === 'webp' ? pipeline.webp({ quality: 90 }) : pipeline.png();
        const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
        if (data.length > MAX_BYTES) throw new Error('รูปหลังประมวลผลใหญ่เกิน 8 MB');
        const mimeType = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
        return { data, width: info.width, height: info.height, mimeType };
    } finally {
        release();
    }
}

// อ่าน body ของ fetch โดยหยุดทันทีเมื่อเกิน maxBytes (ไม่เชื่อ Content-Length อย่างเดียว)
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
