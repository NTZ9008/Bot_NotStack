import { Global, Module } from '@nestjs/common';
import { PluginGuard } from './guards/plugin.guard';
import { PluginsController } from './plugins.controller';
import { PluginsService } from './plugins.service';

@Global()
@Module({
    controllers: [PluginsController],
    providers: [PluginsService, PluginGuard],
    exports: [PluginsService, PluginGuard],
})
export class PluginsModule {}
