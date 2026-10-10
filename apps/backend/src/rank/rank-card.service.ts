import { Injectable, Logger } from '@nestjs/common';
import {
    applyMemberStyle,
    LEADERBOARD_PAGE_SIZE,
    levelForXp,
    xpAtLevel,
    xpForNextLevel,
    type LevelUpSettings,
    type RankCardStyle,
    type RankCardTheme,
    type RankMemberStyle,
    type RankPreviewKind,
} from '@notstack/shared';
import type { GuildMember, User } from 'discord.js';
import { badRequest } from '../common/exceptions/api.exception';
import { DiscordService } from '../discord/discord.service';
import { LevelsService } from '../levels/levels.service';
import { WelcomeRenderer } from '../welcome/welcome.renderer';
import { WelcomeStore } from '../welcome/welcome.store';
import { RankCardRenderer, type LeaderboardRow, type RankCardData, type RankProgress } from './rank-card.renderer';
import { RankCardStore } from './rank-card.store';

export interface RankCardResult {
    image: Buffer;
    data: Omit<RankCardData, 'avatar'>;
}

export interface LeaderboardResult {
    image: Buffer;
    page: number;
    totalPages: number;
    total: number;
}

// ตัวอย่างในหน้าเว็บเมื่อยังไม่มีข้อมูลจริงให้ใช้ (ผู้ใช้ไม่ได้เชื่อม Discord / เซิร์ฟเวอร์ยังไม่มีใครได้ XP)
const SAMPLE_NAMES = ['NotStack', 'Alice', 'บอทน้อย', 'Charlie', 'Eve 🎮', 'Frank', 'Grace', 'Heidi', 'Ivan', 'Judy'];

// รูปพื้นหลังที่ธีมอ้างถึง (ต้องเป็นรูปในคลังของเซิร์ฟเวอร์เดียวกันเท่านั้น)
export function themeAssetIds(theme: RankCardTheme): number[] {
    const ids = [...theme.members.backgroundIds];
    if (theme.style.background.type === 'image' && theme.style.background.imageId) ids.push(theme.style.background.imageId);
    return [...new Set(ids)];
}

// ==========================================
// 🏆 RANK CARDS — รวมข้อมูล (XP / อันดับ / รูปโปรไฟล์ / ธีม) แล้วสั่งวาดการ์ด
// ใช้ร่วมกันทั้งคำสั่ง /rank /leaderboard /rankcard, ประกาศเลเวลอัป และตัวอย่างในหน้าเว็บ
// ==========================================
@Injectable()
export class RankCardService {
    private readonly logger = new Logger('RankCard');

    constructor(
        private readonly store: RankCardStore,
        private readonly renderer: RankCardRenderer,
        private readonly images: WelcomeRenderer,
        private readonly assets: WelcomeStore,
        private readonly levels: LevelsService,
        private readonly discord: DiscordService,
    ) {}

    // สไตล์ที่ใช้วาดการ์ดของสมาชิกคนนี้ (ธีม + ค่าที่แต่งเองเท่าที่ธีมอนุญาต)
    async styleFor(guildId: string, userId: string): Promise<RankCardStyle> {
        const [theme, member] = await Promise.all([this.store.theme(guildId), this.store.memberStyle(guildId, userId)]);
        return applyMemberStyle(theme, member);
    }

    // รูปที่ใช้ไม่ได้ (ถูกลบ / ไฟล์เสีย) → ใช้สีพื้นแทน ไม่ให้การ์ดทั้งใบส่งไม่ออก
    private async backgroundImage(style: RankCardStyle) {
        const { type, imageId } = style.background;
        if (type !== 'image' || !imageId) return null;
        return this.images.loadAssetImage(imageId).catch((err: Error) => {
            this.logger.warn(`โหลดรูปพื้นหลัง #${imageId} ไม่สำเร็จ: ${err.message}`);
            return null;
        });
    }

