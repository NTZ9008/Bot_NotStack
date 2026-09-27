import fs from 'node:fs';
import path from 'node:path';
import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { xpForNextLevel, type LevelRow } from '@notstack/shared';
import type { Message } from 'discord.js';
import { REPO_ROOT } from '../config/paths';
import { DiscordService } from '../discord/discord.service';
import { PrismaService } from '../prisma/prisma.service';

export interface LevelState {
    xp: number;
    level: number;
}

const MESSAGE_XP_COOLDOWN_MS = 60000;
const SAVE_INTERVAL_MS = 5000;

const keyOf = (guildId: string, userId: string) => `${guildId}:${userId}`;

// ==========================================
// 🏆 LEVEL & XP (แยกอันดับตามเซิร์ฟเวอร์) — ได้ XP จากการพิมพ์แชท (ทุก 1 นาที) และการอยู่ในห้องเสียง (VoiceXpTask)
// เก็บทั้งหมดไว้ใน memory แล้วเซฟเฉพาะคนที่ XP เปลี่ยนลง DB ทุก 5 วินาที (ตาราง levels)
// ==========================================
@Injectable()
export class LevelsService implements OnModuleInit, OnApplicationShutdown {
    private readonly logger = new Logger('Levels');
    private readonly levels = new Map<string, LevelState>();
    private readonly dirty = new Set<string>();
    // กันการสแปม XP — ให้ XP จากแชทได้ทุกๆ 1 นาทีเท่านั้น (แยกตามเซิร์ฟเวอร์)
    private readonly cooldown = new Set<string>();
    private loaded = false;

    constructor(
        private readonly prisma: PrismaService,
        private readonly discord: DiscordService,
    ) {}

    async onModuleInit(): Promise<void> {
        try {
            await this.importLegacyJson();
            const rows = await this.prisma.level.findMany();
            for (const row of rows) this.levels.set(keyOf(row.guildId, row.userId), { xp: row.xp, level: row.level });
            this.loaded = true;
            this.logger.log(`✅ Loaded ${rows.length} levels from DB`);
        } catch (err) {
            this.logger.error(`❌ Error loading levels from DB: ${(err as Error).message}`);
        }
    }

    async onApplicationShutdown(): Promise<void> {
        await this.save();
    }

    // ย้ายข้อมูลจาก levels.json (บอทรุ่นแรกสุด — มีแต่เซิร์ฟเวอร์หลัก) ถ้ายังมีไฟล์อยู่ แล้วเปลี่ยนชื่อไฟล์กันโหลดซ้ำ
    private async importLegacyJson(): Promise<void> {
        const file = path.join(REPO_ROOT, 'levels.json');
        if (!fs.existsSync(file)) return;
        const data = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, LevelState>;
        await this.prisma.level.createMany({
            data: Object.entries(data).map(([userId, d]) => ({ guildId: this.discord.homeGuildId, userId, xp: d.xp, level: d.level })),
            skipDuplicates: true,
        });
        fs.renameSync(file, path.join(REPO_ROOT, 'levels_migrated.json'));
        this.logger.log('✅ Migrated levels.json to PostgreSQL database');
    }

    // ข้อมูลของเซิร์ฟเวอร์เดียว (ใช้ในคำสั่ง /rank) — จาก memory จะได้ตรงกับ XP ล่าสุด
    forGuild(guildId: string): Map<string, LevelState> {
        const prefix = `${guildId}:`;
        const result = new Map<string, LevelState>();
        for (const [key, state] of this.levels) if (key.startsWith(prefix)) result.set(key.slice(prefix.length), { ...state });
        return result;
    }

    // อันดับของเซิร์ฟเวอร์ (เรียงเลเวล แล้ว XP) สำหรับหน้า Levels
    async list(guildId: string): Promise<LevelRow[]> {
        const rows = [...this.forGuild(guildId).entries()].sort(([, a], [, b]) => b.level - a.level || b.xp - a.xp);
        const guild = this.discord.guild(guildId);
        return Promise.all(
            rows.map(async ([userId, state]) => {
                const member = guild?.members.cache.get(userId);
                const username = member?.displayName ?? (this.discord.ready ? await this.discord.displayName(userId) : null);
                return { userId, xp: state.xp, level: state.level, username: username ?? 'Unknown User' };
            }),
        );
    }

    addXp(guildId: string, userId: string, amount: number): void {
        const key = keyOf(guildId, userId);
        const state = this.levels.get(key) ?? { xp: 0, level: 0 };
        state.xp += amount;
        // สูตรคำนวณ XP ที่ต้องใช้เพื่ออัปเลเวลถัดไป: 100 * (level + 1)^2
        if (state.xp >= xpForNextLevel(state.level)) state.level += 1;
        this.levels.set(key, state);
        this.dirty.add(key);
    }

    isLoaded(): boolean {
        return this.loaded;
    }

    // XP จากการพิมพ์แชท: สุ่ม 15-25 หน่วย ทุกๆ 1 นาที
    awardMessageXp(message: Message): void {
        if (!this.loaded || !message.guildId || message.author.bot) return;
        const key = keyOf(message.guildId, message.author.id);
        if (this.cooldown.has(key)) return;

        this.addXp(message.guildId, message.author.id, Math.floor(Math.random() * 11) + 15);
        this.cooldown.add(key);
        setTimeout(() => this.cooldown.delete(key), MESSAGE_XP_COOLDOWN_MS).unref();
    }

    // เซฟเฉพาะคนที่ XP เปลี่ยนด้วย query เดียว (INSERT ... ON CONFLICT + UNNEST)
    @Interval(SAVE_INTERVAL_MS)
    async save(): Promise<void> {
        if (this.dirty.size === 0) return;
        const keys = [...this.dirty];
        this.dirty.clear();
        const guildIds: string[] = [];
        const userIds: string[] = [];
        const xps: number[] = [];
        const levels: number[] = [];
        for (const key of keys) {
            const [guildId, userId] = key.split(':') as [string, string];
            const state = this.levels.get(key)!;
            guildIds.push(guildId);
            userIds.push(userId);
            xps.push(state.xp);
            levels.push(state.level);
        }
        try {
            await this.prisma.$executeRaw`
                INSERT INTO levels (guild_id, user_id, xp, level)
                SELECT * FROM UNNEST(${guildIds}::text[], ${userIds}::text[], ${xps}::int[], ${levels}::int[])
                ON CONFLICT (guild_id, user_id) DO UPDATE SET xp = EXCLUDED.xp, level = EXCLUDED.level`;
        } catch (err) {
            // เซฟไม่สำเร็จ → ลองใหม่รอบหน้า
            for (const key of keys) this.dirty.add(key);
            this.logger.error(`❌ Error saving levels to DB: ${(err as Error).message}`);
        }
    }
}
