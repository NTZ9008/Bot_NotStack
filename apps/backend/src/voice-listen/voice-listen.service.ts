import {
    type AudioReceiveStream,
    EndBehaviorType,
    entersState,
    getVoiceConnection,
    joinVoiceChannel,
    type VoiceConnection,
    VoiceConnectionStatus,
} from '@discordjs/voice';
import { HttpStatus, Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { VOICE_LISTEN_FRAME_BYTES, VOICE_LISTEN_SAMPLE_RATE, type VoiceListenStatus } from '@notstack/shared';
import OpusScript from 'opusscript';
import { ApiException, notFound } from '../common/exceptions/api.exception';
import { DiscordService } from '../discord/discord.service';
import { PcmMixer } from './pcm-mixer';

const FRAME_MS = 20;
// ช่วงเงียบนานเกินนี้ส่งเฟรมเงียบ 1 เฟรม — proxy (Cloudflare / nginx) ตัดการเชื่อมต่อที่ไม่มีข้อมูลวิ่ง
const KEEPALIVE_MS = 15_000;
// ไม่มีคน (ที่ไม่ใช่บอท) อยู่ในห้องนานเกินนี้ → ออกจากห้องเอง
const EMPTY_LEAVE_MS = 60_000;
const SWEEP_MS = 15_000;
const SILENCE = Buffer.alloc(VOICE_LISTEN_FRAME_BYTES);

export interface VoiceListenSink {
    write(frame: Buffer): void;
    close(): void;
}

interface Session {
    guildId: string;
    connection: VoiceConnection;
    mixer: PcmMixer;
    streams: Map<string, { stream: AudioReceiveStream; decoder: OpusScript }>;
    sinks: Set<VoiceListenSink>;
    lastSentAt: number;
    emptySince: number | null;
}

// ==========================================
// 🎧 VOICE LISTEN — บอทเข้าห้องเสียง รับเสียงของแต่ละคน (Opus) → ถอดเป็น PCM → รวมเป็นเสียงเดียว → ส่งให้ผู้ฟังในหน้าเว็บ
// เซิร์ฟเวอร์ละ 1 ห้อง (ข้อจำกัดของ Discord) และถอดเสียงเฉพาะตอนที่มีคนเปิดฟังอยู่
// ==========================================
@Injectable()
export class VoiceListenService implements OnApplicationShutdown {
    private readonly logger = new Logger('VoiceListen');
    private readonly sessions = new Map<string, Session>();
    private clock: NodeJS.Timeout | null = null;
    private sweeper: NodeJS.Timeout | null = null;
    private nextAt = 0;

    constructor(private readonly discord: DiscordService) {}

    status(guildId: string): VoiceListenStatus {
        const guild = this.discord.requireGuild(guildId);
        const session = this.sessions.get(guildId);
        const me = guild.members.me;
        const channel = session ? (me?.voice.channel ?? null) : null;
        const speaking = session?.connection.receiver.speaking.users;
        return {
            state: !session ? 'idle' : session.connection.state.status === VoiceConnectionStatus.Ready ? 'ready' : 'connecting',
            channel: channel ? { id: channel.id, name: channel.name } : null,
            listeners: session?.sinks.size ?? 0,
            members: channel
                ? [...channel.members.values()]
                      .filter((member) => member.id !== me?.id)
                      .map((member) => ({
                          userId: member.id,
                          name: member.displayName,
                          avatar: member.displayAvatarURL({ size: 64 }),
                          bot: member.user.bot,
                          speaking: speaking?.has(member.id) ?? false,
                      }))
                : [],
        };
    }

    async join(guildId: string, channelId: string): Promise<VoiceListenStatus> {
        const guild = this.discord.requireGuild(guildId);
        const channel = guild.channels.cache.get(channelId);
        if (!channel?.isVoiceBased()) throw notFound('ไม่พบห้องเสียงนี้');
        if (!channel.joinable) throw new ApiException(HttpStatus.FORBIDDEN, 'บอทไม่มีสิทธิ์เข้าห้องนี้ (ต้องมีสิทธิ์ View Channel และ Connect) หรือห้องเต็ม');

        // อยู่ห้องอื่นอยู่แล้ว → joinVoiceChannel ย้ายห้องให้ด้วยการเชื่อมต่อเดิม
        const connection = joinVoiceChannel({ guildId, channelId, adapterCreator: guild.voiceAdapterCreator, selfDeaf: false, selfMute: true });
        if (!this.sessions.has(guildId)) this.attach(guildId, connection);
        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
        } catch {
            this.destroy(connection);
            throw new ApiException(HttpStatus.GATEWAY_TIMEOUT, 'เชื่อมต่อห้องเสียงไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
        }
        return this.status(guildId);
    }

    leave(guildId: string): void {
        const connection = this.sessions.get(guildId)?.connection ?? getVoiceConnection(guildId);
        if (connection) this.destroy(connection);
    }

    // เริ่มส่งเสียงให้ผู้ฟังหนึ่งคน — คืนฟังก์ชันเลิกฟัง
    subscribe(guildId: string, sink: VoiceListenSink): () => void {
        const session = this.sessions.get(guildId);
        if (!session) throw notFound('บอทยังไม่ได้อยู่ในห้องเสียง');
        session.sinks.add(sink);
        return () => session.sinks.delete(sink);
    }

    onApplicationShutdown(): void {
        for (const session of [...this.sessions.values()]) this.destroy(session.connection);
    }

    private attach(guildId: string, connection: VoiceConnection): void {
        const session: Session = {
            guildId,
            connection,
            mixer: new PcmMixer(),
            streams: new Map(),
            sinks: new Set(),
            lastSentAt: Date.now(),
            emptySince: null,
        };
        this.sessions.set(guildId, session);
        connection.receiver.speaking.on('start', (userId) => this.listenTo(session, userId));
        connection.on('error', (err) => this.logger.warn(`[${guildId}] ${err.message}`));
        connection.on('stateChange', (_old, state) => {
            if (state.status === VoiceConnectionStatus.Destroyed) {
                this.detach(session);
            } else if (state.status === VoiceConnectionStatus.Disconnected) {
                // ถูกย้ายห้อง → ต่อใหม่เองภายในไม่กี่วินาที ; ถูกเตะ / ห้องถูกลบ → ไม่กลับมา ปิดทิ้ง
                Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                ]).catch(() => this.destroy(connection));
            }
        });
        this.startClock();
    }

    private detach(session: Session): void {
        if (this.sessions.get(session.guildId) !== session) return;
        this.sessions.delete(session.guildId);
        for (const { stream } of session.streams.values()) stream.destroy();
        for (const sink of session.sinks) sink.close();
        session.sinks.clear();
        if (this.sessions.size === 0) this.stopClock();
    }

    private destroy(connection: VoiceConnection): void {
        if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
    }

    private listenTo(session: Session, userId: string): void {
        if (session.streams.has(userId)) return;
        const stream = session.connection.receiver.subscribe(userId, { end: { behavior: EndBehaviorType.AfterSilence, duration: 1_000 } });
        // ถอดเป็น 24kHz mono ตรงๆ (Opus ถอดได้ทุก sample rate) — ไม่ต้องลด sample rate เอง
        const decoder = new OpusScript(VOICE_LISTEN_SAMPLE_RATE, 1, OpusScript.Application.AUDIO);
        session.streams.set(userId, { stream, decoder });
        stream.on('data', (packet: Buffer) => {
            if (session.sinks.size === 0) return;
            try {
                session.mixer.push(userId, decoder.decode(packet));
            } catch {
                // แพ็กเก็ตเสีย — ข้ามไป
            }
        });
        const done = () => {
            if (session.streams.get(userId)?.stream !== stream) return;
            session.streams.delete(userId);
            session.mixer.remove(userId);
            decoder.delete();
        };
        stream.once('end', done);
        stream.once('close', done);
        stream.once('error', done);
    }

    // นาฬิกาเดียวของทุกเซิร์ฟเวอร์ — setInterval คลาดเคลื่อนได้ จึงนับจากเวลาจริงแล้วส่งเฟรมที่ค้างให้ครบ
    tick(now: number): void {
        let frames = 0;
        while (this.nextAt <= now && frames++ < 5) {
            for (const session of this.sessions.values()) this.emit(session, Date.now());
            this.nextAt += FRAME_MS;
        }
        // ค้างนานเกิน (event loop ถูกบล็อก) → ข้ามไปเลย ไม่ส่งเสียงย้อนหลังรวดเดียว
        if (this.nextAt <= now) this.nextAt = now + FRAME_MS;
    }

    private emit(session: Session, now: number): void {
        let frame = session.mixer.next();
        if (!frame) {
            if (session.sinks.size === 0 || now - session.lastSentAt < KEEPALIVE_MS) return;
            frame = SILENCE;
        }
        session.lastSentAt = now;
        for (const sink of session.sinks) {
            try {
                sink.write(frame);
            } catch {
                session.sinks.delete(sink);
            }
        }
    }

    private sweep(now: number): void {
        for (const session of this.sessions.values()) {
            const channel = this.discord.guild(session.guildId)?.members.me?.voice.channel;
            const humans = channel?.members.filter((member) => !member.user.bot).size ?? 0;
            if (humans > 0) session.emptySince = null;
            else if (session.emptySince === null) session.emptySince = now;
            else if (now - session.emptySince >= EMPTY_LEAVE_MS) {
                this.logger.log(`[${session.guildId}] ไม่มีใครอยู่ในห้องแล้ว — ออกจากห้องเสียง`);
                this.destroy(session.connection);
            }
        }
    }

    private startClock(): void {
        if (this.clock) return;
        this.nextAt = performance.now();
        this.clock = setInterval(() => this.tick(performance.now()), FRAME_MS);
        this.sweeper = setInterval(() => this.sweep(Date.now()), SWEEP_MS);
        this.clock.unref?.();
        this.sweeper.unref?.();
    }

    private stopClock(): void {
        if (this.clock) clearInterval(this.clock);
        if (this.sweeper) clearInterval(this.sweeper);
        this.clock = this.sweeper = null;
    }
}
