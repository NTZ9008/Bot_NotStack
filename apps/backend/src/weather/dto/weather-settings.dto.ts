import { weatherSettingsInputSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class WeatherSettingsDto extends createZodDto(weatherSettingsInputSchema) {}
