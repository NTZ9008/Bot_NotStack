import { customSummaryPdfRequestSchema, customSummaryRequestSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class CustomSummaryRequestDto extends createZodDto(customSummaryRequestSchema) {}
export class CustomSummaryPdfRequestDto extends createZodDto(customSummaryPdfRequestSchema) {}
