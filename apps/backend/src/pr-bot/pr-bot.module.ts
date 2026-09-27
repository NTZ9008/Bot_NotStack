import { Module } from '@nestjs/common';
import { GithubWebhookController } from './controllers/github-webhook.controller';
import { PrBotSettingsController } from './controllers/pr-bot-settings.controller';
import { PrBotSettingsService } from './pr-bot-settings.service';
import { PrBotService } from './pr-bot.service';

@Module({
    controllers: [GithubWebhookController, PrBotSettingsController],
    providers: [PrBotSettingsService, PrBotService],
})
export class PrBotModule {}
