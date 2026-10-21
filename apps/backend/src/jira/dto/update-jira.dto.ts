import { updateJiraSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class UpdateJiraDto extends createZodDto(updateJiraSchema) {}
