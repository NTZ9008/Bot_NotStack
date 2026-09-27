import { welcomeCreateSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class WelcomeCreateDto extends createZodDto(welcomeCreateSchema) {}
