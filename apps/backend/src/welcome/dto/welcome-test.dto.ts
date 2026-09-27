import { welcomeTestSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class WelcomeTestDto extends createZodDto(welcomeTestSchema) {}
