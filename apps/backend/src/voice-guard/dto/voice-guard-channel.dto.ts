import { voiceGuardChannelSchema } from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class VoiceGuardChannelDto extends createZodDto(voiceGuardChannelSchema) {}
