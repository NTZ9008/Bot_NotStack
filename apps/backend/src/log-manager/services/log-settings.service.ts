import { Injectable, Logger } from '@nestjs/common';
import {
    GROUP_ORDER,
    HEX_COLOR_RE,
    LOG_EVENT_MAP,
    LOG_EVENTS,
    SNOWFLAKE_RE,
    type LogEventSetting,
    type LogOptions,
    type UpdateLogOptionsInput,
} from '@notstack/shared';
import { Events, type Client, type Guild } from 'discord.js';
import { badRequest } from '../../common/exceptions/api.exception';
import { OnDiscord } from '../../discord/decorators/on-discord.decorator';
import { PrismaService } from '../../prisma/prisma.service';

// แถวพิเศษสำหรับสวิตช์เปิด/ปิดทั้งระบบ (ไม่ใช่ event จริง จึงถูกกรองออกตอนส่งให้ Dashboard)
export const SYSTEM_KEY = '__system__';

const OPTION_KEYS = {
    IGNORED_CHANNELS: 'ignoredChannels',
    IGNORED_USERS: 'ignoredUsers',
    IGNORED_ROLES: 'ignoredRoles',
} as const;

interface CachedSetting {
    enabled: boolean;
    channelId: string;
    color: string;
}

// ตัวกรองส่วนกลางของเซิร์ฟเวอร์ (ยกเว้นไม่ต้อง log) — เก็บเป็น Set เพื่อเช็คเร็วตอน event ยิงถี่
export interface RuntimeLogOptions {
    ignoredChannels: Set<string>;
    ignoredUsers: Set<string>;
    ignoredRoles: Set<string>;
    ignoreBots: boolean;
    activityRecording: boolean;
}

interface GuildLogState {
    settings: Map<string, CachedSetting>;
    options: RuntimeLogOptions;
}

const defaultOptions = (): RuntimeLogOptions => ({
    ignoredChannels: new Set(),
    ignoredUsers: new Set(),
    ignoredRoles: new Set(),
    ignoreBots: true,
    activityRecording: true,
});

// ==========================================
// 💾 LOG SETTINGS STORE — การตั้งค่า log แต่ละชนิด (log_settings) + ตัวกรองส่วนกลาง (log_options) ของแต่ละเซิร์ฟเวอร์
// มี cache ใน memory เพราะ event ของ Discord ยิงถี่มาก ไม่ควร query DB ทุกครั้ง
// เซิร์ฟเวอร์ใหม่ได้ค่าเริ่มต้น: ระบบเปิด แต่ทุก event ปิด (แอดมินเลือกเปิดเองทีละอัน) + บันทึก Activity เปิด
// ==========================================
@Injectable()
export class LogSettingsService {
    private readonly logger = new Logger('LogManager');
    private readonly guilds = new Map<string, GuildLogState>();
    private readonly loading = new Map<string, Promise<GuildLogState>>();

    constructor(private readonly prisma: PrismaService) {}

    // บอทออนไลน์ → เตรียมค่าของทุกเซิร์ฟเวอร์ไว้ใน cache
    @OnDiscord(Events.ClientReady, { once: true })
    async onReady(client: Client<true>): Promise<void> {
        for (const guildId of client.guilds.cache.keys()) await this.ensure(guildId).catch(() => null);
        this.logger.log(`📋 โหลดการตั้งค่า log ของ ${this.guilds.size} เซิร์ฟเวอร์ (${LOG_EVENTS.length} รายการต่อเซิร์ฟเวอร์)`);
    }

    @OnDiscord(Events.GuildCreate)
    async onGuildJoin(guild: Guild): Promise<void> {
        await this.ensure(guild.id);
    }

