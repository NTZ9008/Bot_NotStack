import { welcomeCardInputSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class WelcomeCardInputDto extends createZodDto(welcomeCardInputSchema) {}
