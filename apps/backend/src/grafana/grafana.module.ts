import { Module } from '@nestjs/common';
import { GrafanaWebhookController } from './grafana-webhook.controller';
import { GrafanaSettingsController } from './grafana-settings.controller';
import { GrafanaService } from './grafana.service';

@Module({ controllers: [GrafanaWebhookController, GrafanaSettingsController], providers: [GrafanaService], exports: [GrafanaService] })
export class GrafanaModule {}
