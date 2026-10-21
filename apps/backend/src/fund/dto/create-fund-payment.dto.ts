import { createFundPaymentSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class CreateFundPaymentDto extends createZodDto(createFundPaymentSchema) {}
