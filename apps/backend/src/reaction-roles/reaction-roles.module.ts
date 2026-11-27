import { Module } from '@nestjs/common';
import { ReactionRoleInteractionListener } from './listeners/reaction-role-interaction.listener';
import { ReactionRolesController } from './reaction-roles.controller';
import { ReactionRolesService } from './reaction-roles.service';

@Module({
    controllers: [ReactionRolesController],
    providers: [ReactionRolesService, ReactionRoleInteractionListener],
    exports: [ReactionRolesService],
})
export class ReactionRolesModule {}
