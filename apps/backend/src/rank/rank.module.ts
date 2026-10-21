import { Module } from '@nestjs/common';
import { LevelsModule } from '../levels/levels.module';
import { WelcomeModule } from '../welcome/welcome.module';
import { LevelUpService } from './level-up.service';
import { RankCardController } from './rank-card.controller';
import { RankCardRenderer } from './rank-card.renderer';
import { RankCardService } from './rank-card.service';
import { RankCardStore } from './rank-card.store';

// การ์ด /rank /leaderboard + ประกาศเลเวลอัป / ยศรางวัล (ใช้คลังรูปพื้นหลังร่วมกับการ์ดต้อนรับ)
@Module({
    imports: [LevelsModule, WelcomeModule],
    controllers: [RankCardController],
    providers: [RankCardStore, RankCardRenderer, RankCardService, LevelUpService],
    exports: [RankCardStore, RankCardService],
})
export class RankModule {}
