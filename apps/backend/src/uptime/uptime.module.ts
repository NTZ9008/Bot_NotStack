import { Module } from '@nestjs/common';
import { UptimeMonitorTask } from './tasks/uptime-monitor.task';
import { UptimeController } from './uptime.controller';
import { UptimeService } from './uptime.service';

@Module({
    controllers: [UptimeController],
    providers: [UptimeService, UptimeMonitorTask],
    exports: [UptimeService],
})
export class UptimeModule {}
