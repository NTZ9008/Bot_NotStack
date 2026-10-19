import { batchFundPaymentSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class BatchFundPaymentDto extends createZodDto(batchFundPaymentSchema) {}
