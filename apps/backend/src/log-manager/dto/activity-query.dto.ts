import { activityQuerySchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class ActivityQueryDto extends createZodDto(activityQuerySchema) {}
