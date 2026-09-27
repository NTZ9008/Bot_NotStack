import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthConfig } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DiscordOAuthService } from './discord-oauth.service';
import { CsrfGuard } from './guards/csrf.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { DiscordStrategy } from './strategies/discord.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { AuthMaintenanceTask } from './tasks/auth-maintenance.task';
import { TokensService } from './tokens.service';

// guard ส่วนกลางทำงานตามลำดับที่ลงทะเบียน: กัน CSRF → ต้อง login (ยกเว้น @Public) → ตรวจ role (@AdminOnly)
@Global()
@Module({
    // secret ส่งตอนเซ็น/ตรวจแต่ละครั้ง (AuthConfig สุ่มให้ถ้าไม่ได้ตั้ง JWT_SECRET)
    imports: [PassportModule, JwtModule.register({})],
    controllers: [AuthController],
    providers: [
        AuthConfig,
        AuthService,
        TokensService,
        DiscordOAuthService,
        LocalStrategy,
        JwtStrategy,
        DiscordStrategy,
        AuthMaintenanceTask,
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
    ],
    exports: [AuthConfig, TokensService],
})
export class AuthModule {}
