import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Response } from 'express';
import { Strategy } from 'passport-custom';
import type { AppRequest } from '../../common/interfaces/app-request.interface';
import { AuthConfig } from '../auth.config';
import { DISCORD_STRATEGY } from '../auth.constants';
import { DiscordOAuthService } from '../discord-oauth.service';
import { OAuthCallbackException } from '../exceptions/oauth-callback.exception';
import type { DiscordAuthResult } from '../interfaces/discord-profile.interface';

// ==========================================
// 🎮 DISCORD STRATEGY — ตรวจ callback ของ Discord OAuth (GET /api/auth/discord/callback)
// 1) state ต้องตรงกับ cookie ที่เซ็นไว้ตอนเริ่ม (กัน CSRF / login fixation) และใช้ได้ครั้งเดียว
// 2) แลก code เป็นข้อมูลผู้ใช้ Discord
// ผลลัพธ์ { flow, profile } ถูกใส่ไว้ที่ req.discordAuth — AuthService ตัดสินต่อว่าจะ login หรือผูกบัญชี
// ==========================================
@Injectable()
export class DiscordStrategy extends PassportStrategy(Strategy, DISCORD_STRATEGY) {
    private readonly logger = new Logger('Auth');

    constructor(
        private readonly cfg: AuthConfig,
        private readonly oauth: DiscordOAuthService,
    ) {
        super();
    }

    async validate(req: AppRequest): Promise<DiscordAuthResult> {
        const cookies = req.cookies as Record<string, string> | undefined;
        const flow = this.oauth.verifyState(cookies?.[this.cfg.cookie.oauthState], req.query.state);
        // cookie state ใช้ครั้งเดียว — ลบทิ้งทุกกรณี
        (req.res as Response | undefined)?.clearCookie(this.cfg.cookie.oauthState, this.oauthStateCookieOptions());

        if (!flow) throw new OAuthCallbackException('discord_state', null);
        if (req.query.error) throw new OAuthCallbackException('discord_denied', flow); // ผู้ใช้กดยกเลิกที่หน้า Discord
        if (typeof req.query.code !== 'string') throw new OAuthCallbackException('discord_failed', flow);

        try {
            return { flow, profile: await this.oauth.fetchProfile(req.query.code) };
        } catch (err) {
            this.logger.error(`Discord OAuth ล้มเหลว: ${(err as Error).message}`);
            throw new OAuthCallbackException('discord_failed', flow);
        }
    }

    // ต้องตรงกับตอนตั้ง cookie (AuthService.startDiscordFlow) ไม่งั้นเบราว์เซอร์ไม่ลบให้
    oauthStateCookieOptions() {
        return { httpOnly: true, secure: this.cfg.isProduction, sameSite: 'lax' as const, path: '/api/auth/discord' };
    }
}
