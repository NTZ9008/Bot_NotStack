import { Injectable } from '@nestjs/common';
import { CONFIG_KEY_MAP, CONFIG_KEYS, SNOWFLAKE_RE, type ConfigRow } from '@notstack/shared';
import { badRequest } from '../common/exceptions/api.exception';
import { DiscordService } from '../discord/discord.service';
import { PrismaService } from '../prisma/prisma.service';

const CACHE_TTL_MS = 60 * 1000;

// ==========================================
// ⚙️ BOT CONFIG — ค่าคอนฟิกของแต่ละเซิร์ฟเวอร์ (ตาราง config: guild_id + key)
// - key ในแคตตาล็อก (CONFIG_KEYS): ห้องต่างๆ + สวิตช์ความสามารถในแชท — แก้ได้ที่หน้า Configuration
// - key ของระบบอื่น (PR_*): แต่ละหน้าจัดการเอง ผ่าน set()
// key ที่ยังไม่เคยตั้ง ใช้ค่าเริ่มต้นจากแคตตาล็อก (เซิร์ฟเวอร์หลักได้ค่าเดิมของระบบก่อนรองรับหลายเซิร์ฟเวอร์)
// cache ต่อเซิร์ฟเวอร์ 1 นาที เพราะระบบแชทอ่านสวิตช์ทุกข้อความ — แก้ค่าผ่าน service นี้แล้ว cache ถูกล้างทันที
// ==========================================
@Injectable()
export class BotConfigService {
    private readonly cache = new Map<string, { values: Map<string, string | null>; at: number }>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly discord: DiscordService,
    ) {}

    private async values(guildId: string): Promise<Map<string, string | null>> {
        const hit = this.cache.get(guildId);
        if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.values;
        const rows = await this.prisma.config.findMany({ where: { guildId }, select: { key: true, value: true } });
        const values = new Map(rows.map((row) => [row.key, row.value]));
        this.cache.set(guildId, { values, at: Date.now() });
        return values;
    }

    private defaultOf(guildId: string, key: string): string | null {
        const def = CONFIG_KEY_MAP.get(key);
        if (!def) return null;
        return this.discord.isHome(guildId) ? def.homeValue : def.defaultValue;
    }

    // ค่าที่ตั้งไว้ (ยังไม่เคยตั้ง = ค่าเริ่มต้น, ค่าว่าง = ปิด/ไม่ได้เลือกห้อง) — คืน null ถ้าไม่มีค่า
    async get(guildId: string, key: string): Promise<string | null> {
        const values = await this.values(guildId);
        const value = values.has(key) ? values.get(key) : this.defaultOf(guildId, key);
        return value ? value : null;
    }

    // สวิตช์เปิด/ปิดความสามารถ ("true" / "false")
    async isEnabled(guildId: string, key: string): Promise<boolean> {
        return (await this.get(guildId, key)) === 'true';
    }

    // ทุก key ในแคตตาล็อก พร้อมค่าปัจจุบัน สำหรับหน้า Configuration
    async list(guildId: string): Promise<ConfigRow[]> {
        const values = await this.values(guildId);
        return CONFIG_KEYS.map((def) => ({
            key: def.key,
            type: def.type,
            group: def.group,
            label: def.label,
            description: def.description,
            value: (values.has(def.key) ? values.get(def.key) : this.defaultOf(guildId, def.key)) ?? '',
        }));
    }

    // แก้ค่าจากหน้า Configuration — ตรวจชนิดตามแคตตาล็อก
    async update(guildId: string, key: string, rawValue: string): Promise<void> {
        const def = CONFIG_KEY_MAP.get(key);
        if (!def) throw badRequest('ไม่รู้จัก config key นี้');
        const value = rawValue.trim();
        if (def.type === 'channel') {
            if (value && !SNOWFLAKE_RE.test(value)) throw badRequest('Channel ID ไม่ถูกต้อง');
            const channel = value ? await this.discord.fetchGuildChannel(guildId, value) : null;
            if (value && this.discord.ready && !channel) throw badRequest('ไม่พบห้องนี้ในเซิร์ฟเวอร์');
        } else if (value !== 'true' && value !== 'false') {
            throw badRequest('ค่าต้องเป็น true หรือ false');
        }
        await this.set(guildId, key, value, def.description);
    }

    // upsert (ใช้ได้กับทุก key รวมถึงของ PR Bot)
    async set(guildId: string, key: string, value: string, description?: string): Promise<void> {
        await this.prisma.config.upsert({
            where: { guildId_key: { guildId, key } },
            create: { guildId, key, value, description: description ?? null },
            update: { value },
        });
        this.cache.delete(guildId);
    }

    async remove(guildId: string, key: string): Promise<void> {
        await this.prisma.config.deleteMany({ where: { guildId, key } });
        this.cache.delete(guildId);
    }
}
