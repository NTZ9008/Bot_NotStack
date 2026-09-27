import { Module } from '@nestjs/common';
import { LevelsModule } from '../levels/levels.module';
import { WeatherModule } from '../weather/weather.module';
import { COMMANDS } from './commands.constants';
import { InteractionListener } from './listeners/interaction.listener';

@Module({
    imports: [LevelsModule, WeatherModule],
    providers: [...COMMANDS, InteractionListener],
})
export class CommandsModule {}
