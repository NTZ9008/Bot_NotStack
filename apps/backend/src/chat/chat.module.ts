import { Module } from '@nestjs/common';
import { LevelsModule } from '../levels/levels.module';
import { GeminiService } from './gemini.service';
import { MemberGreetingListener } from './listeners/member-greeting.listener';
import { MessageListener } from './listeners/message.listener';
import { ReactionRolesListener } from './listeners/reaction-roles.listener';
import { SecurityMonitorListener } from './listeners/security-monitor.listener';

// พฤติกรรมของบอทในแชท: ความปลอดภัย, คัดกรองข้อความ, AI Chat, ต้อนรับสมาชิก, reaction roles
@Module({
    imports: [LevelsModule],
    providers: [GeminiService, MessageListener, SecurityMonitorListener, MemberGreetingListener, ReactionRolesListener],
})
export class ChatModule {}
