import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { AccessRoom, GrantAccessResponse, RoomAccessItem } from '@notstack/shared';
import { Audit } from '../common/decorators/audit.decorator';
import { GuildId } from '../guilds/decorators/guild-id.decorator';
import { GuildRoute } from '../guilds/decorators/guild-route.decorator';
import { AccessRoomDto } from './dto/access-room.dto';
import { GrantAccessDto } from './dto/grant-access.dto';
import { RoomAccessService } from './room-access.service';

// ==========================================
// 🎫 ROOM ACCESS API — /api/guilds/:guildId/room-access
// GET  /                  ผู้ที่มีสิทธิ์เข้าห้องพิเศษ
// POST /                  ให้ / ถอนสิทธิ์
// GET  /rooms             ห้องที่ใช้ระบบตั๋ว
// POST /rooms             เพิ่มห้อง, POST /rooms/delete เอาห้องออก
// ==========================================
@GuildRoute()
@Controller('guilds/:guildId/room-access')
export class RoomAccessController {
    constructor(private readonly rooms: RoomAccessService) {}

    @Get()
    list(@GuildId() guildId: string): Promise<RoomAccessItem[]> {
        return this.rooms.list(guildId);
    }

    @Audit('room_access.change')
    @Post()
    @HttpCode(HttpStatus.OK)
    change(@GuildId() guildId: string, @Body() body: GrantAccessDto): Promise<GrantAccessResponse> {
        return this.rooms.change(guildId, body);
    }

    @Get('rooms')
    listRooms(@GuildId() guildId: string): Promise<AccessRoom[]> {
        return this.rooms.rooms(guildId);
    }

    @Audit('room_access.room_add')
    @Post('rooms')
    @HttpCode(HttpStatus.OK)
    addRoom(@GuildId() guildId: string, @Body() body: AccessRoomDto): Promise<AccessRoom[]> {
        return this.rooms.addRoom(guildId, body.channelId);
    }

    @Audit('room_access.room_remove')
    @Post('rooms/delete')
    @HttpCode(HttpStatus.OK)
    removeRoom(@GuildId() guildId: string, @Body() body: AccessRoomDto): Promise<AccessRoom[]> {
        return this.rooms.removeRoom(guildId, body.channelId);
    }
}
