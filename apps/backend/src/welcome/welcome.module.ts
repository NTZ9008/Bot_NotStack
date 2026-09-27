import { Module } from '@nestjs/common';
import { MemberJoinListener } from './listeners/member-join.listener';
import { WelcomeController } from './welcome.controller';
import { WelcomeRenderer } from './welcome.renderer';
import { WelcomeService } from './welcome.service';
import { WelcomeStore } from './welcome.store';

@Module({
    controllers: [WelcomeController],
    providers: [WelcomeStore, WelcomeRenderer, WelcomeService, MemberJoinListener],
})
export class WelcomeModule {}
