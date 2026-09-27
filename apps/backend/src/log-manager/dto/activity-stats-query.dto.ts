import { activityStatsQuerySchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class ActivityStatsQueryDto extends createZodDto(activityStatsQuerySchema) {}
