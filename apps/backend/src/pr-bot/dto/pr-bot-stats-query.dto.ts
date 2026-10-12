import { prBotStatsQuerySchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class PrBotStatsQueryDto extends createZodDto(prBotStatsQuerySchema) {}
