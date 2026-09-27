import { welcomeRenameAssetSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class WelcomeRenameAssetDto extends createZodDto(welcomeRenameAssetSchema) {}
