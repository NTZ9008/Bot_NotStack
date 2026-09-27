import { auditLogQuerySchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class AuditLogQueryDto extends createZodDto(auditLogQuerySchema) {}
