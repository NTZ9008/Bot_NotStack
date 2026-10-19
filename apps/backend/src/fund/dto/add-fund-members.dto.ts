import { addFundMembersSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class AddFundMembersDto extends createZodDto(addFundMembersSchema) {}
