import { updateFundPaymentSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class UpdateFundPaymentDto extends createZodDto(updateFundPaymentSchema) {}
