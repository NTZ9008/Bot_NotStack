import { createUserSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class CreateUserDto extends createZodDto(createUserSchema) {}
