import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import type { PluginId } from '@notstack/shared';
import { PluginGuard } from '../guards/plugin.guard';

export const REQUIRE_PLUGIN_KEY = 'guild:require-plugin';

// ตรวจว่าเซิร์ฟเวอร์ติดตั้งปลั๊กอินที่กำหนดแล้วหรือยัง (ใช้คู่กับ @GuildRoute หรือบน WebhookController)
export const RequirePlugin = (pluginId: PluginId) => applyDecorators(SetMetadata(REQUIRE_PLUGIN_KEY, pluginId), UseGuards(PluginGuard));
