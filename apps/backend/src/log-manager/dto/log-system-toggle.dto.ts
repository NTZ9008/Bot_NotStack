import { logSystemToggleSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class LogSystemToggleDto extends createZodDto(logSystemToggleSchema) {}
