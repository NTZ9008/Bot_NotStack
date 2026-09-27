import { Global, Module } from '@nestjs/common';
import { GuildAccessService } from './guild-access.service';
import { GuildsController, GuildsListController } from './guilds.controller';
import { GuildsService } from './guilds.service';
import { GuildAccessGuard } from './guards/guild-access.guard';
import { GuildSyncListener } from './listeners/guild-sync.listener';

// ทุกโมดูลที่มี route ใต้ /api/guilds/:guildId ใช้ GuildAccessGuard ตัวนี้
@Global()
@Module({
    controllers: [GuildsListController, GuildsController],
    providers: [GuildsService, GuildAccessService, GuildAccessGuard, GuildSyncListener],
    exports: [GuildsService, GuildAccessService, GuildAccessGuard],
})
export class GuildsModule {}
