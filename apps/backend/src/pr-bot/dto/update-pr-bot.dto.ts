import { updatePrBotSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class UpdatePrBotDto extends createZodDto(updatePrBotSchema) {}