    // เติมค่า default ของ event ที่ยังไม่มีในตาราง (รองรับเซิร์ฟเวอร์ใหม่ / event ใหม่ในอนาคต) แล้วโหลดเข้า cache
    // skipDuplicates ทำให้ไม่ทับค่าที่แอดมินตั้งไว้
    ensure(guildId: string): Promise<GuildLogState> {
        const cached = this.guilds.get(guildId);
        if (cached) return Promise.resolve(cached);
        let promise = this.loading.get(guildId);
        if (!promise) {
            promise = (async () => {
                await this.prisma.logOption.createMany({
                    data: [
                        { key: 'IGNORED_CHANNELS', value: '[]' },
                        { key: 'IGNORED_USERS', value: '[]' },
                        { key: 'IGNORED_ROLES', value: '[]' },
                        { key: 'IGNORE_BOTS', value: '1' },
                        { key: 'ACTIVITY_RECORDING', value: '1' },
                    ].map((row) => ({ guildId, ...row })),
                    skipDuplicates: true,
                });
                await this.prisma.logSetting.createMany({
                    data: [
                        { eventKey: SYSTEM_KEY, enabled: true, channelId: '', color: '' },
                        ...LOG_EVENTS.map((event) => ({ eventKey: event.key, enabled: false, channelId: '', color: event.color })),
                    ].map((row) => ({ guildId, ...row })),
                    skipDuplicates: true,
                });
                return this.reload(guildId);
            })().finally(() => this.loading.delete(guildId));
            this.loading.set(guildId, promise);
        }
        return promise;
    }

    private async reload(guildId: string): Promise<GuildLogState> {
        const state: GuildLogState = { settings: new Map(), options: defaultOptions() };
        const [rows, optionRows] = await Promise.all([
            this.prisma.logSetting.findMany({ where: { guildId } }),
            this.prisma.logOption.findMany({ where: { guildId } }),
        ]);
        for (const row of rows) {
            state.settings.set(row.eventKey, {
                enabled: row.enabled,
                channelId: row.channelId || '',
                color: row.color || LOG_EVENT_MAP.get(row.eventKey)?.color || '#5865F2',
            });
        }
        for (const row of optionRows) {
            if (row.key === 'IGNORE_BOTS') state.options.ignoreBots = row.value === '1';
            else if (row.key === 'ACTIVITY_RECORDING') state.options.activityRecording = row.value !== '0';
            else {
                const field = OPTION_KEYS[row.key as keyof typeof OPTION_KEYS];
                if (!field) continue;
                try {
                    const parsed: unknown = JSON.parse(row.value || '[]');
                    state.options[field] = new Set(Array.isArray(parsed) ? parsed.map(String) : []);
                } catch {
                    state.options[field] = new Set();
                }
            }
        }
        this.guilds.set(guildId, state);
        return state;
    }

    // อ่านจาก cache (sync) — ใช้ตอน dispatch log เพื่อไม่ให้ช้า
    // เซิร์ฟเวอร์ที่ยังไม่อยู่ใน cache → โหลดเบื้องหลัง แล้วใช้ค่าเริ่มต้นไปก่อน
    private peek(guildId: string): GuildLogState | null {
        const state = this.guilds.get(guildId);
        if (!state) void this.ensure(guildId).catch((err: Error) => this.logger.error(`โหลดการตั้งค่าของ ${guildId} ไม่สำเร็จ: ${err.message}`));
        return state ?? null;
    }

    isLoaded(guildId: string): boolean {
        return this.guilds.has(guildId);
    }

    isSystemEnabled(guildId: string): boolean {
        return this.peek(guildId)?.settings.get(SYSTEM_KEY)?.enabled !== false;
    }

    getSetting(guildId: string, eventKey: string): CachedSetting | null {
        return this.peek(guildId)?.settings.get(eventKey) ?? null;
    }

    getOptions(guildId: string): RuntimeLogOptions {
        return this.peek(guildId)?.options ?? defaultOptions();
    }

    // รวมข้อมูล catalog + ค่าที่ตั้งไว้ ส่งให้ Dashboard
    async listSettings(guildId: string): Promise<LogEventSetting[]> {
        const state = await this.ensure(guildId);
        return LOG_EVENTS.map((event) => {
            const saved = state.settings.get(event.key);
            return {
                key: event.key,
                label: event.label,
                group: event.group,
                enabled: saved ? saved.enabled : false,
                channelId: saved ? saved.channelId : '',
                color: saved?.color || event.color,
            };
        });
    }

    groups(): string[] {
        return GROUP_ORDER;
    }

