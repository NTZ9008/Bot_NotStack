import { Controller, Get, Query } from '@nestjs/common';
import type { GuildChannel, GuildListResponse, GuildRole, GuildSummary, MemberSearchResult, VoiceChannelOption } from '@notstack/shared';
import { ChannelType } from 'discord.js';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DiscordService } from '../discord/discord.service';
import type { User } from '../generated/prisma/client';
import { GuildId } from './decorators/guild-id.decorator';
import { GuildAccess, GuildRoute } from './decorators/guild-route.decorator';
import { GuildsService } from './guilds.service';

// ช่องที่ส่งข้อความ log/การ์ดต้อนรับได้ (ข้ามห้องเสียง / หมวดหมู่ / เธรด)
const SENDABLE_TYPES: ChannelType[] = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const VOICE_TYPES: ChannelType[] = [ChannelType.GuildVoice, ChannelType.GuildStageVoice];

// ห้อง/หมวดหมู่ที่ใส่ใน ignore list ได้ (กว้างกว่าห้องที่ส่งข้อความได้)
const LISTED_TYPES: ChannelType[] = [...SENDABLE_TYPES, ...VOICE_TYPES, ChannelType.GuildForum, ChannelType.GuildCategory];

// ==========================================
// 🏰 GUILDS API
// GET /api/guilds                       เซิร์ฟเวอร์ที่ผู้ใช้เข้าถึงได้ + ลิงก์เชิญบอท
// GET /api/guilds/:guildId              ข้อมูลเซิร์ฟเวอร์ + สิทธิ์ของผู้ใช้
// GET /api/guilds/:guildId/channels     รายชื่อห้อง / ยศ / ห้องเสียง / ค้นหาสมาชิก (ทำ dropdown ในหน้าเว็บ)
// ==========================================
@Controller('guilds')
export class GuildsListController {
    constructor(private readonly guilds: GuildsService) {}

    @Get()
    list(@CurrentUser() user: User): Promise<GuildListResponse> {
        return this.guilds.listForUser(user);
    }
}

@GuildRoute()
@Controller('guilds/:guildId')
export class GuildsController {
    constructor(
        private readonly guilds: GuildsService,
        private readonly discord: DiscordService,
    ) {}

    @GuildAccess('view')
    @Get()
    detail(@CurrentUser() user: User, @GuildId() guildId: string): Promise<GuildSummary> {
        return this.guilds.detail(user, guildId);
    }

    @Get('channels')
    channels(@GuildId() guildId: string): GuildChannel[] {
        const guild = this.discord.requireGuild(guildId);
        return guild.channels.cache
            .filter((channel) => LISTED_TYPES.includes(channel.type))
            .map((channel) => ({
                id: channel.id,
                name: channel.name,
                category: channel.parent?.name || 'ไม่มีหมวดหมู่',
                position: 'rawPosition' in channel ? channel.rawPosition : 0,
                sendable: SENDABLE_TYPES.includes(channel.type),
                isCategory: channel.type === ChannelType.GuildCategory,
                isVoice: VOICE_TYPES.includes(channel.type),
            }))
            .sort((a, b) => a.category.localeCompare(b.category) || a.position - b.position);
    }

    @Get('roles')
    roles(@GuildId() guildId: string): GuildRole[] {
        const guild = this.discord.requireGuild(guildId);
        return guild.roles.cache
            .filter((role) => role.id !== guild.id) // ข้าม @everyone
            .map((role) => ({ id: role.id, name: role.name, position: role.rawPosition ?? 0 }))
            .sort((a, b) => b.position - a.position);
    }

    @Get('voice-channels')
    voiceChannels(@GuildId() guildId: string): VoiceChannelOption[] {
        const guild = this.discord.requireGuild(guildId);
        return guild.channels.cache
            .filter((channel) => channel.type === ChannelType.GuildVoice)
            .map((channel) => ({ id: channel.id, name: channel.name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    // พิมพ์ชื่อหรือ username แล้วค้นหาสมาชิก (ใช้แทนการให้แอดมินไปก๊อป User ID มาวางเอง)
    @Get('members/search')
    async searchMembers(@GuildId() guildId: string, @Query('q') q?: string): Promise<MemberSearchResult[]> {
        const query = (typeof q === 'string' ? q : '').trim().toLowerCase();
        const guild = this.discord.requireGuild(guildId);
        if (!query) return [];
        const members = await guild.members.fetch({ query, limit: 15 });
        return members
            .filter((member) => !member.user.bot)
            .map((member) => ({
                userId: member.id,
                username: member.user.globalName || member.user.username,
                tag: member.user.username,
                avatar: member.user.displayAvatarURL({ size: 64 }),
                nickname: member.nickname || null,
            }));
    }
}
