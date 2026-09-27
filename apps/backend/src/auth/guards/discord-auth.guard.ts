import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DISCORD_STRATEGY } from '../auth.constants';
import { OAuthCallbackException } from '../exceptions/oauth-callback.exception';

// callback ของ Discord OAuth — ผลลัพธ์ใส่ที่ req.discordAuth (ไม่ทับ req.user ที่เป็นผู้ใช้ Dashboard)
@Injectable()
export class DiscordAuthGuard extends AuthGuard(DISCORD_STRATEGY) {
    override getAuthenticateOptions() {
        return { property: 'discordAuth', session: false };
    }

    override handleRequest<TUser>(err: unknown, user: TUser | false): TUser {
        if (err) throw err;
        if (!user) throw new OAuthCallbackException('discord_failed', null);
        return user;
    }
}
