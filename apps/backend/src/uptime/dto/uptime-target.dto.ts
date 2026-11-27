import { updateUptimeTargetSchema, uptimeTargetInputSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class CreateUptimeTargetDto extends createZodDto(uptimeTargetInputSchema) {}

export class UpdateUptimeTargetDto extends createZodDto(updateUptimeTargetSchema) {}
