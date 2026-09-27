import { voiceGuardChannelDeleteSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class VoiceGuardChannelDeleteDto extends createZodDto(voiceGuardChannelDeleteSchema) {}
