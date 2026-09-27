import { updateLogSettingSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class UpdateLogSettingDto extends createZodDto(updateLogSettingSchema) {}
