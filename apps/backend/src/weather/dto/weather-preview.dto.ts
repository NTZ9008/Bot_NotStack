import { weatherPreviewSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class WeatherPreviewDto extends createZodDto(weatherPreviewSchema) {}
