import { logApplyAllSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class LogApplyAllDto extends createZodDto(logApplyAllSchema) {}