    // รูปทุกรูปที่ธีม / ตัวอย่างอ้างถึงต้องอยู่ในคลังรูปของเซิร์ฟเวอร์นี้
    async assertOwnedAssets(guildId: string, ids: number[]): Promise<void> {
        for (const id of new Set(ids)) {
            if (!(await this.assets.getAssetInfo(guildId, id))) throw badRequest('ไม่พบรูปพื้นหลังนี้ในคลังรูปของเซิร์ฟเวอร์ (อาจถูกลบไปแล้ว)');
        }
    }

    // XP + อันดับในเซิร์ฟเวอร์ (ยังไม่มี XP = เลเวล 0 ไม่มีอันดับ)
    async progress(guildId: string, userId: string): Promise<RankProgress & { rank: number | null }> {
        const page = await this.levels.list(guildId, { page: 1, pageSize: 1, userId });
        const row = page.items[0];
        const xp = row?.xp ?? 0;
        const level = levelForXp(xp, page.settings);
        return { rank: row?.rank ?? null, xp, level, levelStartXp: xpAtLevel(level, page.settings), nextLevelXp: xpForNextLevel(level, page.settings) };
    }

    async renderRank(guildId: string, user: User, member: GuildMember | null, style?: RankCardStyle): Promise<RankCardResult> {
        const useStyle = style ?? (await this.styleFor(guildId, user.id));
        const [progress, avatar, background] = await Promise.all([
            this.progress(guildId, user.id),
            this.images.loadAvatarImage(user, 256),
            this.backgroundImage(useStyle),
        ]);
        const data = {
            ...progress,
            displayName: member?.displayName || user.globalName || user.username,
            username: user.username,
            serverName: this.discord.guild(guildId)?.name ?? '',
        };
        return { image: await this.renderer.renderRank(useStyle, { ...data, avatar }, { background }), data };
    }

    // ตารางอันดับใช้ธีมของเซิร์ฟเวอร์ (ไม่ใช่การ์ดของคนใดคนหนึ่ง) — หน้าเกินจำนวนหน้าที่มี = หน้าสุดท้าย
    async renderLeaderboard(guildId: string, page: number, style?: RankCardStyle, sampleIfEmpty = false): Promise<LeaderboardResult> {
        const useStyle = style ?? (await this.store.theme(guildId)).style;
        let result = await this.levels.list(guildId, { page, pageSize: LEADERBOARD_PAGE_SIZE });
        const totalPages = Math.max(1, Math.ceil(result.total / LEADERBOARD_PAGE_SIZE));
        if (page > totalPages && result.total) result = await this.levels.list(guildId, { page: totalPages, pageSize: LEADERBOARD_PAGE_SIZE });

        const guild = this.discord.guild(guildId);
        const [rows, serverIcon, background] = await Promise.all([
            Promise.all(
                result.items.map(async (item): Promise<LeaderboardRow> => {
                    const user = this.discord.ready ? await this.discord.fetchUser(item.userId) : null;
                    const level = levelForXp(item.xp, result.settings);
                    return {
                        rank: item.rank,
                        displayName: item.username,
                        avatar: await this.images.loadAvatarImage(user, 128),
                        level,
                        xp: item.xp,
                        levelStartXp: xpAtLevel(level, result.settings),
                        nextLevelXp: xpForNextLevel(level, result.settings),
                    };
                }),
            ),
            this.images.loadImageUrl(guild?.iconURL({ extension: 'png', size: 128 }), `ไอคอนเซิร์ฟเวอร์ ${guildId}`),
            this.backgroundImage(useStyle),
        ]);
        const shown = rows.length || !sampleIfEmpty ? rows : this.sampleRows(result.settings);
        const image = await this.renderer.renderLeaderboard(
            useStyle,
            { serverName: guild?.name ?? 'เซิร์ฟเวอร์', serverIcon, page: result.page, totalPages, rows: shown },
            { background },
        );
        return { image, page: result.page, totalPages, total: result.total };
    }

