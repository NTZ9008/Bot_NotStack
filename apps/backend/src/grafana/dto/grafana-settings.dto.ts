import { z } from 'zod';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class UpdateGrafanaSettingsDto extends createZodDto(z.object({
    defaultChannelId: z.string().max(25),
    labelChannels: z.record(z.string(), z.string().max(25)).refine((mapping) => Object.keys(mapping).length <= 50, 'At most 50 label mappings are allowed'),
})) {}

export class GrafanaStatsQueryDto extends createZodDto(z.object({
    days: z.coerce.number().int().min(1).max(30).default(7),
})) {}
