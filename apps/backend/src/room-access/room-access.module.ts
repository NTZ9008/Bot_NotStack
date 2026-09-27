import { Module } from '@nestjs/common';
import { RoomAccessController } from './room-access.controller';
import { RoomAccessService } from './room-access.service';
import { RoomAccessExpiryTask } from './tasks/room-access-expiry.task';

@Module({
    controllers: [RoomAccessController],
    providers: [RoomAccessService, RoomAccessExpiryTask],
})
export class RoomAccessModule {}
