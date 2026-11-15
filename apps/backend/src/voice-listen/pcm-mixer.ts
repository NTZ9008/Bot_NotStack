import { VOICE_LISTEN_FRAME_BYTES, VOICE_LISTEN_FRAME_SAMPLES } from '@notstack/shared';

// เก็บเสียงค้างได้ไม่เกิน 0.5 วินาทีต่อคน — เกินนี้ตัดของเก่าทิ้ง ไม่ให้ดีเลย์สะสม
const MAX_QUEUE_BYTES = VOICE_LISTEN_FRAME_BYTES * 25;
// รอให้มีเสียง 60ms ก่อนเริ่มเล่นคนนั้น — แพ็กเก็ตมาไม่สม่ำเสมอ ถ้าดึงทันทีเสียงจะขาดๆ
const PREBUFFER_BYTES = VOICE_LISTEN_FRAME_BYTES * 3;

// ==========================================
// 🎚️ PCM MIXER — รวมเสียงทุกคนที่พูดเป็นเสียงเดียว ทีละเฟรม 20ms
// รับและส่งออกเป็น 24kHz mono s16le (ตัวถอด Opus แปลงมาเป็นรูปแบบนี้ให้แล้ว)
// ==========================================
export class PcmMixer {
    private readonly queues = new Map<string, Buffer>();
    private readonly playing = new Set<string>();

    push(userId: string, pcm: Buffer): void {
        const queued = this.queues.get(userId);
        let queue = queued ? Buffer.concat([queued, pcm]) : pcm;
        if (queue.length > MAX_QUEUE_BYTES) queue = queue.subarray(queue.length - MAX_QUEUE_BYTES);
        this.queues.set(userId, queue);
    }

    remove(userId: string): void {
        this.queues.delete(userId);
        this.playing.delete(userId);
    }

    // เฟรมถัดไป — null = ไม่มีใครพูดในช่วงนี้
    next(): Buffer | null {
        const sum = new Int32Array(VOICE_LISTEN_FRAME_SAMPLES);
        let mixed = false;
        for (const [userId, queue] of this.queues) {
            if (queue.length < VOICE_LISTEN_FRAME_BYTES) {
                // เสียงหมดกลางทาง → กลับไปรอสะสมใหม่
                this.playing.delete(userId);
                continue;
            }
            if (!this.playing.has(userId) && queue.length < PREBUFFER_BYTES) continue;
            this.playing.add(userId);
            mixed = true;
            for (let i = 0; i < VOICE_LISTEN_FRAME_SAMPLES; i++) sum[i] += queue.readInt16LE(i * 2);
            this.queues.set(userId, queue.subarray(VOICE_LISTEN_FRAME_BYTES));
        }
        if (!mixed) return null;
        const frame = Buffer.allocUnsafe(VOICE_LISTEN_FRAME_BYTES);
        for (let i = 0; i < VOICE_LISTEN_FRAME_SAMPLES; i++) frame.writeInt16LE(Math.max(-32768, Math.min(32767, sum[i])), i * 2);
        return frame;
    }
}
