import { Module } from '@nestjs/common';
import { MemberJoinListener } from './listeners/member-join.listener';
import { MemberLeaveListener } from './listeners/member-leave.listener';
import { WelcomeController } from './welcome.controller';
import { WelcomeRenderer } from './welcome.renderer';
import { WelcomeService } from './welcome.service';
import { WelcomeStore } from './welcome.store';

@Module({
    controllers: [WelcomeController],
    providers: [WelcomeStore, WelcomeRenderer, WelcomeService, MemberJoinListener, MemberLeaveListener],
    // คลังรูปพื้นหลัง + ตัวโหลดรูปใช้ร่วมกับการ์ด Rank
    exports: [WelcomeStore, WelcomeRenderer],
})
export class WelcomeModule {}
