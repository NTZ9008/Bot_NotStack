import { sendFundReportSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class SendFundReportDto extends createZodDto(sendFundReportSchema) {}
