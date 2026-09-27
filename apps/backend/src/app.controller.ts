import { Controller, Get } from '@nestjs/common';
import type { AppInfo } from '@notstack/shared';
import { APP_VERSION } from './config/paths';
import { DiscordService } from './discord/discord.service';

// เวอร์ชันของระบบ + ชื่อ/รูปของบอท (แสดงที่เมนูซ้าย และกรอบข้อความจำลองแบบ Discord)
@Controller('version')
export class AppController {
    constructor(private readonly discord: DiscordService) {}

    @Get()
    info(): AppInfo {
        const bot = this.discord.ready?.user;
        return {
            version: APP_VERSION,
            bot: bot ? { name: bot.displayName || bot.username, avatar: bot.displayAvatarURL({ size: 128 }) } : null,
        };
    }
}
