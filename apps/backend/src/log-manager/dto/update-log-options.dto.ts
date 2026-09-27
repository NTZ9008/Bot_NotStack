import { updateLogOptionsSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class UpdateLogOptionsDto extends createZodDto(updateLogOptionsSchema) {}
