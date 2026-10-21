import { updateFundMemberSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class UpdateFundMemberDto extends createZodDto(updateFundMemberSchema) {}
