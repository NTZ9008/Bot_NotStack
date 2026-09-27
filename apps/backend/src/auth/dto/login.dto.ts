import { loginSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class LoginDto extends createZodDto(loginSchema) {}
