import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { DiscordExplorer } from './discord.explorer';
import { DiscordService } from './discord.service';

// client ของ discord.js + ตัวผูก @OnDiscord / @SlashCommand — ใช้ได้ทุกโมดูล
@Global()
@Module({
    imports: [DiscoveryModule],
    providers: [DiscordService, DiscordExplorer],
    exports: [DiscordService, DiscordExplorer],
})
export class DiscordModule {}
