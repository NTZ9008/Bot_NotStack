import { newsSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class SendNewsDto extends createZodDto(newsSchema) {}
