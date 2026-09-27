import { Global, Module } from '@nestjs/common';
import { BotConfigController } from './bot-config.controller';
import { BotConfigService } from './bot-config.service';

@Global()
@Module({
    controllers: [BotConfigController],
    providers: [BotConfigService],
    exports: [BotConfigService],
})
export class BotConfigModule {}
