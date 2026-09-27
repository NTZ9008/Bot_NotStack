import { Module } from '@nestjs/common';
import { OpenWeatherClient } from './clients/openweather.client';
import { WeatherReportTask } from './tasks/weather-report.task';
import { WeatherController } from './weather.controller';
import { WeatherService } from './weather.service';

// รายงานสภาพอากาศประจำวัน (embed + กราฟ + เรดาร์) และข้อมูลอากาศของคำสั่ง /weather
@Module({
    controllers: [WeatherController],
    providers: [OpenWeatherClient, WeatherService, WeatherReportTask],
    exports: [OpenWeatherClient],
})
export class WeatherModule {}
