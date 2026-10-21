import { Module } from '@nestjs/common';
import { LevelsModule } from '../levels/levels.module';
import { RankModule } from '../rank/rank.module';
import { WeatherModule } from '../weather/weather.module';
import { WelcomeModule } from '../welcome/welcome.module';
import { COMMANDS } from './commands.constants';
import { InteractionListener } from './listeners/interaction.listener';

@Module({
    imports: [LevelsModule, RankModule, WelcomeModule, WeatherModule],
    providers: [...COMMANDS, InteractionListener],
})
export class CommandsModule {}
