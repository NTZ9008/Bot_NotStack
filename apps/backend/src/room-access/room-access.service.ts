import { HttpStatus, Injectable } from '@nestjs/common';
import { ALL_ROOMS, type AccessRoom, type GrantAccessResponse, type RoomAccessItem } from '@notstack/shared';
import { OverwriteType, PermissionsBitField, type GuildChannel } from 'discord.js';
import { ApiException, badRequest } from '../common/exceptions/api.exception';
import { DiscordService } from '../discord/discord.service';
import { PrismaService } from '../prisma/prisma.service';
import type { GrantAccessDto } from './dto/grant-access.dto';

export const isGuildChannel = (channel: unknown): channel is GuildChannel =>
    typeof channel === 'object' && channel !== null && 'permissionOverwrites' in channel;

// สิทธิ์ที่ตั๋วเข้าห้องให้ — ตอนถอน/หมดเวลาจะคืนเฉพาะสิทธิ์เหล่านี้
const ROOM_ACCESS_PERMISSIONS = ['ViewChannel', 'ReadMessageHistory', 'Connect', 'Speak', 'SendMessages'] as const;

// ถอนตั๋วเข้าห้อง: สิทธิ์อื่นที่แอดมินตั้งให้คนนั้นไว้เอง (เช่นห้ามแนบไฟล์) ยังอยู่
// ไม่เหลือสิทธิ์อื่นแล้ว = ลบ overwrite ของคนนั้นทิ้งทั้งอัน
export async function revokeRoomAccess(channel: GuildChannel, userId: string): Promise<void> {
    const overwrite = channel.permissionOverwrites.cache.get(userId);
    if (!overwrite) return;
    const remaining = new PermissionsBitField(overwrite.allow.bitfield).remove(ROOM_ACCESS_PERMISSIONS);
    if (remaining.bitfield === 0n && overwrite.deny.bitfield === 0n) {
        await channel.permissionOverwrites.delete(userId);
        return;
    }
    await channel.permissionOverwrites.edit(userId, Object.fromEntries(ROOM_ACCESS_PERMISSIONS.map((name) => [name, null])), {
        type: OverwriteType.Member,
    });
}

