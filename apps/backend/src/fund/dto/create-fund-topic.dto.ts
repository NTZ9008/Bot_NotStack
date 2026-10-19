import { createFundTopicSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class CreateFundTopicDto extends createZodDto(createFundTopicSchema) {}
