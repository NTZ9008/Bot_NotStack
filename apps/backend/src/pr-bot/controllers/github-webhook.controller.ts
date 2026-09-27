import { Body, Controller, Headers, HttpStatus, Logger, Param, Post, Res } from '@nestjs/common';
import { isSnowflake } from '@notstack/shared';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { PrBotService } from '../pr-bot.service';

// ==========================================
// GitHub webhook — อยู่นอก /api ไม่ต้อง login; ตรวจลายเซ็น HMAC แทน
//   POST /webhook/github/:guildId   (secret ของเซิร์ฟเวอร์นั้น ดูได้ที่หน้า PR Bot)
//   POST /webhook/github            (URL เดิม — เซิร์ฟเวอร์หลัก + GITHUB_WEBHOOK_SECRET ใน .env)
// body เป็น Buffer ดิบ (main.ts ตั้ง express.raw ให้ /webhook) เพื่อให้ verify signature ได้
// ==========================================
@Public()
@Controller('webhook/github')
export class GithubWebhookController {
    private readonly logger = new Logger('PrBot');

    constructor(private readonly prBot: PrBotService) {}

    @Post()
    legacy(@Body() rawBody: unknown, @Headers('x-hub-signature-256') signature: unknown, @Headers('x-github-event') event: unknown, @Res() res: Response) {
        return this.receive(this.prBot.homeGuildId, true, rawBody, signature, event, res);
    }

    @Post(':guildId')
    guild(
        @Param('guildId') guildId: string,
        @Body() rawBody: unknown,
        @Headers('x-hub-signature-256') signature: unknown,
        @Headers('x-github-event') event: unknown,
        @Res() res: Response,
    ) {
        if (!isSnowflake(guildId)) return void res.sendStatus(HttpStatus.NOT_FOUND);
        return this.receive(guildId, false, rawBody, signature, event, res);
    }

    private async receive(guildId: string, legacy: boolean, rawBody: unknown, signature: unknown, event: unknown, res: Response): Promise<void> {
        if (!Buffer.isBuffer(rawBody) || !(await this.prBot.verifySignature(guildId, rawBody, signature, legacy))) {
            res.sendStatus(HttpStatus.UNAUTHORIZED);
            return;
        }
        let payload: unknown;
        try {
            payload = JSON.parse(rawBody.toString('utf8'));
        } catch {
            res.sendStatus(HttpStatus.BAD_REQUEST);
            return;
        }

        res.sendStatus(HttpStatus.ACCEPTED); // ตอบก่อน แล้วค่อยทำงาน (GitHub timeout 10s)
        this.prBot.handle(guildId, String(event ?? ''), payload).catch((err: Error) => this.logger.error(`handler error: ${err.stack ?? err.message}`));
    }
}
