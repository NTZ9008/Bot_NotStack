import { Module } from '@nestjs/common';
import { LevelsController } from './levels.controller';
import { LevelsService } from './levels.service';
import { VoiceXpTask } from './tasks/voice-xp.task';

@Module({
    controllers: [LevelsController],
    providers: [LevelsService, VoiceXpTask],
    exports: [LevelsService],
})
export class LevelsModule {}
