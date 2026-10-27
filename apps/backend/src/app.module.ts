import fs from 'node:fs';
import path from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppController } from './app.controller';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BotConfigModule } from './bot-config/bot-config.module';
import { ChatModule } from './chat/chat.module';
import { CommandsModule } from './commands/commands.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';
import { validateEnv, type Env } from './config/env.validation';
import { ENV_FILES } from './config/paths';
import { DiscordModule } from './discord/discord.module';
import { FundModule } from './fund/fund.module';
import { GuildsModule } from './guilds/guilds.module';
import { GrowthController } from './growth/growth.controller';
import { GrowthService } from './growth/growth.service';
import { HealthController } from './health/health.controller';
import { JiraModule } from './jira/jira.module';
import { LevelsModule } from './levels/levels.module';
import { LiveModule } from './live/live.module';
import { LogFilesModule } from './log-files/log-files.module';
import { LogManagerModule } from './log-manager/log-manager.module';
import { MetricsService } from './monitoring/metrics.service';
import { NewsModule } from './news/news.module';
import { PrBotModule } from './pr-bot/pr-bot.module';
import { PrismaModule } from './prisma/prisma.module';
import { RankModule } from './rank/rank.module';
import { RoomAccessModule } from './room-access/room-access.module';
import { UsersModule } from './users/users.module';
import { VoiceGuardModule } from './voice-guard/voice-guard.module';
import { WeatherModule } from './weather/weather.module';
import { WelcomeModule } from './welcome/welcome.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ENV_FILES,
            // ทดสอบ/CI ส่งค่าผ่าน environment ตรงๆ ได้โดยไม่อ่านไฟล์ .env
            ignoreEnvFile: process.env.IGNORE_ENV_FILE === 'true',
            validate: validateEnv,
        }),
        ScheduleModule.forRoot(),
        // (ไม่บังคับ) เสิร์ฟหน้า Dashboard ที่ build แล้วจาก FRONTEND_DIST — ปกติหน้าเว็บ deploy แยก (Cloudflare Workers)
        // ทุก path ที่ไม่ใช่ /api หรือ /webhook ได้ index.html (SPA)
        ServeStaticModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>) => {
                const rootPath = config.get('FRONTEND_DIST', { infer: true });
                if (!rootPath || !fs.existsSync(path.join(rootPath, 'index.html'))) return [];
                return [
                    {
                        rootPath: path.resolve(rootPath),
                        exclude: ['/api/{*path}', '/webhook/{*path}'],
                        serveStaticOptions: {
                            // ไฟล์ใน assets/ มี hash ในชื่อ → cache ได้ยาว ส่วน index.html ต้องเช็คใหม่ทุกครั้ง
                            setHeaders: (res, filePath) => {
                                res.setHeader(
                                    'Cache-Control',
                                    filePath.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
                                );
                            },
                        },
                    },
                ];
            },
        }),
        // โครงสร้างพื้นฐาน
        PrismaModule,
        DiscordModule,
        AuditModule,
        AuthModule,
        UsersModule,
        GuildsModule,
        BotConfigModule,
        LogFilesModule,
        LiveModule,
        LogManagerModule,
        // ความสามารถของบอท (ตั้งค่าแยกต่อเซิร์ฟเวอร์)
        LevelsModule,
        RankModule,
        NewsModule,
        RoomAccessModule,
        VoiceGuardModule,
        WelcomeModule,
        WeatherModule,
        PrBotModule,
        JiraModule,
        FundModule,
        ChatModule,
        CommandsModule,
    ],
    controllers: [AppController, HealthController, GrowthController],
    providers: [MetricsService, GrowthService, { provide: APP_FILTER, useClass: HttpExceptionFilter }, { provide: APP_PIPE, useClass: ZodValidationPipe }],
})
export class AppModule {}
