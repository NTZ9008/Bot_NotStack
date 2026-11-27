import {
    reactionRoleItemInputSchema,
    reactionRolePanelInputSchema,
    updateReactionRoleItemSchema,
    updateReactionRolePanelSchema,
} from '@notstack/shared';
import { createZodDto } from '../../common/dto/create-zod-dto';

export class CreateReactionRolePanelDto extends createZodDto(reactionRolePanelInputSchema) {}

export class UpdateReactionRolePanelDto extends createZodDto(updateReactionRolePanelSchema) {}

export class CreateReactionRoleItemDto extends createZodDto(reactionRoleItemInputSchema) {}

export class UpdateReactionRoleItemDto extends createZodDto(updateReactionRoleItemSchema) {}
