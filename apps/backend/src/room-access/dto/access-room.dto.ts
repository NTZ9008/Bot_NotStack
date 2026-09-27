import { accessRoomSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class AccessRoomDto extends createZodDto(accessRoomSchema) {}
