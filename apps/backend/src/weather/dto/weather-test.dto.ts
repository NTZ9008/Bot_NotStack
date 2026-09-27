import { weatherTestSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class WeatherTestDto extends createZodDto(weatherTestSchema) {}
