import { ticketListQuerySchema, ticketTranscriptQuerySchema, updateTicketConfigSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class UpdateTicketConfigDto extends createZodDto(updateTicketConfigSchema) {}

export class TicketListQueryDto extends createZodDto(ticketListQuerySchema) {}

export class TicketTranscriptQueryDto extends createZodDto(ticketTranscriptQuerySchema) {}
