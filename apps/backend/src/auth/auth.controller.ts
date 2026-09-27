import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { AuthProviders, LoginResponse, MeResponse, SuccessResponse } from '@notstack/shared';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AppRequest } from '../common/interfaces/app-request.interface';
import type { User } from '../generated/prisma/client';
import { publicUser } from '../users/user.mapper';
import { AuthConfig } from './auth.config';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { OAuthRedirectFilter } from './filters/oauth-redirect.filter';
import { DiscordAuthGuard } from './guards/discord-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { AuthRateLimitGuard, LoginRateLimitGuard } from './guards/rate-limit.guard';
import type { DiscordAuthResult } from './interfaces/discord-profile.interface';

// ==========================================
// 🔑 AUTH API — /api/auth/*
// login ด้วย username/password หรือ Discord OAuth → ได้ access token (JWT) + refresh token เป็น httpOnly cookie
// ==========================================
@Controller('auth')
export class AuthController {
    constructor(
        private readonly cfg: AuthConfig,
        private readonly auth: AuthService,
    ) {}

    // ช่องทาง login ที่เปิดใช้ (หน้า login ใช้ตัดสินใจว่าจะแสดงปุ่ม Discord หรือไม่)
    @Public()
    @Get('providers')
    providers(): AuthProviders {
        return { password: true, discord: this.cfg.discord.enabled };
    }

    // body ถูกตรวจซ้ำด้วย LoginDto (strategy ตรวจไปก่อนแล้ว) — req.user คือผู้ใช้ที่ LocalStrategy ยืนยันแล้ว
    @Public()
    @UseGuards(LoginRateLimitGuard, LocalAuthGuard)
    @Post('login')
    @HttpCode(HttpStatus.OK)
    login(@Body() _body: LoginDto, @CurrentUser() user: User, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response): Promise<LoginResponse> {
        return this.auth.completePasswordLogin(req, res, user);
    }

    @Public()
    @UseGuards(AuthRateLimitGuard)
    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    refresh(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response): Promise<LoginResponse> {
        return this.auth.refresh(req, res);
    }

    @Public()
    @Post('logout')
    @HttpCode(HttpStatus.OK)
    logout(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response): Promise<SuccessResponse> {
        return this.auth.logout(req, res);
    }

    @Post('logout-all')
    @HttpCode(HttpStatus.OK)
    logoutAll(@CurrentUser() user: User, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response): Promise<SuccessResponse> {
        return this.auth.logoutAll(user, req, res);
    }

    @Get('me')
    me(@CurrentUser() user: User): MeResponse {
        return { user: publicUser(user), discordEnabled: this.cfg.discord.enabled };
    }

    @UseGuards(LoginRateLimitGuard)
    @Post('password')
    @HttpCode(HttpStatus.OK)
    changePassword(
        @Body() body: ChangePasswordDto,
        @CurrentUser() user: User,
        @Req() req: AppRequest,
        @Res({ passthrough: true }) res: Response,
    ): Promise<SuccessResponse> {
        return this.auth.changePassword(user, body, req, res);
    }

    // --- Discord OAuth2 ---
    @Public()
    @UseGuards(AuthRateLimitGuard)
    @Get('discord')
    discordLogin(@Res() res: Response): void {
        if (!this.cfg.discord.enabled) return res.redirect(this.cfg.dashboardPath('/login?error=discord_disabled'));
        this.auth.startDiscordFlow(res, 'login');
    }

    // เปิดจากหน้า My Account (ลิงก์ธรรมดา) — cookie ของ session ถูกส่งมาด้วย จึงรู้ว่าจะผูกกับบัญชีไหน
    @Public()
    @UseGuards(AuthRateLimitGuard)
    @Get('discord/link')
    discordLink(@Req() req: AppRequest, @Res() res: Response): void {
        if (!req.user) return res.redirect(this.cfg.dashboardPath('/login'));
        if (!this.cfg.discord.enabled) return res.redirect(this.cfg.dashboardPath('/account?discord_error=discord_disabled'));
        this.auth.startDiscordFlow(res, 'link', req.user.id);
    }

    @Public()
    @UseGuards(AuthRateLimitGuard, DiscordAuthGuard)
    @UseFilters(OAuthRedirectFilter)
    @Get('discord/callback')
    async discordCallback(@Req() req: AppRequest & { discordAuth: DiscordAuthResult }, @Res() res: Response): Promise<void> {
        const next = await this.auth.completeDiscordFlow(req, res, req.discordAuth);
        res.redirect(this.cfg.dashboardPath(next));
    }

    @Post('discord/unlink')
    @HttpCode(HttpStatus.OK)
    discordUnlink(@CurrentUser() user: User, @Req() req: AppRequest): Promise<SuccessResponse> {
        return this.auth.unlinkDiscord(user, req);
    }
}
