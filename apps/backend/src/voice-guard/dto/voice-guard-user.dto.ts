import { voiceGuardUserSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class VoiceGuardUserDto extends createZodDto(voiceGuardUserSchema) {}