// ==========================================
// 🎫 ROOM ACCESS — ให้สิทธิ์เห็นห้องพิเศษ (ถาวร / จำกัดเวลา)
// ห้องที่ใช้ระบบนี้ได้ ตั้งเองต่อเซิร์ฟเวอร์ (ตาราง room_access_channels) — การถอนสิทธิ์เมื่อหมดเวลาอยู่ใน RoomAccessExpiryTask
// ==========================================
@Injectable()
export class RoomAccessService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly discord: DiscordService,
    ) {}

    // ห้องที่ตั้งไว้ของเซิร์ฟเวอร์ พร้อมชื่อห้องจริง
    async rooms(guildId: string): Promise<AccessRoom[]> {
        const rows = await this.prisma.roomAccessChannel.findMany({ where: { guildId }, orderBy: { createdAt: 'asc' } });
        const guild = this.discord.guild(guildId);
        return rows.map((row) => {
            const channel = guild?.channels.cache.get(row.channelId);
            return { id: row.channelId, name: channel?.name ?? row.channelId, exists: Boolean(channel) };
        });
    }

    async addRoom(guildId: string, channelId: string): Promise<AccessRoom[]> {
        const channel = await this.discord.fetchGuildChannel(guildId, channelId);
        if (!isGuildChannel(channel)) throw badRequest('ไม่พบห้องนี้ในเซิร์ฟเวอร์');
        await this.prisma.roomAccessChannel.createMany({ data: [{ guildId, channelId }], skipDuplicates: true });
        return this.rooms(guildId);
    }

    // เอาห้องออกจากระบบ (สิทธิ์ที่ให้ไปแล้วในห้องนั้นยังอยู่ — ถอนเองได้ในหน้า Room Access ก่อนเอาห้องออก)
    async removeRoom(guildId: string, channelId: string): Promise<AccessRoom[]> {
        await this.prisma.$transaction([
            this.prisma.roomAccess.deleteMany({ where: { guildId, roomId: channelId } }),
            this.prisma.roomAccessChannel.deleteMany({ where: { guildId, channelId } }),
        ]);
        return this.rooms(guildId);
    }

    async change(guildId: string, input: GrantAccessDto): Promise<GrantAccessResponse> {
        this.discord.requireReady();
        const configured = (await this.prisma.roomAccessChannel.findMany({ where: { guildId }, select: { channelId: true } })).map((row) => row.channelId);
        if (input.roomId !== ALL_ROOMS && !configured.includes(input.roomId)) throw badRequest('ห้องนี้ไม่ได้อยู่ในรายการห้องของ Room Access');
        const targetRooms = input.roomId === ALL_ROOMS ? configured : [input.roomId];
        if (targetRooms.length === 0) throw badRequest('ยังไม่ได้เพิ่มห้องที่ใช้ระบบตั๋ว');

        let successCount = 0;
        const errors: string[] = [];
        for (const id of targetRooms) {
            try {
                const channel = await this.discord.fetchGuildChannel(guildId, id);
                if (!isGuildChannel(channel)) {
                    errors.push(`หาห้อง ${id} ไม่พบ`);
                    continue;
                }

                if (input.action === 'grant') {
                    await channel.permissionOverwrites.edit(input.userId, Object.fromEntries(ROOM_ACCESS_PERMISSIONS.map((name) => [name, true])), {
                        type: OverwriteType.Member,
                    });

                    // ล้างสิทธิ์ชั่วคราวเดิม (ถ้ามี) แล้วบันทึกเวลาหมดอายุใหม่ถ้าเป็นแบบจำกัดเวลา
                    await this.prisma.roomAccess.deleteMany({ where: { userId: input.userId, roomId: id } });
                    if (input.duration && input.duration > 0) {
                        const expireAt = Date.now() + input.duration * 60 * 1000; // duration เป็นนาที
                        await this.prisma.roomAccess.create({ data: { guildId, userId: input.userId, roomId: id, expireAt: new Date(expireAt) } });

                        // แจ้งผู้ใช้พร้อมตัวนับถอยหลังของ Discord
                        const user = await this.discord.fetchUser(input.userId);
                        await user?.send(`🎫 คุณได้รับตั๋วเข้าห้อง **${channel.name}** แล้ว (หมดเวลา: <t:${Math.floor(expireAt / 1000)}:R>)`).catch(() => {});
                    }
                } else {
                    await revokeRoomAccess(channel, input.userId);
                    await this.prisma.roomAccess.deleteMany({ where: { userId: input.userId, roomId: id } });
                }
                successCount++;
            } catch (err) {
                errors.push(`เกิดข้อผิดพลาดกับห้อง ${id}: ${(err as Error).message}`);
            }
        }

        if (successCount === 0 && errors.length > 0) throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, errors.join(', '));
        const actionText = input.action === 'grant' ? 'ให้สิทธิ์' : 'ถอนสิทธิ์';
        return { success: true, message: `${actionText}สำเร็จ ${successCount} ห้อง`, errors: errors.length ? errors : undefined };
    }

    // ทุกคนที่เห็นห้องพิเศษได้ (ดูจาก permission overwrite ของห้องจริง) + เวลาหมดอายุของสิทธิ์ชั่วคราว
    async list(guildId: string): Promise<RoomAccessItem[]> {
        this.discord.requireReady();
        const [rooms, activeAccess] = await Promise.all([
            this.prisma.roomAccessChannel.findMany({ where: { guildId }, orderBy: { createdAt: 'asc' } }),
            this.prisma.roomAccess.findMany({ where: { guildId } }),
        ]);
        const result: RoomAccessItem[] = [];

        for (const room of rooms) {
            // force: true เพื่อให้ได้ permission ล่าสุด ไม่ใช่ค่าในแคช
            const channel = await this.discord.fetchGuildChannel(guildId, room.channelId, true);
            if (!isGuildChannel(channel)) continue;

            const overwrites = channel.permissionOverwrites.cache.filter((o) => o.type === OverwriteType.Member);
            for (const [userId, overwrite] of overwrites) {
                if (!overwrite.allow.has('ViewChannel')) continue;
                const user = await this.discord.fetchUser(userId);
                const temp = activeAccess.find((r) => r.userId === userId && r.roomId === room.channelId);
                result.push({
                    userId,
                    username: user ? user.globalName || user.username : userId,
                    avatar: user ? user.displayAvatarURL({ size: 64 }) : null,
                    roomId: room.channelId,
                    roomName: channel.name,
                    type: temp ? 'temporary' : 'permanent',
                    expireAt: temp ? temp.expireAt.getTime() : null,
                });
            }
        }
        return result;
    }
}
