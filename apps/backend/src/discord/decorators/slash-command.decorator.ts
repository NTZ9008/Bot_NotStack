import { DiscoveryService } from '@nestjs/core';

// ==========================================
// ⌨️ @SlashCommand() — คลาสที่เป็นคำสั่ง / ของบอท (ลงทะเบียนกับ Discord ด้วย pnpm discord:deploy-commands)
// คลาสต้องมี static data (SlashCommandBuilder) และเมธอด execute — ดู SlashCommandClass
// ==========================================
export const SlashCommand = DiscoveryService.createDecorator<void>();
