import { Module } from '@nestjs/common';
import { VoiceListenController } from './voice-listen.controller';
import { VoiceListenService } from './voice-listen.service';

@Module({
    controllers: [VoiceListenController],
    providers: [VoiceListenService],
})
export class VoiceListenModule {}
