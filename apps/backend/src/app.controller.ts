import { Controller, Get } from '@nestjs/common';
import type { AppInfo } from '@notstack/shared';
import { Public } from './common/decorators/public.decorator';
import { APP_VERSION } from './config/paths';
import { DiscordService } from './discord/discord.service';

// เวอร์ชันของระบบ + ชื่อ/รูปของบอท + ลิงก์เชิญ (แสดงที่เมนูซ้าย, หน้า landing, หน้า login และกรอบข้อความจำลองแบบ Discord)
@Controller('version')
export class AppController {
    constructor(private readonly discord: DiscordService) {}

    // หน้า login เรียกตอนยังไม่ได้ login — ต้องเปิดสาธารณะ ไม่งั้นได้ 401 แล้ว frontend จะล้าง session ทับหน้า login
    @Public()
    @Get()
    info(): AppInfo {
        const bot = this.discord.ready?.user;
        return {
            version: APP_VERSION,
            bot: bot ? { name: bot.displayName || bot.username, avatar: bot.displayAvatarURL({ size: 128 }) } : null,
            inviteUrl: this.discord.inviteUrl(),
        };
    }
}
