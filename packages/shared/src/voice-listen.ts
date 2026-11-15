import { z } from 'zod';
import { SNOWFLAKE_RE } from './common';

// ==========================================
// 🎧 VOICE LISTEN — บอทเข้าห้องเสียงแล้วถ่ายทอดเสียงมาให้ฟังในหน้าเว็บ
// GET /api/guilds/:guildId/voice-listen/stream ส่ง PCM ดิบ: 24kHz mono signed 16-bit little-endian ทีละเฟรม 20ms
// ส่งเฉพาะช่วงที่มีคนพูด (ช่วงเงียบไม่ส่งอะไร นอกจากเฟรมเงียบกันการเชื่อมต่อหลุดทุก 15 วินาที)
// ==========================================
export const VOICE_LISTEN_SAMPLE_RATE = 24_000;
export const VOICE_LISTEN_FRAME_SAMPLES = 480;
export const VOICE_LISTEN_FRAME_BYTES = VOICE_LISTEN_FRAME_SAMPLES * 2;

export type VoiceListenState = 'idle' | 'connecting' | 'ready';

export interface VoiceListenMember {
    userId: string;
    name: string;
    avatar: string;
    bot: boolean;
    speaking: boolean;
}

export interface VoiceListenStatus {
    state: VoiceListenState;
    // ห้องที่บอทอยู่ตอนนี้
    channel: { id: string; name: string } | null;
    // จำนวนคนที่เปิดฟังอยู่ในหน้าเว็บ
    listeners: number;
    members: VoiceListenMember[];
}

export const voiceListenJoinSchema = z.object({
    channelId: z.string({ error: 'channelId required' }).regex(SNOWFLAKE_RE, 'channelId ไม่ถูกต้อง'),
});
export type VoiceListenJoinInput = z.input<typeof voiceListenJoinSchema>;
