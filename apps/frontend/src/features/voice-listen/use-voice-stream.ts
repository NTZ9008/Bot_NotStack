import { VOICE_LISTEN_FRAME_BYTES, VOICE_LISTEN_SAMPLE_RATE } from '@notstack/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl, refreshSession } from '@/lib/api';
import { sessionRequests } from '@/lib/session-state';

export type VoiceStreamStatus = 'stopped' | 'connecting' | 'live' | 'reconnecting';

// เล่นช้ากว่าที่รับมา 100ms กันเสียงขาดเวลาเน็ตกระตุก ; ค้างเกิน 1 วินาที (แท็บถูกพัก) ตัดกลับมาเป็นปัจจุบัน
const JITTER_S = 0.1;
const MAX_LAG_S = 1;
const RETRY_MS = 2_000;

// ==========================================
// 🔊 VOICE STREAM — อ่านเสียง PCM ดิบจาก /voice-listen/stream ด้วย fetch แล้วต่อคิวเล่นด้วย Web Audio
// ต้องเริ่มจากการกดปุ่ม (เบราว์เซอร์ไม่ให้เล่นเสียงเองก่อนผู้ใช้กด) — หลุดแล้วต่อใหม่เองจนกว่าจะกดหยุด
// ==========================================
export function useVoiceStream(guildId: string) {
    const [status, setStatus] = useState<VoiceStreamStatus>('stopped');
    const [volume, setVolumeState] = useState(1);
    const stopRef = useRef<(() => void) | null>(null);
    const gainRef = useRef<GainNode | null>(null);

    const stop = useCallback(() => {
        stopRef.current?.();
        stopRef.current = null;
        setStatus('stopped');
    }, []);

    const start = useCallback(() => {
        stopRef.current?.();
        const controller = new AbortController();
        const signal = AbortSignal.any([controller.signal, sessionRequests.capture()]);
        const ctx = new AudioContext({ sampleRate: VOICE_LISTEN_SAMPLE_RATE });
        const gain = ctx.createGain();
        gain.gain.value = volume;
        gain.connect(ctx.destination);
        gainRef.current = gain;
        stopRef.current = () => {
            controller.abort();
            gainRef.current = null;
            void ctx.close();
        };

        let playAt = 0;
        const play = (bytes: Uint8Array) => {
            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            const samples = bytes.byteLength / 2;
            const buffer = ctx.createBuffer(1, samples, VOICE_LISTEN_SAMPLE_RATE);
            const channel = buffer.getChannelData(0);
            for (let i = 0; i < samples; i++) channel[i] = view.getInt16(i * 2, true) / 32768;
            const now = ctx.currentTime;
            if (playAt < now || playAt - now > MAX_LAG_S) playAt = now + JITTER_S;
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(gain);
            source.start(playAt);
            playAt += buffer.duration;
        };

        void (async () => {
            let first = true;
            let refreshed = false;
            while (!signal.aborted) {
                setStatus(first ? 'connecting' : 'reconnecting');
                first = false;
                try {
                    const res = await fetch(apiUrl(`/guilds/${guildId}/voice-listen/stream`), { credentials: 'include', signal });
                    if (res.status === 401 && !refreshed && (await refreshSession())) {
                        refreshed = true;
                        continue;
                    }
                    // บอทไม่ได้อยู่ในห้องแล้ว — หยุดฟัง ไม่ต้องลองซ้ำ
                    if (res.status === 404) {
                        stopRef.current?.();
                        stopRef.current = null;
                        setStatus('stopped');
                        return;
                    }
                    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
                    refreshed = false;
                    setStatus('live');
                    const reader = res.body.getReader();
                    // chunk ที่ได้อาจตัดกลางเฟรม — เก็บเศษไว้ต่อกับ chunk ถัดไป
                    let rest = new Uint8Array(0);
                    for (;;) {
                        const { value, done } = await reader.read();
                        if (done) break;
                        const data = rest.length ? concat(rest, value) : value;
                        const whole = data.byteLength - (data.byteLength % VOICE_LISTEN_FRAME_BYTES);
                        if (whole) play(data.subarray(0, whole));
                        rest = data.slice(whole);
                    }
                } catch {
                    // หลุด / บอทออกจากห้อง — รอแล้วลองใหม่
                }
                if (signal.aborted) break;
                await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
            }
        })();
    }, [guildId, volume]);

    const setVolume = useCallback((value: number) => {
        setVolumeState(value);
        if (gainRef.current) gainRef.current.gain.value = value;
    }, []);

    // ออกจากหน้า / เปลี่ยนเซิร์ฟเวอร์ → หยุดฟัง
    useEffect(() => stop, [guildId, stop]);

    return { status, start, stop, volume, setVolume };
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
    const out = new Uint8Array(a.byteLength + b.byteLength);
    out.set(a);
    out.set(b, a.byteLength);
    return out;
}
