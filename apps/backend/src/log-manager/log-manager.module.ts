import { Global, Module } from '@nestjs/common';
import { ActivityController } from './controllers/activity.controller';
import { LogSettingsController } from './controllers/log-settings.controller';
import { LOG_LISTENERS } from './listeners';
import { ActivityStatsService } from './services/activity-stats.service';
import { ActivityService } from './services/activity.service';
import { LogDispatcher } from './services/log-dispatcher.service';
import { LogSettingsService } from './services/log-settings.service';

// Log Manager + Activity Log — โมดูลอื่นเรียก LogDispatcher เพื่อบันทึกเหตุการณ์ของตัวเองได้
@Global()
@Module({
    controllers: [LogSettingsController, ActivityController],
    providers: [ActivityService, ActivityStatsService, LogSettingsService, LogDispatcher, ...LOG_LISTENERS],
    exports: [ActivityService, LogSettingsService, LogDispatcher],
})
export class LogManagerModule {}
