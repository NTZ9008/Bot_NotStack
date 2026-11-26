import { Module } from '@nestjs/common';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';
import { ScheduledReminderTask } from './tasks/scheduled-reminder.task';

@Module({
    controllers: [RemindersController],
    providers: [RemindersService, ScheduledReminderTask],
    exports: [RemindersService],
})
export class RemindersModule {}
