import { Module } from '@nestjs/common';
import { OpenWeatherClient } from './clients/openweather.client';
import { WeatherReportTask } from './tasks/weather-report.task';
import { WeatherController } from './weather.controller';
import { WeatherService } from './weather.service';

// รายงานสภาพอากาศประจำวัน (embed + กราฟ + เรดาร์) — คำสั่ง /weather ใช้รายงานแบบเดียวกัน
@Module({
    controllers: [WeatherController],
    providers: [OpenWeatherClient, WeatherService, WeatherReportTask],
    exports: [WeatherService],
})
export class WeatherModule {}
