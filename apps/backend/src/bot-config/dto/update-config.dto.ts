import { updateConfigSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class UpdateConfigDto extends createZodDto(updateConfigSchema) {}
