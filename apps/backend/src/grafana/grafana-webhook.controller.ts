import { Body, Controller, Headers, HttpStatus, Logger, Param, Post, Res } from '@nestjs/common';
import { isSnowflake } from '@notstack/shared';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { SignedWebhook } from '../auth/guards/csrf.guard';
import { GrafanaService } from './grafana.service';

@Public()
@SignedWebhook()
@Controller('webhook/grafana')
export class GrafanaWebhookController {
    private readonly logger = new Logger('GrafanaWebhook');
    constructor(private readonly grafana: GrafanaService) {}

    @Post()
    async legacy(@Body() rawBody: unknown, @Headers('authorization') authorization: unknown, @Res() response: Response): Promise<void> {
        await this.receive(this.grafanaHomeGuildId, rawBody, authorization, response);
    }

    @Post(':guildId')
    async guild(@Param('guildId') guildId: string, @Body() rawBody: unknown, @Headers('authorization') authorization: unknown, @Res() response: Response): Promise<void> {
        if (!isSnowflake(guildId)) {
            response.sendStatus(HttpStatus.NOT_FOUND);
            return;
        }
        await this.receive(guildId, rawBody, authorization, response);
    }

    private get grafanaHomeGuildId(): string {
        return this.grafana.homeGuildId;
    }

    private async receive(guildId: string, rawBody: unknown, authorization: unknown, response: Response): Promise<void> {
        if (!(await this.grafana.verifyWebhookAuthorization(guildId, authorization))) {
            this.logger.warn(`Rejected Grafana webhook with invalid authorization for guild ${guildId}`);
            response.sendStatus(HttpStatus.UNAUTHORIZED);
            return;
        }
        if (!Buffer.isBuffer(rawBody)) {
            response.status(HttpStatus.BAD_REQUEST).json({ error: 'Expected a JSON Alertmanager payload' });
            return;
        }
        let payload: unknown;
        try {
            payload = JSON.parse(rawBody.toString('utf8'));
        } catch {
            response.status(HttpStatus.BAD_REQUEST).json({ error: 'Invalid JSON payload' });
            return;
        }
        if (!payload || typeof payload !== 'object' || !['firing', 'resolved'].includes(String((payload as { status?: unknown }).status)) || !Array.isArray((payload as { alerts?: unknown }).alerts)) {
            response.status(HttpStatus.BAD_REQUEST).json({ error: 'Invalid Alertmanager payload' });
            return;
        }
        try {
            await this.grafana.sendAlert(guildId, payload as Parameters<GrafanaService['sendAlert']>[1]);
            response.sendStatus(HttpStatus.ACCEPTED);
        } catch (error) {
            this.grafana.logDeliveryError(error);
            response.status(HttpStatus.SERVICE_UNAVAILABLE).json({ error: 'Alert delivery is temporarily unavailable' });
        }
    }
}
