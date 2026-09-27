import { grantAccessSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class GrantAccessDto extends createZodDto(grantAccessSchema) {}