    // อัปเดตเฉพาะฟิลด์ที่ส่งมา (partial update) — Dashboard บันทึกอัตโนมัติทีละช่อง
    async updateSetting(guildId: string, eventKey: string, patch: { enabled?: boolean; channelId?: string; color?: string }): Promise<LogEventSetting> {
        if (!LOG_EVENT_MAP.has(eventKey)) throw badRequest(`ไม่รู้จัก log event: ${eventKey}`);
        await this.ensure(guildId);

        const data: { enabled?: boolean; channelId?: string; color?: string } = {};
        if (typeof patch.enabled === 'boolean') data.enabled = patch.enabled;
        if (typeof patch.channelId === 'string') {
            const trimmed = patch.channelId.trim();
            if (trimmed && !SNOWFLAKE_RE.test(trimmed)) throw badRequest('รูปแบบ Channel ID ไม่ถูกต้อง');
            data.channelId = trimmed;
        }
        if (typeof patch.color === 'string') {
            const trimmed = patch.color.trim();
            if (!HEX_COLOR_RE.test(trimmed)) throw badRequest('รูปแบบสีไม่ถูกต้อง (ต้องเป็น #RRGGBB)');
            data.color = trimmed;
        }
        if (Object.keys(data).length === 0) throw badRequest('ไม่มีข้อมูลที่ต้องอัปเดต');

        await this.prisma.logSetting.updateMany({ where: { guildId, eventKey }, data });
        await this.reload(guildId);
        return (await this.listSettings(guildId)).find((setting) => setting.key === eventKey)!;
    }

    async setSystemEnabled(guildId: string, enabled: boolean): Promise<boolean> {
        await this.ensure(guildId);
        await this.prisma.logSetting.updateMany({ where: { guildId, eventKey: SYSTEM_KEY }, data: { enabled } });
        await this.reload(guildId);
        return this.isSystemEnabled(guildId);
    }

    // ตั้งห้องเดียวกันให้ทุก event รวดเดียว (ปุ่ม "ใช้ห้องนี้กับทุกรายการ" ในหน้า Dashboard)
    async setChannelForAll(guildId: string, channelId: string): Promise<void> {
        const trimmed = channelId.trim();
        if (trimmed && !SNOWFLAKE_RE.test(trimmed)) throw badRequest('รูปแบบ Channel ID ไม่ถูกต้อง');
        await this.ensure(guildId);
        await this.prisma.logSetting.updateMany({ where: { guildId, eventKey: { not: SYSTEM_KEY } }, data: { channelId: trimmed } });
        await this.reload(guildId);
    }

    // ส่งให้ Dashboard ในรูปแบบ array
    async listOptions(guildId: string): Promise<LogOptions> {
        const { options } = await this.ensure(guildId);
        return {
            ignoredChannels: [...options.ignoredChannels],
            ignoredUsers: [...options.ignoredUsers],
            ignoredRoles: [...options.ignoredRoles],
            ignoreBots: options.ignoreBots,
            activityRecording: options.activityRecording,
        };
    }

    async updateOptions(guildId: string, input: UpdateLogOptionsInput): Promise<LogOptions> {
        await this.ensure(guildId);
        const saveList = async (dbKey: keyof typeof OPTION_KEYS, list: unknown[] | undefined) => {
            if (!Array.isArray(list)) return;
            const cleaned = [...new Set(list.map((id) => String(id).trim()).filter(Boolean))];
            const invalid = cleaned.find((id) => !SNOWFLAKE_RE.test(id));
            if (invalid) throw badRequest(`ไอดีไม่ถูกต้อง: ${invalid}`);
            await this.prisma.logOption.updateMany({ where: { guildId, key: dbKey }, data: { value: JSON.stringify(cleaned) } });
        };

        await saveList('IGNORED_CHANNELS', input.ignoredChannels);
        await saveList('IGNORED_USERS', input.ignoredUsers);
        await saveList('IGNORED_ROLES', input.ignoredRoles);
        if (typeof input.ignoreBots === 'boolean') {
            await this.prisma.logOption.updateMany({ where: { guildId, key: 'IGNORE_BOTS' }, data: { value: input.ignoreBots ? '1' : '0' } });
        }
        if (typeof input.activityRecording === 'boolean') {
            await this.prisma.logOption.updateMany({ where: { guildId, key: 'ACTIVITY_RECORDING' }, data: { value: input.activityRecording ? '1' : '0' } });
        }

        await this.reload(guildId);
        return this.listOptions(guildId);
    }
}
