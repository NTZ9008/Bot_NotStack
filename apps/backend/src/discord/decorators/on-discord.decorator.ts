import type { ClientEvents } from 'discord.js';

// ==========================================
// 🎧 @OnDiscord(event) — ผูกเมธอดของ provider เข้ากับ event ของ discord.js Client
// DiscordExplorer หาเมธอดที่มี decorator นี้ตอนเปิดเซิร์ฟเวอร์ แล้วเรียก client.on(event, ...) ให้
// ใส่หลายอันบนเมธอดเดียวได้ (เช่น อีโมจิ สร้าง/ลบ/แก้ไข ใช้ตัวจัดการเดียวกัน)
// ==========================================
export const DISCORD_LISTENERS = Symbol('discord:listeners');

export type DiscordEvent = keyof ClientEvents;

export interface DiscordListenerMeta {
    event: DiscordEvent;
    once: boolean;
}

export function OnDiscord(event: DiscordEvent, options: { once?: boolean } = {}): MethodDecorator {
    return (_target, _key, descriptor) => {
        const handler = descriptor.value as object;
        const list: DiscordListenerMeta[] = Reflect.getMetadata(DISCORD_LISTENERS, handler) ?? [];
        Reflect.defineMetadata(DISCORD_LISTENERS, [...list, { event, once: Boolean(options.once) }], handler);
        return descriptor;
    };
}
