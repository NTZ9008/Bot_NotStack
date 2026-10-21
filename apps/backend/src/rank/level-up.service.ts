import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { fillLevelUpMessage, levelForXp, planRewardChanges, type LevelUpSettings } from '@notstack/shared';
import { AttachmentBuilder, PermissionFlagsBits, type Guild, type GuildMember, type MessageCreateOptions, type Role } from 'discord.js';
import type { Subscription } from 'rxjs';
import { DiscordService } from '../discord/discord.service';
import { LevelsService, type LevelChange } from '../levels/levels.service';
import { PrismaService } from '../prisma/prisma.service';
import { RankCardService } from './rank-card.service';
import { RankCardStore } from './rank-card.store';

// เลเวลที่เปลี่ยนจากกิจกรรมเท่านั้นที่ประกาศ (แอดมินแก้ XP ให้ = ปรับยศอย่างเดียว ไม่ประกาศ)
const ANNOUNCED_SOURCES = new Set(['message', 'voice', 'command']);

// ==========================================
// 🎉 LEVEL UP — ฟังการเปลี่ยนเลเวลจาก LevelsService แล้ว
// 1) ปรับยศรางวัลให้ตรงกับเลเวล (ทั้งเลเวลขึ้นและลง) 2) ประกาศเลเวลอัป (ข้อความ + การ์ดรูป) ตามที่ตั้งไว้
// บอทจัดการเฉพาะยศที่อยู่ในรายการรางวัล และข้ามยศที่ให้ไม่ได้ (สูงกว่ายศของบอท / ยศของ integration)
// ==========================================
@Injectable()
export class LevelUpService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger('LevelUp');
    private subscription: Subscription | null = null;
    // เซิร์ฟเวอร์ที่กำลังไล่ปรับยศให้สมาชิกเดิมทั้งหมด (ทำทีละงานต่อเซิร์ฟเวอร์)
    private readonly syncing = new Set<string>();

    constructor(
        private readonly levels: LevelsService,
        private readonly store: RankCardStore,
        private readonly cards: RankCardService,
        private readonly discord: DiscordService,
        private readonly prisma: PrismaService,
    ) {}

    onModuleInit(): void {
        this.subscription = this.levels.levelChanges.subscribe((change) => {
            this.handle(change).catch((err: Error) => this.logger.error(`เลเวลของ ${change.guildId}/${change.userId}: ${err.stack ?? err.message}`));
        });
    }

    onModuleDestroy(): void {
        this.subscription?.unsubscribe();
    }

    async handle(change: LevelChange): Promise<void> {
        const guild = this.discord.guild(change.guildId);
        if (!guild) return;
        const settings = await this.store.levelUp(change.guildId);
        const announce = settings.announce && change.level > change.previousLevel && ANNOUNCED_SOURCES.has(change.source);
        if (!settings.rewards.length && !announce) return;

        const member = await guild.members.fetch(change.userId).catch(() => null);
        if (!member || member.user.bot) return;
        const { granted } = await this.syncRewards(guild, member, settings, change.level);
        if (announce) await this.announce(guild, member, change, settings, granted);
    }

    // ยศรางวัลที่บอทให้/ถอนได้จริง (null = ให้ไม่ได้)
    private assignable(guild: Guild, roleId: string): Role | null {
        const role = guild.roles.cache.get(roleId);
        const me = guild.members.me;
        if (!role || role.managed || !me || !me.permissions.has(PermissionFlagsBits.ManageRoles)) return null;
        return role.position < me.roles.highest.position ? role : null;
    }

    // granted = ยศที่เพิ่งได้รอบนี้ (ใช้ในข้อความประกาศ), changed = มีการเพิ่ม/ถอนยศ
    async syncRewards(guild: Guild, member: GuildMember, settings: LevelUpSettings, level: number): Promise<{ granted: Role[]; changed: boolean }> {
        if (!settings.rewards.length) return { granted: [], changed: false };
        const plan = planRewardChanges(settings, level, member.roles.cache.keys());
        const add = plan.add.map((id) => this.assignable(guild, id)).filter((role): role is Role => role !== null);
        const remove = plan.remove.map((id) => this.assignable(guild, id)).filter((role): role is Role => role !== null);
        const skipped = plan.add.length + plan.remove.length - add.length - remove.length;
        if (skipped) this.logger.warn(`${guild.name}: ให้/ถอนยศรางวัลไม่ได้ ${skipped} ยศ (ยศสูงกว่าบอท / บอทไม่มีสิทธิ์ Manage Roles / ยศถูกลบ)`);
        if (add.length) await member.roles.add(add, `ยศรางวัลเลเวล ${level}`);
        if (remove.length) await member.roles.remove(remove, `ปรับยศรางวัลตามเลเวล ${level}`);
        return { granted: add, changed: add.length + remove.length > 0 };
    }

    private async announce(guild: Guild, member: GuildMember, change: LevelChange, settings: LevelUpSettings, granted: Role[]): Promise<void> {
        const content = fillLevelUpMessage(settings.message, {
            mention: `<@${member.id}>`,
            user: member.displayName,
            level: String(change.level),
            previousLevel: String(change.previousLevel),
            server: guild.name,
            roles: granted.map((role) => role.name).join(', '),
        }).trim();
        const files = settings.showCard
            ? [
                  new AttachmentBuilder(
                      await this.cards.renderLevelUp(guild.id, member.user, member, {
                          previousLevel: change.previousLevel,
                          level: change.level,
                          rewardNames: granted.map((role) => role.name),
                      }),
                      { name: 'level-up.png' },
                  ),
              ]
            : [];
        if (!content && !files.length) return;
        // แท็กได้แค่คนที่เลเวลขึ้น (ชื่อเล่นที่แทนค่าใน {user} แท็กใครไม่ได้)
        const payload: MessageCreateOptions = { content: content || undefined, files, allowedMentions: { users: [member.id] } };

        if (settings.destination === 'dm') {
            await member.send(payload).catch(() => this.logger.warn(`ส่ง DM เลเวลอัปให้ ${member.id} ไม่ได้ (อาจปิด DM)`));
            return;
        }
        const channel = await this.targetChannel(guild, settings, change.channelId, files.length > 0);
        if (!channel) return void this.logger.warn(`${guild.name}: ไม่มีห้องที่ส่งประกาศเลเวลอัปได้`);
        await channel.send(payload);
    }

    // ห้องที่คุยอยู่ (ถ้าเลือกแบบนั้นและบอทส่งได้) → ไม่งั้นห้องที่ตั้งไว้
    private async targetChannel(guild: Guild, settings: LevelUpSettings, activityChannelId: string | null, withFiles: boolean) {
        const candidates = settings.destination === 'current' ? [activityChannelId, settings.channelId] : [settings.channelId];
        const me = guild.members.me;
        for (const id of candidates) {
            if (!id) continue;
            const channel = await this.discord.fetchGuildChannel(guild.id, id);
            if (!channel || !('guild' in channel) || !channel.isSendable() || !me) continue;
            const permissions = channel.permissionsFor(me);
            const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, ...(withFiles ? [PermissionFlagsBits.AttachFiles] : [])];
            if (permissions?.has(needed)) return channel;
        }
        return null;
    }

    // ==========================================
    // หน้าเว็บ
    // ==========================================

    // คำเตือนของการตั้งค่า (ยศที่ให้ไม่ได้ / ห้องที่ส่งไม่ได้) — บันทึกได้แม้มีคำเตือน แอดมินอาจไปแก้สิทธิ์ใน Discord ทีหลัง
    async warnings(guildId: string, settings: LevelUpSettings): Promise<string[]> {
        const guild = this.discord.guild(guildId);
        if (!guild) return [];
        const me = guild.members.me;
        const warnings: string[] = [];
        if (settings.rewards.length && !me?.permissions.has(PermissionFlagsBits.ManageRoles)) warnings.push('บอทไม่มีสิทธิ์ Manage Roles จึงให้ยศรางวัลไม่ได้');
        for (const reward of settings.rewards) {
            const role = guild.roles.cache.get(reward.roleId);
            if (!role) warnings.push(`ยศรางวัลของเลเวล ${reward.level} ถูกลบไปแล้ว`);
            else if (role.managed) warnings.push(`ยศ "${role.name}" เป็นยศของบอท/integration — บอทให้ยศนี้ไม่ได้`);
            else if (me && role.position >= me.roles.highest.position) warnings.push(`ยศ "${role.name}" อยู่สูงกว่ายศของบอท — ลากยศของบอทให้อยู่เหนือยศนี้ใน Server Settings → Roles`);
        }
        if (settings.announce && settings.destination === 'channel' && !settings.channelId) warnings.push('ยังไม่ได้เลือกห้องประกาศเลเวลอัป');
        if (settings.announce && settings.destination !== 'dm' && settings.channelId && !(await this.targetChannel(guild, { ...settings, destination: 'channel' }, null, settings.showCard))) {
            warnings.push('บอทส่งข้อความ/แนบรูปในห้องประกาศที่เลือกไม่ได้ — เช็คสิทธิ์ของบอทในห้องนั้น');
        }
        return warnings;
    }

    // ปรับยศรางวัลให้สมาชิกที่มี XP อยู่แล้วทั้งหมด (เช่นเพิ่งเพิ่มยศรางวัลใหม่) — ทำเบื้องหลัง คืนจำนวนที่จะตรวจ
    async syncAll(guildId: string): Promise<number> {
        if (this.syncing.has(guildId)) return 0;
        const guild = this.discord.requireGuild(guildId);
        const settings = await this.store.levelUp(guildId);
        const curve = (await this.levels.settings(guildId)).settings;
        const rows = await this.prisma.level.findMany({ where: { guildId }, select: { userId: true, xp: true } });
        this.syncing.add(guildId);
        void (async () => {
            let changed = 0;
            try {
                const members = await guild.members.fetch();
                for (const row of rows) {
                    const member = members.get(row.userId);
                    if (!member || member.user.bot) continue;
                    try {
                        if ((await this.syncRewards(guild, member, settings, levelForXp(row.xp, curve))).changed) changed++;
                    } catch (err) {
                        this.logger.warn(`ปรับยศรางวัลของ ${row.userId} ไม่สำเร็จ: ${(err as Error).message}`);
                    }
                }
                this.logger.log(`${guild.name}: ปรับยศรางวัลสมาชิกเดิมเสร็จแล้ว (${rows.length} คน, เปลี่ยน ${changed} คน)`);
            } catch (err) {
                this.logger.error(`${guild.name}: ปรับยศรางวัลสมาชิกเดิมไม่สำเร็จ: ${(err as Error).message}`);
            } finally {
                this.syncing.delete(guildId);
            }
        })();
        return rows.length;
    }
}
