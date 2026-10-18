import { jiraTicketQuerySchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class JiraTicketQueryDto extends createZodDto(jiraTicketQuerySchema) {}