    async renderLevelUp(
        guildId: string,
        user: User,
        member: GuildMember | null,
        levels: { previousLevel: number; level: number; rewardNames: string[] },
        style?: RankCardStyle,
    ): Promise<Buffer> {
        const useStyle = style ?? (await this.styleFor(guildId, user.id));
        const [avatar, background] = await Promise.all([this.images.loadAvatarImage(user, 256), this.backgroundImage(useStyle)]);
        return this.renderer.renderLevelUp(useStyle, { displayName: member?.displayName || user.globalName || user.username, avatar, ...levels }, { background });
    }

    // ==========================================
    // ตัวอย่างในหน้าเว็บ
    // ==========================================
    private sampleRows(curve: { curveBase: number; curveExponent: number }): LeaderboardRow[] {
        return SAMPLE_NAMES.map((displayName, i) => {
            const level = 30 - i * 3;
            const levelStartXp = xpAtLevel(level, curve);
            const nextLevelXp = xpForNextLevel(level, curve);
            return { rank: i + 1, displayName, avatar: null, level, xp: Math.round(levelStartXp + (nextLevelXp - levelStartXp) * 0.6), levelStartXp, nextLevelXp };
        });
    }

    // ผู้ใช้ Dashboard ที่เชื่อม Discord ไว้ = ใช้รูป/ชื่อ/XP ของตัวเอง ไม่งั้นใช้ตัวบอท
    private async sampleUser(guildId: string, discordId: string | null): Promise<{ user: User | null; member: GuildMember | null }> {
        const client = this.discord.ready;
        if (!client) return { user: null, member: null };
        const id = discordId ?? client.user.id;
        const member = (await this.discord.guild(guildId)?.members.fetch(id).catch(() => null)) ?? null;
        return { user: member?.user ?? (await this.discord.fetchUser(id)), member };
    }

    private async rewardNames(guildId: string, settings: LevelUpSettings, level: number): Promise<string[]> {
        const guild = this.discord.guild(guildId);
        return settings.rewards
            .filter((reward) => reward.level === level)
            .map((reward) => guild?.roles.cache.get(reward.roleId)?.name)
            .filter((name): name is string => Boolean(name));
    }

    async preview(guildId: string, kind: RankPreviewKind, style: RankCardStyle, viewerDiscordId: string | null, levelUp?: LevelUpSettings): Promise<Buffer> {
        if (kind === 'leaderboard') return (await this.renderLeaderboard(guildId, 1, style, true)).image;

        const { user, member } = await this.sampleUser(guildId, viewerDiscordId);
        if (kind === 'levelup') {
            const settings = levelUp ?? (await this.store.levelUp(guildId));
            // ตัวอย่างใช้เลเวลของยศรางวัลแรก (ถ้ามี) จะได้เห็นบรรทัด "ได้รับยศ"
            const level = settings.rewards[0]?.level ?? 12;
            const rewardNames = await this.rewardNames(guildId, settings, level);
            if (user) return this.renderLevelUp(guildId, user, member, { previousLevel: level - 1, level, rewardNames }, style);
            return this.renderer.renderLevelUp(style, { displayName: 'NotStack', avatar: null, previousLevel: level - 1, level, rewardNames }, { background: await this.backgroundImage(style) });
        }

        if (user) return (await this.renderRank(guildId, user, member, style)).image;
        return this.renderer.renderRank(
            style,
            { displayName: 'NotStack', username: 'notstack', avatar: null, rank: 1, level: 12, xp: 15500, levelStartXp: 14400, nextLevelXp: 16900, serverName: '' },
            { background: await this.backgroundImage(style) },
        );
    }

    async previewMember(guildId: string, discordId: string, draft: RankMemberStyle, kind: RankPreviewKind): Promise<Buffer> {
        const style = applyMemberStyle(await this.store.theme(guildId), draft);
        if (kind !== 'levelup') return this.preview(guildId, 'rank', style, discordId);
        const { level } = await this.progress(guildId, discordId);
        const { user, member } = await this.sampleUser(guildId, discordId);
        if (!user) return this.preview(guildId, 'levelup', style, discordId);
        return this.renderLevelUp(guildId, user, member, { previousLevel: level, level: level + 1, rewardNames: [] }, style);
    }
}
