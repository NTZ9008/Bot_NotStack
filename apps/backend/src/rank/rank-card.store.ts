import { Injectable } from '@nestjs/common';
import {
    allowedMemberStyle,
    defaultLevelUpSettings,
    defaultRankTheme,
    normalizeLevelUpSettings,
    normalizeMemberStyle,
    normalizeRankTheme,
    type LevelUpSettings,
    type RankCardTheme,
    type RankMemberStyle,
} from '@notstack/shared';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const CACHE_TTL_MS = 60 * 1000;
const json = (value: unknown) => value as Prisma.InputJsonValue;

// ==========================================
// 💾 RANK CARD STORE — ธีมการ์ดของเซิร์ฟเวอร์ / การ์ดของสมาชิก / ตั้งค่าเลเวลอัป
// ธีมกับตั้งค่าเลเวลอัปถูกอ่านทุกครั้งที่ใช้ /rank หรือมีคนเลเวลขึ้น จึง cache 1 นาที (บันทึกผ่าน store นี้แล้วล้างทันที)
// ค่าในฐานข้อมูลผ่าน normalize ทุกครั้งที่อ่าน — ข้อมูลจากโค้ดรุ่นเก่ายังใช้ได้
// ==========================================
@Injectable()
export class RankCardStore {
    private readonly themes = new Map<string, { value: RankCardTheme; at: number }>();
    private readonly levelUps = new Map<string, { value: LevelUpSettings; at: number }>();

    constructor(private readonly prisma: PrismaService) {}

    async theme(guildId: string): Promise<RankCardTheme> {
        const hit = this.themes.get(guildId);
        if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
        const row = await this.prisma.rankCardSetting.findUnique({ where: { guildId } });
        const value = row ? normalizeRankTheme(row.theme) : defaultRankTheme();
        this.themes.set(guildId, { value, at: Date.now() });
        return value;
    }

    async saveTheme(guildId: string, theme: RankCardTheme): Promise<RankCardTheme> {
        await this.prisma.rankCardSetting.upsert({ where: { guildId }, create: { guildId, theme: json(theme) }, update: { theme: json(theme) } });
        this.themes.set(guildId, { value: theme, at: Date.now() });
        return theme;
    }

    // ค่าที่สมาชิกบันทึกไว้ (ยังไม่ตัดตามสิทธิ์ของธีมปัจจุบัน)
    async memberStyle(guildId: string, userId: string): Promise<RankMemberStyle | null> {
        const row = await this.prisma.rankCardMember.findUnique({ where: { guildId_userId: { guildId, userId } } });
        return row ? normalizeMemberStyle(row.style) : null;
    }

    // เก็บเฉพาะค่าที่ธีมอนุญาตตอนนี้ — ไม่เหลืออะไรเลย = ลบแถวทิ้ง (กลับไปใช้ธีม)
    async saveMemberStyle(guildId: string, userId: string, style: RankMemberStyle): Promise<RankMemberStyle> {
        const allowed = allowedMemberStyle(await this.theme(guildId), style);
        if (!Object.keys(allowed).length) {
            await this.deleteMemberStyle(guildId, userId);
            return {};
        }
        const key = { guildId_userId: { guildId, userId } };
        await this.prisma.rankCardMember.upsert({ where: key, create: { guildId, userId, style: json(allowed) }, update: { style: json(allowed) } });
        return allowed;
    }

    async deleteMemberStyle(guildId: string, userId: string): Promise<void> {
        await this.prisma.rankCardMember.deleteMany({ where: { guildId, userId } });
    }

    async levelUp(guildId: string): Promise<LevelUpSettings> {
        const hit = this.levelUps.get(guildId);
        if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
        const row = await this.prisma.levelUpSetting.findUnique({ where: { guildId } });
        const value = row ? normalizeLevelUpSettings(row.settings) : defaultLevelUpSettings();
        this.levelUps.set(guildId, { value, at: Date.now() });
        return value;
    }

    async saveLevelUp(guildId: string, settings: LevelUpSettings): Promise<LevelUpSettings> {
        await this.prisma.levelUpSetting.upsert({ where: { guildId }, create: { guildId, settings: json(settings) }, update: { settings: json(settings) } });
        this.levelUps.set(guildId, { value: settings, at: Date.now() });
        return settings;
    }
}
