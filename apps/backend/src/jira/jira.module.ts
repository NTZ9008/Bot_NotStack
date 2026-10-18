import { Module } from '@nestjs/common';
import { JiraClient } from './clients/jira.client';
import { JiraController } from './jira.controller';
import { JiraService } from './jira.service';
import { JiraInteractionListener } from './listeners/jira-interaction.listener';

@Module({
    controllers: [JiraController],
    providers: [JiraClient, JiraService, JiraInteractionListener],
})
export class JiraModule {}
