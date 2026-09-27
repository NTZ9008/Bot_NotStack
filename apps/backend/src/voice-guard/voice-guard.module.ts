import { Module } from '@nestjs/common';
import { VoiceStateListener } from './listeners/voice-state.listener';
import { BlacklistController, WhitelistController } from './voice-guard.controller';
import { VoiceGuardService } from './voice-guard.service';

@Module({
    controllers: [WhitelistController, BlacklistController],
    providers: [VoiceGuardService, VoiceStateListener],
})
export class VoiceGuardModule {}
