import { updateFundTopicSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class UpdateFundTopicDto extends createZodDto(updateFundTopicSchema) {}
