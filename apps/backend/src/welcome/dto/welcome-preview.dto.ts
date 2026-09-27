import { welcomePreviewSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class WelcomePreviewDto extends createZodDto(welcomePreviewSchema) {}
